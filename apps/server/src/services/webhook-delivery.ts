import crypto from "crypto";
import { storage } from "../storage";
import { db } from "../db";
import {
  webhooks,
  webhookLogs,
  Webhook,
  InsertWebhookLog,
} from "@wtrops/shared";
import { eq, and } from "drizzle-orm";
import { auditTool } from "./compliance-audit-bridge";

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, any>;
}

export interface DeliveryResult {
  success: boolean;
  httpStatus?: number;
  responseBody?: string;
  responseTime?: number;
  error?: string;
}

const RETRY_DELAYS = [0, 60000, 300000]; // 0s, 1min, 5min

export class WebhookDeliveryService {
  private generateSignature(payload: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
  }

  private buildHeaders(
    webhook: Webhook,
    payloadString: string,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Wtrops.ai-Webhook/1.0",
      "X-Webhook-Event": webhook.events?.[0] || "unknown",
      "X-Webhook-Delivery": crypto.randomUUID(),
      "X-Webhook-Signature": `sha256=${this.generateSignature(payloadString, webhook.secret)}`,
    };

    if (webhook.authType === "basic" && webhook.authCredentials) {
      const creds = webhook.authCredentials as {
        username?: string;
        password?: string;
      };
      if (creds.username && creds.password) {
        const basicAuth = Buffer.from(
          `${creds.username}:${creds.password}`,
        ).toString("base64");
        headers["Authorization"] = `Basic ${basicAuth}`;
      }
    } else if (webhook.authType === "bearer" && webhook.authCredentials) {
      const creds = webhook.authCredentials as { token?: string };
      if (creds.token) {
        headers["Authorization"] = `Bearer ${creds.token}`;
      }
    }

    if (webhook.headers) {
      const customHeaders = webhook.headers as Record<string, string>;
      Object.assign(headers, customHeaders);
    }

