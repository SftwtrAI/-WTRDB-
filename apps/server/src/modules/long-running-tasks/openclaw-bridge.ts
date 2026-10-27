import Dockerode from "dockerode";
import crypto from "crypto";
import fs from "fs";
import { logger } from "../../utils/logger";
import { containerStorage } from "./task-storage";
import type { TaskContainer } from "@wtrops/shared";
import { EventEmitter } from "events";

const SOURCE = "OpenClawBridge";

const OPENCLAW_IMAGE =
  process.env.OPENCLAW_DOCKER_IMAGE || "coollabsio/openclaw:latest";
const PORT_RANGE_START = parseInt(
  process.env.OPENCLAW_PORT_RANGE_START || "8100",
);
const PORT_RANGE_END = parseInt(process.env.OPENCLAW_PORT_RANGE_END || "8199");
const MAX_CONTAINERS_GLOBAL = parseInt(
  process.env.OPENCLAW_MAX_CONTAINERS_GLOBAL || "20",
);
const MAX_CONTAINERS_PER_USER = parseInt(
  process.env.OPENCLAW_MAX_CONTAINERS_PER_USER || "3",
);
const CONTAINER_MEMORY_LIMIT =
  process.env.OPENCLAW_CONTAINER_MEMORY_LIMIT || "2g";
const CONTAINER_CPU_LIMIT = parseFloat(
  process.env.OPENCLAW_CONTAINER_CPU_LIMIT || "1.0",
);
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || "/tmp/openclaw-tasks";
// OpenClaw gateway startup can take 60-90s on first boot
const HEALTH_TIMEOUT_MS = parseInt(
  process.env.OPENCLAW_HEALTH_TIMEOUT_MS || "120000",
);

export interface OpenClawEvent {
  type: string;
  data: any;
  timestamp: Date;
}

