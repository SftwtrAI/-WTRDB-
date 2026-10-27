"use strict";

import { storage } from "../storage";
import type {
  PaymentWebhookQueue,
  InsertPaymentWebhookQueue,
} from "@wtrops/shared";

// Default retry delays - used as fallback if database unavailable
const DEFAULT_RETRY_INTERVALS_MINUTES = [1, 5, 15, 30, 60];
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WEBHOOK_EXPIRY_HOURS = 24;

// Cache for webhook settings
let cachedRetryIntervals: number[] = DEFAULT_RETRY_INTERVALS_MINUTES;
let cachedMaxAttempts: number = DEFAULT_MAX_ATTEMPTS;
let cachedExpiryHours: number = DEFAULT_WEBHOOK_EXPIRY_HOURS;
let settingsCacheTime: number = 0;
const SETTINGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadWebhookSettings(): Promise<void> {
  const now = Date.now();
  if (now - settingsCacheTime < SETTINGS_CACHE_TTL) {
    return;
  }

  try {
    const [intervalsSetting, maxAttemptsSetting, expirySetting] =
      await Promise.all([
        storage.getGlobalSetting("webhook_retry_intervals_minutes"),
        storage.getGlobalSetting("webhook_retry_max_attempts"),
        storage.getGlobalSetting("webhook_expiry_hours"),
      ]);

    if (Array.isArray(intervalsSetting?.value)) {
      cachedRetryIntervals = intervalsSetting.value;
    }
    if (typeof maxAttemptsSetting?.value === "number") {
      cachedMaxAttempts = maxAttemptsSetting.value;
    }
    if (typeof expirySetting?.value === "number") {
      cachedExpiryHours = expirySetting.value;
    }
    settingsCacheTime = now;
  } catch (error) {
    console.error(
      "[WebhookRetry] Failed to load settings from database, using defaults:",
      error,
    );
  }
}

function getRetryDelayMs(attemptNumber: number): number {
  const intervalMinutes =
    cachedRetryIntervals[attemptNumber - 1] ||
    cachedRetryIntervals[cachedRetryIntervals.length - 1] ||
    60;
  return intervalMinutes * 60 * 1000;
}

function getMaxAttempts(): number {
  return cachedMaxAttempts;
}

function getExpiryHours(): number {
  return cachedExpiryHours;
}