    return headers;
  }

  async deliverWebhook(
    webhook: Webhook,
    payload: WebhookPayload,
    attemptNumber: number = 1,
  ): Promise<DeliveryResult> {
    const payloadString = JSON.stringify(payload);
    const headers = this.buildHeaders(webhook, payloadString);
    const startTime = Date.now();

    console.log(
      `📤 [Webhook] Delivering to ${webhook.url} (attempt ${attemptNumber})`,
    );
    console.log(`   Event: ${payload.event}`);

    try {
      const response = await fetch(webhook.url, {
        method: webhook.method || "POST",
        headers,
        body: payloadString,
        signal: AbortSignal.timeout(30000),
      });

      const responseTime = Date.now() - startTime;
      let responseBody = "";

      try {
        responseBody = await response.text();
        if (responseBody.length > 10000) {
          responseBody = responseBody.substring(0, 10000) + "...[truncated]";
        }
      } catch {
        responseBody = "Unable to read response body";
      }

      const success = response.ok;

      console.log(
        `${success ? "✅" : "❌"} [Webhook] Status: ${response.status}, Time: ${responseTime}ms`,
      );

      return {
        success,
        httpStatus: response.status,
        responseBody,
        responseTime,
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const errorMessage =
        error.name === "TimeoutError"
          ? "Request timed out after 30 seconds"
          : error.message || "Unknown error";

      console.error(`❌ [Webhook] Delivery failed: ${errorMessage}`);

      return {
        success: false,
        responseTime,
        error: errorMessage,
      };
    }
  }

  async deliverWithRetry(
    webhook: Webhook,
    payload: WebhookPayload,
    maxAttempts: number = 3,
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await this.deliverWebhook(webhook, payload, attempt);

      const logData: InsertWebhookLog = {
        webhookId: webhook.id,
        event: payload.event,
        payload: payload as any,
        success: result.success,
        httpStatus: result.httpStatus || null,
        responseBody: result.responseBody || null,
        responseTime: result.responseTime || null,
        error: result.error || null,
        attemptNumber: attempt,
        maxAttempts,
        nextRetryAt: null,
      };

      if (!result.success && attempt < maxAttempts) {
        const delay = RETRY_DELAYS[attempt] || 300000;
        logData.nextRetryAt = new Date(Date.now() + delay);
        console.log(`⏳ [Webhook] Scheduling retry in ${delay / 1000}s`);
      }

      try {
        // Check if webhook still exists before logging (might have been deleted)
        const webhookExists = await storage.getWebhook(webhook.id);
        if (webhookExists) {
          await storage.createWebhookLog(logData);
        } else {
          console.log(
            `ℹ️ [Webhook] Skipping log - webhook ${webhook.id} was deleted`,
          );
        }
      } catch (err: any) {
        // Handle foreign key constraint violations gracefully (webhook was deleted)
        if (
          err.code === "23503" ||
          err.message?.includes("foreign key constraint")
        ) {
          console.log(
            `ℹ️ [Webhook] Skipping log - webhook ${webhook.id} no longer exists`,
          );
        } else {
          console.error(`❌ [Webhook] Failed to log delivery:`, err);
        }
      }

      if (result.success) {
        console.log(`✅ [Webhook] Delivery successful on attempt ${attempt}`);
        auditTool("system", "webhook-engine", "webhook.delivered", "success", { webhookId: webhook.id, url: webhook.url });
        return;
      }

      if (attempt < maxAttempts) {
        const delay = RETRY_DELAYS[attempt] || 60000;
        console.log(`⏳ [Webhook] Waiting ${delay / 1000}s before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    console.error(
      `❌ [Webhook] All ${maxAttempts} attempts failed for ${webhook.url}`,
    );
  }

  async triggerEvent(
    userId: string,
    event: string,
    data: Record<string, any>,
    campaignId?: string | null,
  ): Promise<void> {
    console.log(`🔔 [Webhook] Triggering event: ${event}`);
    console.log(`   UserId: ${userId}, CampaignId: ${campaignId || "N/A"}`);

    try {
      const webhooks = await storage.getWebhooksForEvent(
        userId,
        event,
        campaignId || undefined,
      );

      if (webhooks.length === 0) {
        console.log(`ℹ️ [Webhook] No webhooks configured for event: ${event}`);
        return;
      }

      console.log(
        `📤 [Webhook] Found ${webhooks.length} webhook(s) to deliver`,
      );

      const payload: WebhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        data,
      };

      const deliveryPromises = webhooks.map((webhook) =>
        this.deliverWithRetry(webhook, payload).catch((err) => {
          console.error(
            `❌ [Webhook] Error delivering to ${webhook.url}:`,
            err,
          );
        }),
      );

      await Promise.allSettled(deliveryPromises);

      console.log(`✅ [Webhook] Event ${event} processing complete`);
    } catch (error) {
      console.error(`❌ [Webhook] Error triggering event ${event}:`, error);
    }
  }

  async testWebhook(
    webhookId: string,
    userId: string,
  ): Promise<{
    success: boolean;
    statusCode: number;
    responseTime: number;
    responseBody: string;
    error?: string;
  }> {
    const [webhook] = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.id, webhookId), eq(webhooks.userId, userId)));

    if (!webhook) {
      throw new Error("Webhook not found");
    }

    const testPayload: WebhookPayload = {
      event: "webhook.test",
      timestamp: new Date().toISOString(),
      data: {
        test: true,
        message: "This is a test webhook from Wtrops.ai",
      },
    };

    console.log(`🧪 Testing webhook ${webhookId}...`);

    const result = await this.deliverWebhook(webhook, testPayload, 1);

    return {
      success: result.success,
      statusCode: result.httpStatus || 0,
      responseTime: result.responseTime || 0,
      responseBody: result.responseBody || "",
      error: result.error,
    };
  }

  async retryWebhook(
    logId: number,
    userId: string,
  ): Promise<{
    success: boolean;
    newLogId?: number;
    error?: string;
  }> {
    const [log] = await db
      .select()
      .from(webhookLogs)
      .where(eq(webhookLogs.id, logId));

    if (!log) {
      throw new Error("Webhook log not found");
    }

    const [webhook] = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.id, log.webhookId!), eq(webhooks.userId, userId)));

    if (!webhook) {
      throw new Error("Webhook not found or access denied");
    }

    console.log(`🔄 Manually retrying webhook ${webhook.id} (log ${logId})...`);

    const payload: WebhookPayload = {
      event: log.event,
      timestamp: new Date().toISOString(),
      data: (log.payload as any)?.data || (log.payload as any),
    };

    const result = await this.deliverWebhook(webhook, payload, 1);

    const logData: InsertWebhookLog = {
      webhookId: webhook.id,
      event: log.event,
      payload: log.payload as any,
      success: result.success,
      httpStatus: result.httpStatus || null,
      responseBody: result.responseBody || null,
      responseTime: result.responseTime || null,
      error: result.error || null,
      attemptNumber: 1,
      maxAttempts: 1,
      nextRetryAt: null,
    };

    try {
      const newLog = await storage.createWebhookLog(logData);
      return {
        success: result.success,
        newLogId: newLog?.id,
        error: result.error,
      };
    } catch (err) {
      console.error(`❌ [Webhook] Failed to log retry:`, err);
      return {
        success: result.success,
        error: result.error,
      };
    }
  }
}

export const webhookDeliveryService = new WebhookDeliveryService();