/** Per-container metadata we track alongside the DB record */
interface ContainerMeta {
  gatewayToken: string;
  provider: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export class OpenClawBridge extends EventEmitter {
  private docker: Dockerode;
  private usedPorts: Set<number> = new Set();
  private imagePulled = false;
  /** Container metadata keyed by executionId */
  private containerMeta: Map<string, ContainerMeta> = new Map();

  constructor() {
    super();
    this.docker = new Dockerode({ socketPath: "/var/run/docker.sock" });
  }

  /**
   * Pull the OpenClaw image if not already cached.
   */
  async ensureImage(): Promise<void> {
    if (this.imagePulled) return;

    try {
      const images = await this.docker.listImages({
        filters: { reference: [OPENCLAW_IMAGE] },
      });
      if (images.length > 0) {
        this.imagePulled = true;
        logger.info(SOURCE, `Image ${OPENCLAW_IMAGE} already present`);
        return;
      }

      logger.info(SOURCE, `Pulling image ${OPENCLAW_IMAGE}...`);
      const stream = await this.docker.pull(OPENCLAW_IMAGE);
      await new Promise<void>((resolve, reject) => {
        this.docker.modem.followProgress(stream, (err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.imagePulled = true;
      logger.info(SOURCE, `Image ${OPENCLAW_IMAGE} pulled successfully`);
    } catch (err: any) {
      logger.error(SOURCE, `Failed to pull image: ${err.message}`);
      throw err;
    }
  }

  /**
   * Allocate a free port from the configured range.
   */
  private allocatePort(): number {
    for (let p = PORT_RANGE_START; p <= PORT_RANGE_END; p++) {
      if (!this.usedPorts.has(p)) {
        this.usedPorts.add(p);
        return p;
      }
    }
    throw new Error("No free ports available for OpenClaw container");
  }

  private releasePort(port: number): void {
    this.usedPorts.delete(port);
  }

  /**
   * Check concurrency limits before spawning.
   */
  async checkLimits(userId: string): Promise<void> {
    const globalRunning = await containerStorage.getRunning();
    if (globalRunning.length >= MAX_CONTAINERS_GLOBAL) {
      throw new Error(
        `Global container limit reached (${MAX_CONTAINERS_GLOBAL})`,
      );
    }

    const userRunning = await containerStorage.getRunningByUser(userId);
    if (userRunning.length >= MAX_CONTAINERS_PER_USER) {
      throw new Error(
        `Per-user container limit reached (${MAX_CONTAINERS_PER_USER})`,
      );
    }
  }

  /**
   * Spin up an ephemeral OpenClaw container for a task execution.
   */
  async createContainer(
    executionId: string,
    userId: string,
    apiKey: string,
    provider: string,
    model?: string,
    baseUrl?: string,
  ): Promise<TaskContainer> {
    await this.checkLimits(userId);
    await this.ensureImage();

    const port = this.allocatePort();

    // Generate a unique gateway token for this container
    const gatewayToken = crypto.randomBytes(32).toString("hex");
    this.containerMeta.set(executionId, {
      gatewayToken,
      provider,
      apiKey,
      model,
      baseUrl,
    });

    // Ensure data dir exists for this execution
    const execDataDir = `${DATA_DIR}/${executionId}`;
    fs.mkdirSync(execDataDir, { recursive: true });

    // Create DB record
    const containerRecord = await containerStorage.create({
      executionId,
      userId,
      imageTag: OPENCLAW_IMAGE,
      resourceLimits: {
        memory: CONTAINER_MEMORY_LIMIT,
        cpu: CONTAINER_CPU_LIMIT,
      },
    });

    try {
      // Build env vars based on provider
      const envVars = this.buildEnvVars(provider, apiKey, model, baseUrl, gatewayToken);

      // Parse memory limit for Docker
      const memoryBytes = this.parseMemoryLimit(CONTAINER_MEMORY_LIMIT);

      const container = await this.docker.createContainer({
        Image: OPENCLAW_IMAGE,
        name: `openclaw-${executionId.slice(0, 12)}`,
        Env: envVars,
        ExposedPorts: { "8080/tcp": {} },
        HostConfig: {
          PortBindings: {
            "8080/tcp": [{ HostPort: String(port) }],
          },
          Memory: memoryBytes,
          NanoCpus: Math.floor(CONTAINER_CPU_LIMIT * 1e9),
          AutoRemove: false,
          Binds: [`${execDataDir}:/data:rw`],
          // Add "browser" host so nginx doesn't crash on missing upstream
          ExtraHosts: ["browser:127.0.0.1"],
        },
        Labels: {
          "openclaw.execution_id": executionId,
          "openclaw.user_id": userId,
          "openclaw.managed": "true",
        },
      });

      await containerStorage.updateStatus(containerRecord.id, "starting", {
        containerId: container.id,
        port,
      });

      await container.start();

      logger.info(
        SOURCE,
        `Container ${container.id.slice(0, 12)} starting on port ${port} for execution ${executionId}...`,
      );

      // Wait for health check — OpenClaw needs time to boot gateway
      await this.waitForHealth(port, HEALTH_TIMEOUT_MS);

      await containerStorage.updateStatus(containerRecord.id, "running", {
        startedAt: new Date(),
      });

      logger.info(
        SOURCE,
        `Container ${container.id.slice(0, 12)} healthy on port ${port} for execution ${executionId}`,
      );

      return (await containerStorage.getById(containerRecord.id))!;
    } catch (err: any) {
      this.releasePort(port);
      this.containerMeta.delete(executionId);
      await containerStorage.updateStatus(containerRecord.id, "error", {
        errorMessage: err.message,
      });
      logger.error(
        SOURCE,
        `Failed to create container for execution ${executionId}: ${err.message}`,
      );
      throw err;
    }
  }

  /**
   * Build environment variables for the OpenClaw container.
   * Defaults to OpenAI Codex (codex5.3) when no model is specified.
   */
  private buildEnvVars(
    provider: string,
    apiKey: string,
    model?: string,
    baseUrl?: string,
    gatewayToken?: string,
  ): string[] {
    const env: string[] = [];

    // Required gateway token
    if (gatewayToken) {
      env.push(`OPENCLAW_GATEWAY_TOKEN=${gatewayToken}`);
    }

    // Performance optimizations for container mode
    env.push("OPENCLAW_NO_RESPAWN=1");

    // Default models per provider — Codex for OpenAI
    const defaultModels: Record<string, string> = {
      openai: "codex5.3",
      anthropic: "claude-sonnet-4-20250514",
      google: "gemini-2.0-flash",
      deepseek: "deepseek-chat",
    };

    switch (provider) {
      case "openai":
        env.push(`OPENAI_API_KEY=${apiKey}`);
        env.push(`OPENAI_MODEL=${model || defaultModels.openai}`);
        break;
      case "anthropic":
        env.push(`ANTHROPIC_API_KEY=${apiKey}`);
        env.push(`ANTHROPIC_MODEL=${model || defaultModels.anthropic}`);
        break;
      case "google":
        env.push(`GEMINI_API_KEY=${apiKey}`);
        env.push(`GOOGLE_MODEL=${model || defaultModels.google}`);
        break;
      case "deepseek":
        env.push(`OPENAI_API_KEY=${apiKey}`);
        env.push(`OPENAI_BASE_URL=https://api.deepseek.com`);
        env.push(`OPENAI_MODEL=${model || defaultModels.deepseek}`);
        break;
      case "custom":
        env.push(`OPENAI_API_KEY=${apiKey}`);
        if (baseUrl) env.push(`OPENAI_BASE_URL=${baseUrl}`);
        env.push(`OPENAI_MODEL=${model || defaultModels.openai}`);
        break;
    }

    return env;
  }

  /**
   * Parse memory limit string (e.g., "2g", "512m") to bytes.
   */
  private parseMemoryLimit(limit: string): number {
    const match = limit.match(/^(\d+)(g|m|k)?$/i);
    if (!match) return 2 * 1024 * 1024 * 1024; // default 2GB
    const num = parseInt(match[1]);
    const unit = (match[2] || "b").toLowerCase();
    switch (unit) {
      case "g":
        return num * 1024 * 1024 * 1024;
      case "m":
        return num * 1024 * 1024;
      case "k":
        return num * 1024;
      default:
        return num;
    }
  }

  /**
   * Wait for the container's gateway to become healthy.
   * OpenClaw gateway can take 60-90s to fully start.
   * We check /healthz — nginx returns a fallback JSON while gateway boots,
   * once gateway is up it returns the control UI (HTTP 200).
   * We verify the gateway is truly ready by checking that the response is NOT
   * the nginx fallback (which contains "gateway":"starting").
   */
  private async waitForHealth(
    port: number,
    timeoutMs = 120000,
  ): Promise<void> {
    const start = Date.now();
    let lastError = "";
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`http://localhost:${port}/healthz`, {
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const text = await res.text();
          // nginx fallback while gateway boots returns: {"ok":true,"gateway":"starting"}
          // Once the actual gateway is running, it returns the control UI HTML
          if (!text.includes('"gateway":"starting"')) {
            logger.info(SOURCE, `Container on port ${port} is healthy (took ${Date.now() - start}ms)`);
            return;
          }
          // Gateway still booting, keep waiting
        }
      } catch (err: any) {
        lastError = err.message;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`Container health check timed out after ${timeoutMs}ms (last error: ${lastError})`);
  }

  /**
   * Configure auth, model, and system prompt inside the container.
   * Called after the container is healthy, before sending prompts.
   */
  private async configureContainer(
    containerId: string,
    provider: string,
    apiKey: string,
    model?: string,
    systemPrompt?: string,
  ): Promise<void> {
    const containerRef = this.docker.getContainer(containerId);

    // Map provider names to OpenClaw provider ids
    const providerMap: Record<string, string> = {
      openai: "openai",
      anthropic: "anthropic",
      google: "google",
      deepseek: "openai", // DeepSeek uses OpenAI-compatible API
      custom: "openai",
    };

    const openclawProvider = providerMap[provider] || "openai";
    const profileId = `${openclawProvider}:manual`;

    // Write auth-profiles.json for the main agent (base64 to avoid shell escaping issues)
    const authProfiles = JSON.stringify({
      profiles: {
        [profileId]: {
          type: "api_key",
          provider: openclawProvider,
          key: apiKey,
        },
      },
    });
    const authB64 = Buffer.from(authProfiles).toString("base64");

    await this.execInContainer(containerRef, [
      "bash", "-c",
      `mkdir -p /root/.openclaw/agents/main/agent && echo '${authB64}' | base64 -d > /root/.openclaw/agents/main/agent/auth-profiles.json`,
    ]);

    // Determine model string — OpenClaw uses provider/model format
    const defaultModels: Record<string, string> = {
      openai: "codex5.3",
      anthropic: "claude-sonnet-4-20250514",
      google: "gemini-2.0-flash",
      deepseek: "deepseek-chat",
    };
    const resolvedModel = model || defaultModels[provider] || "codex5.3";
    const fullModelId = `${openclawProvider}/${resolvedModel}`;

    // Set the model via openclaw CLI
    await this.execInContainer(containerRef, [
      "openclaw", "models", "set", fullModelId,
    ]);

    // If DeepSeek or custom base URL, set it in config
    if (provider === "deepseek") {
      await this.execInContainer(containerRef, [
        "openclaw", "config", "set", "providers.openai.baseUrl", "https://api.deepseek.com",
      ]);
    }

    // Write system prompt as SOUL.md in workspace for the agent to pick up
    if (systemPrompt) {
      const soulB64 = Buffer.from(systemPrompt).toString("base64");
      await this.execInContainer(containerRef, [
        "bash", "-c",
        `echo '${soulB64}' | base64 -d > /data/workspace/SOUL.md`,
      ]);
    }

    logger.info(SOURCE, `Configured container ${containerId.slice(0, 12)} with ${fullModelId}`);
  }

  /**
   * Execute a command inside a container and return stdout.
   */
  private async execInContainer(
    container: Dockerode.Container,
    cmd: string[],
    timeoutMs = 30000,
  ): Promise<string> {
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
    });

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Container exec timed out")), timeoutMs);

      exec.start({ hijack: true, stdin: false }, (err: any, stream: any) => {
        if (err) {
          clearTimeout(timer);
          return reject(err);
        }

        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          clearTimeout(timer);
          const raw = Buffer.concat(chunks).toString("utf8");
          // Docker multiplexed stream: strip 8-byte frame headers
          const cleaned = raw.replace(/[\x00-\x08]/g, "").trim();
          resolve(cleaned);
        });
        stream.on("error", (e: any) => {
          clearTimeout(timer);
          reject(e);
        });
      });
    });
  }

  /**
   * Execute a command inside a container with real-time line streaming.
   * Calls onChunk for each complete line as it arrives from stdout.
   * Still returns the full accumulated output on completion.
   */
  private async execInContainerStreaming(
    container: Dockerode.Container,
    cmd: string[],
    onChunk: (line: string) => void,
    timeoutMs = 30000,
  ): Promise<string> {
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
    });

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Container exec timed out")), timeoutMs);

      exec.start({ hijack: true, stdin: false }, (err: any, stream: any) => {
        if (err) {
          clearTimeout(timer);
          return reject(err);
        }

        const chunks: Buffer[] = [];
        let lineBuffer = "";

        stream.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          // Strip Docker multiplexed stream frame headers and decode
          const text = chunk.toString("utf8").replace(/[\x00-\x08]/g, "");
          lineBuffer += text;

          // Emit complete lines as they arrive
          const lines = lineBuffer.split("\n");
          // Keep the last element (incomplete line) in the buffer
          lineBuffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              onChunk(trimmed);
            }
          }
        });

        stream.on("end", () => {
          clearTimeout(timer);
          // Flush any remaining partial line
          const remaining = lineBuffer.trim();
          if (remaining) {
            onChunk(remaining);
          }
          const raw = Buffer.concat(chunks).toString("utf8");
          const cleaned = raw.replace(/[\x00-\x08]/g, "").trim();
          resolve(cleaned);
        });

        stream.on("error", (e: any) => {
          clearTimeout(timer);
          reject(e);
        });
      });
    });
  }

  /**
   * Send a prompt to the OpenClaw container via the `openclaw agent` CLI.
   * The gateway communicates over WebSocket; the CLI is the correct interface.
   */
  async sendPrompt(
    port: number,
    executionId: string,
    systemPrompt: string,
    userPrompt: string,
    toolsConfig: Record<string, any>,
    onEvent: (event: OpenClawEvent) => void,
  ): Promise<string> {
    // Find the container by execution ID
    const containers = await this.docker.listContainers({
      filters: { label: [`openclaw.execution_id=${executionId}`] },
    });
    if (containers.length === 0) {
      throw new Error(`No container found for execution ${executionId}`);
    }
    const containerRef = this.docker.getContainer(containers[0].Id);

    // Configure auth, model, and system prompt inside the container
    const meta = this.containerMeta.get(executionId);
    if (meta) {
      await this.configureContainer(
        containers[0].Id,
        meta.provider,
        meta.apiKey,
        meta.model,
        systemPrompt,
      );
    }

    onEvent({
      type: "thought",
      data: { text: "Running agent inside OpenClaw container..." },
      timestamp: new Date(),
    });

    // Build the agent command — use a unique session per execution
    const agentTimeout = parseInt(process.env.OPENCLAW_AGENT_TIMEOUT || "600");
    const cmd = [
      "openclaw", "agent",
      "--session-id", executionId,
      "--message", userPrompt,
      "--json",
      "--timeout", String(agentTimeout),
    ];

    logger.info(SOURCE, `Sending prompt to container for execution ${executionId} (timeout: ${agentTimeout}s)`);

    // Stream agent output line-by-line, emitting events in real-time
    let lastTextEventTime = 0;
    const THROTTLE_MS = 3000;

    const handleChunk = (line: string) => {
      // Try to parse as structured JSON event
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === "thought" || parsed.type === "tool_call" || parsed.type === "tool_result") {
          onEvent({
            type: parsed.type,
            data: parsed.data || parsed,
            timestamp: new Date(),
          });
          return;
        }
      } catch {
        // Not JSON — treat as diagnostic text
      }

      // Emit raw text lines as thought events, throttled
      const now = Date.now();
      if (now - lastTextEventTime >= THROTTLE_MS) {
        lastTextEventTime = now;
        onEvent({
          type: "thought",
          data: { text: line },
          timestamp: new Date(),
        });
      }
    };

    // Execute the agent command inside the container with streaming
    const rawResult = await this.execInContainerStreaming(
      containerRef,
      cmd,
      handleChunk,
      (agentTimeout + 30) * 1000, // exec timeout slightly longer than agent timeout
    );

    // Parse the JSON result
    try {
      // The output may have diagnostic lines before the JSON — find the JSON object
      const jsonStart = rawResult.indexOf("{");
      const jsonEnd = rawResult.lastIndexOf("}");
      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error("No JSON found in agent output");
      }
      const jsonStr = rawResult.slice(jsonStart, jsonEnd + 1);
      const result = JSON.parse(jsonStr);

      // Extract the text output
      let output = "";
      if (result.result?.payloads) {
        for (const payload of result.result.payloads) {
          if (payload.text) {
            output += payload.text + "\n";
          }
        }
      }

      // Emit events based on result
      if (result.status === "ok") {
        onEvent({
          type: "output_chunk",
          data: { text: output.trim() },
          timestamp: new Date(),
        });

        // Report model info if available
        const agentMeta = result.result?.meta?.agentMeta;
        if (agentMeta) {
          onEvent({
            type: "thought",
            data: {
              text: `Model: ${agentMeta.provider}/${agentMeta.model} | Duration: ${result.result.meta.durationMs}ms`,
            },
            timestamp: new Date(),
          });
        }
      } else {
        // Agent returned an error status
        const errorText = output.trim() || result.summary || "Agent returned non-ok status";
        onEvent({
          type: "error",
          data: { message: errorText },
          timestamp: new Date(),
        });
      }

      return output.trim();
    } catch (parseErr: any) {
      // If JSON parsing fails, check if there's useful diagnostic text
      logger.error(SOURCE, `Failed to parse agent result: ${parseErr.message}`);
      logger.error(SOURCE, `Raw output: ${rawResult.slice(0, 500)}`);

      // Check for common error patterns
      if (rawResult.includes("No API key found")) {
        throw new Error("API key not configured in OpenClaw container. Check your API key settings.");
      }
      if (rawResult.includes("Incorrect API key")) {
        throw new Error("Invalid API key. Please check your API key in settings.");
      }

      // Return whatever text we got as output
      onEvent({
        type: "output_chunk",
        data: { text: rawResult },
        timestamp: new Date(),
      });
      return rawResult;
    }
  }

  /**
   * Destroy a container and clean up.
   */
  async destroyContainer(containerRecord: TaskContainer): Promise<void> {
    try {
      if (containerRecord.containerId) {
        const container = this.docker.getContainer(
          containerRecord.containerId,
        );
        try {
          await container.stop({ t: 5 });
        } catch {
          // Already stopped
        }
        try {
          await container.remove({ force: true });
        } catch {
          // Already removed
        }
      }

      if (containerRecord.port) {
        this.releasePort(containerRecord.port);
      }

      // Clean up metadata
      this.containerMeta.delete(containerRecord.executionId);

      await containerStorage.updateStatus(containerRecord.id, "stopped", {
        stoppedAt: new Date(),
      });

      logger.info(
        SOURCE,
        `Destroyed container for execution ${containerRecord.executionId}`,
      );
    } catch (err: any) {
      logger.error(
        SOURCE,
        `Error destroying container ${containerRecord.id}: ${err.message}`,
      );
    }
  }

  /**
   * Clean up orphaned containers on server startup.
   */
  async cleanupOrphans(): Promise<void> {
    try {
      const containers = await this.docker.listContainers({
        all: true,
        filters: { label: ["openclaw.managed=true"] },
      });

      for (const info of containers) {
        try {
          const container = this.docker.getContainer(info.Id);
          if (info.State === "running") {
            await container.stop({ t: 5 });
          }
          await container.remove({ force: true });
          logger.info(
            SOURCE,
            `Cleaned up orphan container ${info.Id.slice(0, 12)}`,
          );
        } catch (err: any) {
          logger.warn(
            SOURCE,
            `Failed to cleanup orphan ${info.Id.slice(0, 12)}: ${err.message}`,
          );
        }
      }

      // Reset any DB records stuck in running state
      const runningRecords = await containerStorage.getRunning();
      for (const record of runningRecords) {
        await containerStorage.updateStatus(record.id, "stopped", {
          stoppedAt: new Date(),
          errorMessage: "Cleaned up on server restart",
        });
      }
    } catch (err: any) {
      logger.warn(
        SOURCE,
        `Orphan cleanup skipped (Docker may be unavailable): ${err.message}`,
      );
    }
  }

  /**
   * Get the health status of the bridge.
   */
  async getHealth(): Promise<{
    dockerAvailable: boolean;
    imagePulled: boolean;
    runningContainers: number;
    usedPorts: number;
  }> {
    let dockerAvailable = false;
    let runningContainers = 0;

    try {
      await this.docker.ping();
      dockerAvailable = true;
      const containers = await this.docker.listContainers({
        filters: { label: ["openclaw.managed=true"] },
      });
      runningContainers = containers.length;
    } catch {
      // Docker not available
    }

    return {
      dockerAvailable,
      imagePulled: this.imagePulled,
      runningContainers,
      usedPorts: this.usedPorts.size,
    };
  }
}

export const openclawBridge = new OpenClawBridge();
