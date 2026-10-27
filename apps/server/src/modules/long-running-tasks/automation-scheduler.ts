import { logger } from "../../utils/logger";
import { automationRuleStorage } from "./task-storage";
import * as integrationService from "./integration-service";
import * as executionService from "./execution-service";
import type { TaskAutomationRule } from "@wtrops/shared";

const SOURCE = "AutomationScheduler";
const CHECK_INTERVAL_MS = 60_000; // Check every 60 seconds

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the automation scheduler.
 * Checks for rules with cron triggers whose nextRunAt has passed.
 */
export function startScheduler(): void {
  if (schedulerInterval) return;

  logger.info(SOURCE, "Starting automation scheduler");

  schedulerInterval = setInterval(async () => {
    try {
      await processScheduledRules();
    } catch (err: any) {
      logger.error(SOURCE, `Scheduler tick failed: ${err.message}`);
    }
  }, CHECK_INTERVAL_MS);

  // Run immediately on start
  processScheduledRules().catch((err) =>
    logger.error(SOURCE, `Initial scheduler tick failed: ${err.message}`),
  );
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info(SOURCE, "Automation scheduler stopped");
  }
}

async function processScheduledRules(): Promise<void> {
  const activeRules = await automationRuleStorage.getActive();
  const now = new Date();

  for (const rule of activeRules) {
    try {
      const trigger = rule.trigger as any;
      if (!trigger || trigger.type !== "cron") continue;

      // Check if nextRunAt has passed
      if (!rule.nextRunAt || rule.nextRunAt > now) continue;

      logger.info(SOURCE, `Triggering automation rule ${rule.id}: ${rule.name}`);
      await executeAutomationRule(rule);

      // Calculate next run time
      const nextRun = calculateNextCronRun(trigger.schedule);
      await automationRuleStorage.updateRunTimes(rule.id, now, nextRun);
    } catch (err: any) {
      logger.error(
        SOURCE,
        `Failed to process rule ${rule.id}: ${err.message}`,
      );
    }
  }
}

/**
 * Execute an automation rule: pull data from integrations, map inputs, queue execution.
 */
async function executeAutomationRule(
  rule: TaskAutomationRule,
): Promise<void> {
  const integrationIds = (rule.integrationIds as string[]) || [];
  const inputMapping = (rule.inputMapping as Record<string, any>) || {};

  // Pull data from all linked integrations
  const pulledData: Record<string, any> = {};
  for (const integrationId of integrationIds) {
    const integration = await integrationService.getIntegration(integrationId);
    if (!integration) {
      logger.warn(SOURCE, `Integration ${integrationId} not found, skipping`);
      continue;
    }

    try {
      const run = await integrationService.pullData(integration, rule.id);
      pulledData[integrationId] = run.data;
    } catch (err: any) {
      logger.error(
        SOURCE,
        `Data pull failed for integration ${integrationId}: ${err.message}`,
      );
    }
  }

  // Map pulled data to template inputs
  const inputData = mapInputData(inputMapping, pulledData);

  // Queue the execution
  await executionService.queueExecution(rule.userId, {
    templateId: rule.templateId,
    versionId: rule.versionId!,
    apiKeyId: rule.apiKeyId,
    inputData,
    triggeredBy: "schedule",
  });

  logger.info(SOURCE, `Automation rule ${rule.id} triggered execution`);
}

/**
 * Map pulled integration data to template input fields using inputMapping rules.
 *
 * inputMapping format:
 * {
 *   "projectBrief": { "source": "integration_id", "path": "data.brief" },
 *   "currency": { "value": "USD" }  // static value
 * }
 */
function mapInputData(
  mapping: Record<string, any>,
  pulledData: Record<string, any>,
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [field, config] of Object.entries(mapping)) {
    if (!config) continue;

    if (config.value !== undefined) {
      // Static value
      result[field] = config.value;
    } else if (config.source && config.path) {
      // Dynamic value from integration data
      const sourceData = pulledData[config.source];
      if (sourceData) {
        result[field] = getNestedValue(sourceData, config.path);
      }
    }
  }

  return result;
}

function getNestedValue(obj: any, path: string): any {
  const keys = path.split(".");
  let value = obj;
  for (const key of keys) {
    if (value == null || typeof value !== "object") return undefined;
    value = value[key];
  }
  return value;
}

/**
 * Simple cron-like schedule parser.
 * Supports basic formats like "0 * * * *" (every hour), "0 0 * * *" (daily).
 * For production, use a library like `cron-parser`.
 */
function calculateNextCronRun(schedule: string): Date | null {
  if (!schedule) return null;

  const parts = schedule.split(/\s+/);
  if (parts.length < 5) return null;

  const now = new Date();
  const [minute, hour] = parts;

  // Simple implementation: handle hourly and daily
  const next = new Date(now);

  if (hour === "*" && minute !== "*") {
    // Run at specific minute every hour
    const targetMinute = parseInt(minute);
    next.setMinutes(targetMinute, 0, 0);
    if (next <= now) next.setHours(next.getHours() + 1);
  } else if (hour !== "*" && minute !== "*") {
    // Run at specific time daily
    const targetHour = parseInt(hour);
    const targetMinute = parseInt(minute);
    next.setHours(targetHour, targetMinute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
  } else {
    // Default: run in 1 hour
    next.setHours(next.getHours() + 1);
    next.setMinutes(0, 0, 0);
  }

  return next;
}

// ── CRUD for Automation Rules ───────────────────

export async function createAutomationRule(
  userId: string,
  data: any,
): Promise<TaskAutomationRule> {
  const trigger = data.trigger || {};

  // Calculate initial nextRunAt for cron triggers
  let nextRunAt: Date | null = null;
  if (trigger.type === "cron") {
    nextRunAt = calculateNextCronRun(trigger.schedule);
  }

  const rule = await automationRuleStorage.create({
    ...data,
    userId,
  });

  if (nextRunAt) {
    await automationRuleStorage.updateRunTimes(rule.id, rule.lastRunAt!, nextRunAt);
  }

  logger.info(SOURCE, `Created automation rule ${rule.id}: ${data.name}`);
  return rule;
}

export async function getUserAutomationRules(
  userId: string,
): Promise<TaskAutomationRule[]> {
  return automationRuleStorage.getByUser(userId);
}

export async function updateAutomationRule(
  id: string,
  userId: string,
  data: any,
): Promise<TaskAutomationRule | null> {
  return automationRuleStorage.update(id, userId, data);
}

export async function deleteAutomationRule(
  id: string,
  userId: string,
): Promise<boolean> {
  return automationRuleStorage.delete(id, userId);
}
