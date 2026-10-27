"use strict";

import { Router, Response } from "express";
import { RouteContext, AuthRequest } from "./common";
import crypto from "crypto";

export function createUserWebhookRoutes(ctx: RouteContext): Router {
  const router = Router();
  const { storage, authenticateToken, authenticateHybrid, webhookTestService } =
    ctx;

  // Get user's webhook limit and count
  router.get(
    "/api/webhooks/limits",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const count = await storage.getUserWebhookCount(req.userId!);
        const limits = await storage.getUserEffectiveLimits(req.userId!);

        res.json({
          current: count,
          max: limits.maxWebhooks,
          remaining: Math.max(0, limits.maxWebhooks - count),
          source: limits.sources.maxWebhooks,
        });
      } catch (error: any) {
        console.error("Get webhook limits error:", error);
        res.status(500).json({ error: "Failed to get webhook limits" });
      }
    },
  );

  // Create webhook subscription
  router.post(
    "/api/webhooks",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const {
          name,
          url,
          events,
          campaignIds,
          authType,
          authCredentials,
          description,
        } = req.body;

        if (
          !name ||
          !url ||
          !events ||
          !Array.isArray(events) ||
          events.length === 0
        ) {
          return res
            .status(400)
            .json({ error: "Name, URL, and at least one event are required" });
        }

        // Validate URL format
        try {
          new URL(url);
        } catch {
          return res.status(400).json({ error: "Invalid URL format" });
        }

        // Check webhook limit using plan-based system (999 or -1 means unlimited)
        const currentCount = await storage.getUserWebhookCount(req.userId!);
        const limits = await storage.getUserEffectiveLimits(req.userId!);
        const maxWebhooks =
          typeof limits.maxWebhooks === "number" ? limits.maxWebhooks : 3;

        // Skip limit check if explicitly unlimited (999 or -1)
        if (
          maxWebhooks !== 999 &&
          maxWebhooks !== -1 &&
          currentCount >= maxWebhooks
        ) {
          return res.status(403).json({
            error: `Webhook limit reached (${maxWebhooks}). Upgrade your plan or contact support to increase your limit.`,
          });
        }

        // Validate campaign ownership if specific campaigns are specified
        if (
          campaignIds &&
          Array.isArray(campaignIds) &&
          campaignIds.length > 0
        ) {
          for (const campaignId of campaignIds) {
            const campaign = await storage.getCampaign(campaignId);
            if (!campaign || campaign.userId !== req.userId) {
              return res
                .status(404)
                .json({ error: `Campaign ${campaignId} not found` });
            }
          }
        }

        // Validate events
        const validEvents = [
          // Campaign events
          "campaign.started",
          "campaign.paused",
          "campaign.resumed",
          "campaign.completed",
          "campaign.failed",
          "campaign.cancelled",
          // Call events (outbound)
          "call.started",
          "call.ringing",
          "call.answered",
          "call.completed",
          "call.failed",
          "call.transferred",
          "call.no_answer",
          "call.busy",
          "call.voicemail",
          // Call events (inbound)
          "inbound_call.received",
          "inbound_call.answered",
          "inbound_call.completed",
          "inbound_call.missed",
          // Flow events
          "flow.started",
          "flow.completed",
          "flow.failed",
          // Appointment events
          "appointment.booked",
          "appointment.confirmed",
          "appointment.cancelled",
          "appointment.rescheduled",
          "appointment.completed",
          "appointment.no_show",
          // Form events
          "form.submitted",
          "form.lead_created",
        ];

        const invalidEvents = events.filter(
          (e: string) => !validEvents.includes(e),
        );
        if (invalidEvents.length > 0) {
          return res.status(400).json({
            error: `Invalid events: ${invalidEvents.join(", ")}. Valid events: ${validEvents.join(", ")}`,
          });
        }

        // Generate a secret for HMAC-SHA256 signature verification
        const secret = crypto.randomBytes(32).toString("hex");

        const webhook = await storage.createWebhook({
          userId: req.userId!,
          name,
          description: description || null,
          url,
          method: "POST",
          secret,
          events,
          campaignIds:
            campaignIds && campaignIds.length > 0 ? campaignIds : null,
          authType: authType || null,
          authCredentials: authCredentials || null,
          isActive: true,
        });

        res.json(webhook);
      } catch (error: any) {
        console.error("Create webhook error:", error);
        res.status(500).json({ error: "Failed to create webhook" });
      }
    },
  );

  // Get all user webhooks
  router.get(
    "/api/webhooks",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const webhooks = await storage.getUserWebhooks(req.userId!);
        res.json(webhooks);
      } catch (error: any) {
        console.error("Get webhooks error:", error);
        res.status(500).json({ error: "Failed to get webhooks" });
      }
    },
  );

  // Get webhook by ID
  router.get(
    "/api/webhooks/:id",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const webhook = await storage.getWebhook(req.params.id);
        if (!webhook || webhook.userId !== req.userId) {
          return res.status(404).json({ error: "Webhook not found" });
        }

        res.json(webhook);
      } catch (error: any) {
        console.error("Get webhook error:", error);
        res.status(500).json({ error: "Failed to get webhook" });
      }
    },
  );

  // Update webhook
  router.patch(
    "/api/webhooks/:id",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const webhook = await storage.getWebhook(req.params.id);
        if (!webhook || webhook.userId !== req.userId) {
          return res.status(404).json({ error: "Webhook not found" });
        }

        const {
          name,
          url,
          events,
          campaignIds,
          authType,
          authCredentials,
          description,
          isActive,
        } = req.body;

        const updates: any = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (url !== undefined) updates.url = url;
        if (events !== undefined) updates.events = events;
        if (campaignIds !== undefined)
          updates.campaignIds =
            campaignIds && campaignIds.length > 0 ? campaignIds : null;
        if (authType !== undefined) updates.authType = authType;
        if (authCredentials !== undefined)
          updates.authCredentials = authCredentials;
        if (isActive !== undefined) updates.isActive = isActive;

        await storage.updateWebhook(req.params.id, updates);

        const updated = await storage.getWebhook(req.params.id);
        res.json(updated);
      } catch (error: any) {
        console.error("Update webhook error:", error);
        res.status(500).json({ error: "Failed to update webhook" });
      }
    },
  );

  // Delete webhook
  router.delete(
    "/api/webhooks/:id",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const webhook = await storage.getWebhook(req.params.id);
        if (!webhook || webhook.userId !== req.userId) {
          return res.status(404).json({ error: "Webhook not found" });
        }

        await storage.deleteWebhook(req.params.id);
        res.json({ success: true });
      } catch (error: any) {
        console.error("Delete webhook error:", error);
        res.status(500).json({ error: "Failed to delete webhook" });
      }
    },
  );

  // Test webhook
  router.post(
    "/api/webhooks/:id/test",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const result = await webhookTestService.testWebhook(
          req.params.id,
          req.userId!,
        );

        if (result.success) {
          res.json({
            success: true,
            status: result.status,
            responseTime: result.responseTime,
            message: result.message,
          });
        } else {
          const statusCode = result.error?.includes("not found") ? 404 : 400;
          res.status(statusCode).json({
            success: false,
            status: result.status,
            responseTime: result.responseTime,
            error: result.error,
            message: result.message,
            details: result.responseBody?.substring(0, 500),
          });
        }
      } catch (error: any) {
        console.error("Test webhook error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to send test webhook",
          details: error.message,
        });
      }
    },
  );

  // Get webhook delivery logs
  router.get(
    "/api/webhooks/:id/logs",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const webhook = await storage.getWebhook(req.params.id);
        if (!webhook || webhook.userId !== req.userId) {
          return res.status(404).json({ error: "Webhook not found" });
        }

        const limit = req.query.limit
          ? parseInt(req.query.limit as string, 10)
          : 50;
        const logs = await storage.getWebhookLogs(req.params.id, limit);

        res.json(logs);
      } catch (error: any) {
        console.error("Get webhook logs error:", error);
        res.status(500).json({ error: "Failed to get webhook logs" });
      }
    },
  );

  // Retry failed webhook delivery
  router.post(
    "/api/webhooks/logs/:logId/retry",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const logId = parseInt(req.params.logId, 10);
        const log = await storage.getWebhookLog(logId);

        if (!log || !log.webhookId) {
          return res.status(404).json({ error: "Delivery log not found" });
        }

        const webhook = await storage.getWebhook(log.webhookId);
        if (!webhook || webhook.userId !== req.userId) {
          return res.status(404).json({ error: "Webhook not found" });
        }

        // Generate new signature for retry
        const timestamp = new Date().toISOString();
        const signaturePayload = timestamp + JSON.stringify(log.payload);
        const signature = crypto
          .createHmac("sha256", webhook.secret)
          .update(signaturePayload)
          .digest("hex");

        const startTime = Date.now();

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Timestamp": timestamp,
          "X-Webhook-Retry": "true",
          ...(webhook.headers || {}),
        };

        const response = await fetch(webhook.url, {
          method: webhook.method || "POST",
          headers,
          body: JSON.stringify(log.payload),
        });

        const responseTime = Date.now() - startTime;
        const responseText = await response.text();

        // Update the original log
        await storage.updateWebhookLog(logId, {
          success: response.ok,
          httpStatus: response.status,
          responseBody: responseText.substring(0, 2000),
          responseTime,
          error: response.ok ? null : `HTTP ${response.status}`,
          attemptNumber: (log.attemptNumber || 1) + 1,
          nextRetryAt: null,
        });

        res.json({
          success: response.ok,
          status: response.status,
          responseTime,
          message: response.ok ? "Retry successful" : "Retry failed",
        });
      } catch (error: any) {
        console.error("Retry webhook error:", error);
        res.status(500).json({ error: "Failed to retry webhook" });
      }
    },
  );

  return router;
}