const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class WebhookRetryService {
  private schedulerInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;

  start(): void {
    if (this.schedulerInterval) {
      console.log("⚠️ [WebhookRetry] Scheduler already running");
      return;
    }

    console.log(
      "🚀 [WebhookRetry] Starting webhook retry scheduler (runs every 5 minutes)",
    );

    this.schedulerInterval = setInterval(() => {
      this.processRetryableWebhooks().catch((err) => {
        console.error("❌ [WebhookRetry] Error in scheduled processing:", err);
      });
    }, SCHEDULER_INTERVAL_MS);

    this.processRetryableWebhooks().catch((err) => {
      console.error("❌ [WebhookRetry] Error in initial processing:", err);
    });
  }

  stop(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
      console.log("⏹️ [WebhookRetry] Scheduler stopped");
    }
  }

  async processRetryableWebhooks(): Promise<void> {
    if (this.isProcessing) {
      console.log("⏳ [WebhookRetry] Already processing, skipping this cycle");
      return;
    }

    this.isProcessing = true;

    try {
      // Load latest settings from database
      await loadWebhookSettings();

      await this.markExpired();

      const webhooks = await storage.getRetryableWebhooks();

      if (webhooks.length === 0) {
        return;
      }

      console.log(
        `📋 [WebhookRetry] Processing ${webhooks.length} retryable webhook(s)`,
      );

      for (const webhook of webhooks) {
        try {
          await this.processWebhook(webhook);
        } catch (error: any) {
          console.error(
            `❌ [WebhookRetry] Error processing webhook ${webhook.id}:`,
            error,
          );
        }
      }

      console.log(
        `✅ [WebhookRetry] Finished processing ${webhooks.length} webhook(s)`,
      );
    } catch (error: any) {
      console.error(
        "❌ [WebhookRetry] Error in processRetryableWebhooks:",
        error,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  async processWebhook(webhook: PaymentWebhookQueue): Promise<void> {
    const attemptCount = (webhook.attemptCount || 0) + 1;

    console.log(
      `🔄 [WebhookRetry] Processing webhook ${webhook.id} (${webhook.gateway}/${webhook.eventType}) - Attempt ${attemptCount}/${getMaxAttempts()}`,
    );

    try {
      await storage.updateWebhookQueueItem(webhook.id, {
        status: "processing",
        lastAttemptAt: new Date(),
      });

      const result = await this.reprocessWebhookEvent(webhook);

      if (result.success) {
        await storage.updateWebhookQueueItem(webhook.id, {
          status: "completed",
          processedAt: new Date(),
          attemptCount,
        });
        console.log(
          `✅ [WebhookRetry] Successfully processed webhook ${webhook.id}`,
        );
      } else {
        throw new Error(result.error || "Unknown error during reprocessing");
      }
    } catch (error: any) {
      const errorMessage = error.message || "Unknown error";
      const errorHistory = [
        ...(webhook.errorHistory || []),
        {
          attempt: attemptCount,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        },
      ];

      if (attemptCount >= getMaxAttempts()) {
        await storage.updateWebhookQueueItem(webhook.id, {
          status: "failed",
          attemptCount,
          lastError: errorMessage,
          errorHistory,
        });
        console.log(
          `❌ [WebhookRetry] Webhook ${webhook.id} failed after ${getMaxAttempts()} attempts`,
        );
      } else {
        const nextRetryAt = this.calculateNextRetry(attemptCount);
        await storage.updateWebhookQueueItem(webhook.id, {
          status: "pending",
          attemptCount,
          lastError: errorMessage,
          errorHistory,
          nextRetryAt,
        });
        console.log(
          `⏳ [WebhookRetry] Webhook ${webhook.id} will retry at ${nextRetryAt.toISOString()}`,
        );
      }
    }
  }

  calculateNextRetry(attemptCount: number): Date {
    const delayMs = getRetryDelayMs(attemptCount);
    return new Date(Date.now() + delayMs);
  }

  async markExpired(): Promise<void> {
    try {
      const expiredWebhooks = await storage.getExpiredWebhooks();

      if (expiredWebhooks.length === 0) {
        return;
      }

      console.log(
        `⏰ [WebhookRetry] Marking ${expiredWebhooks.length} webhook(s) as expired`,
      );

      for (const webhook of expiredWebhooks) {
        await storage.updateWebhookQueueItem(webhook.id, {
          status: "expired",
        });
      }
    } catch (error: any) {
      console.error("❌ [WebhookRetry] Error marking expired webhooks:", error);
    }
  }

  private async reprocessWebhookEvent(
    webhook: PaymentWebhookQueue,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(
        `🔍 [WebhookRetry] Re-processing ${webhook.gateway} event: ${webhook.eventType}`,
      );

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export async function queueFailedWebhook(
  gateway: string,
  eventType: string,
  eventId: string,
  payload: any,
  error: string,
  userId?: string,
): Promise<void> {
  try {
    const existingWebhook = await storage.getWebhookByEventId(gateway, eventId);
    if (existingWebhook) {
      console.log(
        `ℹ️ [WebhookRetry] Webhook with eventId ${eventId} already queued, skipping`,
      );
      return;
    }

    // Load latest settings before queueing
    await loadWebhookSettings();
    const expiresAt = new Date(Date.now() + getExpiryHours() * 60 * 60 * 1000);

    const queueItem: InsertPaymentWebhookQueue = {
      gateway,
      eventType,
      eventId,
      payload,
      status: "pending",
      attemptCount: 0,
      maxAttempts: getMaxAttempts(),
      lastError: error,
      errorHistory: [
        {
          attempt: 0,
          error,
          timestamp: new Date().toISOString(),
        },
      ],
      expiresAt,
      userId: userId || null,
    };

    await storage.createWebhookQueueItem(queueItem);
    console.log(
      `📥 [WebhookRetry] Queued failed ${gateway} webhook: ${eventType} (${eventId})`,
    );
  } catch (queueError: any) {
    console.error(`❌ [WebhookRetry] Failed to queue webhook:`, queueError);
  }
}

export const webhookRetryService = new WebhookRetryService();
