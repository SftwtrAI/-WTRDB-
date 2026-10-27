import { logger } from "../../utils/logger";
import {
  executionStorage,
  eventStorage,
  apiKeyStorage,
  containerStorage,
} from "./task-storage";
import { openclawBridge } from "./openclaw-bridge";
import { buildSystemPrompt, buildUserPrompt, buildToolsConfig } from "./openclaw-prompt-builder";
import { taskQueue } from "./task-queue";
import * as taskService from "./task-service";
import type {
  TaskExecution,
  InsertTaskExecution,
  TaskExecutionEvent,
} from "@wtrops/shared";
import { EventEmitter } from "events";
import crypto from "crypto";

const SOURCE = "ExecutionService";

// SSE event emitter for live streaming to clients
export const executionEvents = new EventEmitter();
executionEvents.setMaxListeners(100);

// AES-256 encryption for API keys
const ENCRYPTION_SECRET =
  process.env.TASK_API_KEY_ENCRYPTION_SECRET ||
  "0".repeat(64);

function decryptApiKey(encrypted: string): string {
  try {
    const parts = encrypted.split(":");
    if (parts.length !== 3) return encrypted; // Not encrypted, return as-is
    const [ivHex, authTagHex, cipherHex] = parts;
    const key = Buffer.from(ENCRYPTION_SECRET, "hex");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(cipherHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return encrypted; // If decryption fails, return as-is
  }
}

export function encryptApiKey(plaintext: string): string {
  const key = Buffer.from(ENCRYPTION_SECRET, "hex");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Queue a new task execution.
 */
export async function queueExecution(
  userId: string,
  data: Omit<InsertTaskExecution, "userId">,
): Promise<TaskExecution> {
  const execution = await executionStorage.create({ ...data, userId });
  logger.info(
    SOURCE,
    `Queued execution ${execution.id} for template ${data.templateId}`,
  );

  // Emit initial event
  await addEvent(execution.id, "status_change", {
    from: null,
    to: "queued",
  });

  // Add to queue for processing
  taskQueue.addJob(execution.id, userId);

  return execution;
}

/**
 * Process a queued execution — called by the task queue.
 * Spins up an ephemeral OpenClaw Docker container to run the AI task.
 */
export async function processExecution(executionId: string): Promise<void> {
  const execution = await executionStorage.getById(executionId);
  if (!execution) {
    logger.error(SOURCE, `Execution ${executionId} not found`);
    return;
  }

  // Update status to starting
  await executionStorage.updateStatus(executionId, "starting", {
    startedAt: new Date(),
  });
  await addEvent(executionId, "status_change", {
    from: "queued",
    to: "starting",
  });

  try {
    // Get the template version
    const version = await taskService.getVersion(execution.versionId);
    if (!version) throw new Error("Template version not found");

    // Get the API key
    if (!execution.apiKeyId) throw new Error("No API key specified");
    const apiKeyRecord = await apiKeyStorage.getById(execution.apiKeyId);
    if (!apiKeyRecord) throw new Error("API key not found");

    const decryptedKey = decryptApiKey(apiKeyRecord.apiKey);

    // Update API key last used
    await apiKeyStorage.updateLastUsed(apiKeyRecord.id);

    // Build prompts
    const inputData = (execution.inputData as Record<string, any>) || {};
    const systemPrompt = buildSystemPrompt(version, inputData);
    const userPrompt = buildUserPrompt(version, inputData);
    const toolsConfig = buildToolsConfig(version);

    // Start OpenClaw Docker container
    await addEvent(executionId, "thought", { text: "Starting OpenClaw container..." });

    const containerRecord = await openclawBridge.createContainer(
      executionId,
      execution.userId,
      decryptedKey,
      apiKeyRecord.provider,
      apiKeyRecord.model || undefined,
      apiKeyRecord.baseUrl || undefined,
    );

    await addEvent(executionId, "status_change", {
      from: "starting",
      to: "running",
    });
    await executionStorage.updateStatus(executionId, "running");

    await addEvent(executionId, "thought", { text: "Container ready. Sending prompt to OpenClaw..." });

    const rawOutput = await openclawBridge.sendPrompt(
      containerRecord.port!,
      executionId,
      systemPrompt,
      userPrompt,
      toolsConfig,
      async (event) => {
        await addEvent(executionId, event.type, event.data);
      },
    );

    // Destroy container after completion
    const latestContainer = await containerStorage.getByExecution(executionId);
    if (latestContainer) {
      await openclawBridge.destroyContainer(latestContainer);
    }

    // Complete the execution
    await executionStorage.setOutput(executionId, { result: rawOutput }, rawOutput, {
      completedAt: new Date().toISOString(),
      provider: apiKeyRecord.provider,
      model: apiKeyRecord.model,
    });
    await addEvent(executionId, "status_change", {
      from: "running",
      to: "completed",
    });

    logger.info(SOURCE, `Execution ${executionId} completed successfully`);
  } catch (err: any) {
    logger.error(
      SOURCE,
      `Execution ${executionId} failed: ${err.message}`,
    );
    await executionStorage.setError(executionId, err.message);
    await addEvent(executionId, "error", { message: err.message });
    await addEvent(executionId, "status_change", {
      from: "running",
      to: "failed",
    });

    // Cleanup container on failure (if one was created)
    const containerRecord =
      await containerStorage.getByExecution(executionId);
    if (containerRecord) {
      await openclawBridge.destroyContainer(containerRecord);
    }
  }
}

/**
 * Cancel a running execution.
 */
export async function cancelExecution(
  executionId: string,
  userId: string,
): Promise<TaskExecution | null> {
  const execution = await executionStorage.getById(executionId);
  if (!execution || execution.userId !== userId) return null;

  // Destroy container if running
  const containerRecord =
    await containerStorage.getByExecution(executionId);
  if (containerRecord) {
    await openclawBridge.destroyContainer(containerRecord);
  }

  const updated = await executionStorage.cancel(executionId);
  await addEvent(executionId, "status_change", {
    from: execution.status,
    to: "cancelled",
  });

  logger.info(SOURCE, `Execution ${executionId} cancelled`);
  return updated;
}

/**
 * Get an execution by ID.
 */
export async function getExecution(
  id: string,
): Promise<TaskExecution | null> {
  return executionStorage.getById(id);
}

/**
 * Get user's executions.
 */
export async function getUserExecutions(
  userId: string,
  limit?: number,
  offset?: number,
  status?: string,
): Promise<TaskExecution[]> {
  return executionStorage.getByUser(userId, limit, offset, status);
}

/**
 * Get execution events for live monitoring.
 */
export async function getExecutionEvents(
  executionId: string,
  afterTimestamp?: Date,
): Promise<TaskExecutionEvent[]> {
  return eventStorage.getByExecution(executionId, afterTimestamp);
}

/**
 * Add an event and broadcast via SSE.
 */
async function addEvent(
  executionId: string,
  eventType: string,
  data: any,
): Promise<void> {
  // Build the event shape that SSE clients expect
  const event = {
    executionId,
    eventType,
    data,
    timestamp: new Date(),
  };

  // Broadcast to SSE listeners IMMEDIATELY (before DB write)
  executionEvents.emit(`execution:${executionId}`, event);

  // Persist to DB in background — don't block real-time delivery
  eventStorage.create(event).catch((err) => {
    logger.error(SOURCE, `Failed to persist event: ${err.message}`);
  });
}

/**
 * Initialize the execution processor.
 */
export function initExecutionProcessor(): void {
  taskQueue.setProcessor(async (job) => {
    await processExecution(job.executionId);
  });
  logger.info(SOURCE, "Execution processor initialized");
}
