"use strict";
import { Router, Response } from "express";
import { storage } from "../storage";
import { checkSuperAdmin, AdminRequest } from "../middleware/admin-auth";
import { z } from "zod";
import nodemailer from "nodemailer";
import { emailService } from "../services/email-service";

const router = Router();

router.use(checkSuperAdmin);

const DEFAULT_EMAIL_SETTINGS = [
  {
    eventType: "welcomeEmail",
    displayName: "Welcome Email",
    description: "Sent when new user signs up",
    isEnabled: true,
    category: "authentication",
  },
  {
    eventType: "purchaseConfirmation",
    displayName: "Purchase Confirmation",
    description: "Sent after successful payment",
    isEnabled: true,
    category: "billing",
  },
  {
    eventType: "lowCredits",
    displayName: "Low Credits Alert",
    description: "Sent when credits fall below threshold",
    isEnabled: true,
    category: "billing",
  },
  {
    eventType: "campaignCompleted",
    displayName: "Campaign Completed",
    description: "Sent when campaign finishes",
    isEnabled: true,
    category: "campaigns",
  },
  {
    eventType: "renewalReminder",
    displayName: "Renewal Reminder",
    description: "Sent before subscription renewal",
    isEnabled: true,
    category: "billing",
  },
  {
    eventType: "paymentFailed",
    displayName: "Payment Failed",
    description: "Sent when payment fails",
    isEnabled: true,
    category: "billing",
  },
  {
    eventType: "accountSuspended",
    displayName: "Account Suspended",
    description: "Sent when account is suspended",
    isEnabled: true,
    category: "account",
  },
  {
    eventType: "accountReactivated",
    displayName: "Account Reactivated",
    description: "Sent when account is reactivated",
    isEnabled: true,
    category: "account",
  },
  {
    eventType: "membershipUpgrade",
    displayName: "Membership Upgrade",
    description: "Sent when user upgrades their plan",
    isEnabled: true,
    category: "billing",
  },
  {
    eventType: "phoneNumberBilling",
    displayName: "Phone Number Billing",
    description: "Sent for monthly phone number billing",
    isEnabled: true,
    category: "billing",
  },
];

async function initializeDefaultSettings(): Promise<void> {
  const existingSettings = await storage.getAllEmailNotificationSettings();

  if (existingSettings.length === 0) {
    for (const setting of DEFAULT_EMAIL_SETTINGS) {
      await storage.createEmailNotificationSetting(setting);
    }
  } else {
    const existingEventTypes = new Set(
      existingSettings.map((s) => s.eventType),
    );
    for (const setting of DEFAULT_EMAIL_SETTINGS) {
      if (!existingEventTypes.has(setting.eventType)) {
        await storage.createEmailNotificationSetting(setting);
      }
    }
  }
}

async function checkSmtpConfiguration(): Promise<{
  configured: boolean;
  host: string | null;
  port: number | null;
  user: string | null;
  hasPassword: boolean;
  missingFields: string[];
}> {
  const smtpHost = await storage.getGlobalSetting("smtp_host");
  const smtpPort = await storage.getGlobalSetting("smtp_port");
  const smtpUser = await storage.getGlobalSetting("smtp_username");
  const smtpPass = await storage.getGlobalSetting("smtp_password");

  const hostValue = smtpHost?.value;
  const portValue = smtpPort?.value;
  const userValue = smtpUser?.value;
  const passValue = smtpPass?.value;

  const host =
    (typeof hostValue === "string" ? hostValue : null) ||
    process.env.SMTP_HOST ||
    null;
  // Handle port as both string and number (database stores as number, env var is string)
  let port: number | null = null;
  if (typeof portValue === "number") {
    port = portValue;
  } else if (typeof portValue === "string") {
    port = parseInt(portValue, 10);
  } else if (process.env.SMTP_PORT) {
    port = parseInt(process.env.SMTP_PORT, 10);
  }
  const user =
    (typeof userValue === "string" ? userValue : null) ||
    process.env.SMTP_USER ||
    null;
  const pass =
    (typeof passValue === "string" ? passValue : null) ||
    process.env.SMTP_PASS ||
    null;

  const missingFields: string[] = [];
  if (!host) missingFields.push("SMTP Host");
  if (!port) missingFields.push("SMTP Port");
  if (!user) missingFields.push("SMTP User");
  if (!pass) missingFields.push("SMTP Password");

  return {
    configured: missingFields.length === 0,
    host,
    port,
    user,
    hasPassword: Boolean(pass),
    missingFields,
  };
}

router.get("/", async (req: AdminRequest, res: Response) => {
  try {
    await initializeDefaultSettings();

    const settings = await storage.getAllEmailNotificationSettings();
    const smtpStatus = await checkSmtpConfiguration();

    res.json({
      settings,
      smtpConfigured: smtpStatus.configured,
      smtpStatus: {
        configured: smtpStatus.configured,
        host: smtpStatus.host,
        port: smtpStatus.port,
        user: smtpStatus.user,
        hasPassword: smtpStatus.hasPassword,
        missingFields: smtpStatus.missingFields,
      },
    });
  } catch (error: any) {
    console.error("Error fetching email notification settings:", error);

    let errorMessage = "Failed to fetch email notification settings";
    let errorCode = "EMAIL_SETTINGS_ERROR";

    if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
      errorMessage =
        "Database connection failed. Please check database configuration.";
      errorCode = "DATABASE_CONNECTION_ERROR";
    } else if (
      error.message?.includes("relation") &&
      error.message?.includes("does not exist")
    ) {
      errorMessage =
        "Database tables not found. Please run database migrations.";
      errorCode = "DATABASE_MIGRATION_REQUIRED";
    } else if (error.message) {
      errorMessage = `Email settings error: ${error.message}`;
    }

    res.status(500).json({
      error: errorMessage,
      code: errorCode,
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

router.post("/test-smtp", async (req: AdminRequest, res: Response) => {
  try {
    // Check if email service is enabled (configured via env vars or database)
    if (!emailService.isEnabled()) {
      const smtpStatus = await checkSmtpConfiguration();
      return res.json({
        success: false,
        error: smtpStatus.configured
          ? "Email service not initialized. Try reinitializing after saving SMTP settings."
          : `SMTP not fully configured. Missing: ${smtpStatus.missingFields.join(", ")}`,
        missingFields: smtpStatus.missingFields,
      });
    }

    const smtpStatus = await checkSmtpConfiguration();

    try {
      // Use the email service's verifyConnection method for consistency
      const verified = await emailService.verifyConnection();

      if (verified) {
        res.json({
          success: true,
          message: "SMTP connection successful! Emails can be sent.",
          host: smtpStatus.host,
          port: smtpStatus.port,
        });
      } else {
        res.json({
          success: false,
          error: "SMTP verification failed. Check your credentials.",
          host: smtpStatus.host,
          port: smtpStatus.port,
        });
      }
    } catch (verifyError: any) {
      console.error("[SMTP Test] Verification failed:", verifyError);
      res.json({
        success: false,
        error: verifyError.message || "SMTP verification failed",
        code: verifyError.code,
        host: smtpStatus.host,
        port: smtpStatus.port,
      });
    }
  } catch (error: any) {
    console.error("[SMTP Test] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to test SMTP connection",
    });
  }
});

router.put("/:eventType", async (req: AdminRequest, res: Response) => {
  try {
    const { eventType } = req.params;

    const updateSchema = z.object({
      isEnabled: z.boolean(),
    });

    const { isEnabled } = updateSchema.parse(req.body);

    const existingSetting =
      await storage.getEmailNotificationSetting(eventType);
    if (!existingSetting) {
      return res
        .status(404)
        .json({ error: "Email notification setting not found" });
    }

    await storage.updateEmailNotificationSetting(eventType, {
      isEnabled,
      updatedBy: req.userId,
    });

    const updatedSetting = await storage.getEmailNotificationSetting(eventType);

    res.json({
      success: true,
      setting: updatedSetting,
    });
  } catch (error) {
    console.error("Error updating email notification setting:", error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid request data", details: error.errors });
    }
    res
      .status(500)
      .json({ error: "Failed to update email notification setting" });
  }
});

router.put("/", async (req: AdminRequest, res: Response) => {
  try {
    const bulkUpdateSchema = z.object({
      settings: z.array(
        z.object({
          eventType: z.string(),
          isEnabled: z.boolean(),
        }),
      ),
    });

    const { settings } = bulkUpdateSchema.parse(req.body);

    const results = [];
    for (const { eventType, isEnabled } of settings) {
      const existingSetting =
        await storage.getEmailNotificationSetting(eventType);
      if (existingSetting) {
        await storage.updateEmailNotificationSetting(eventType, {
          isEnabled,
          updatedBy: req.userId,
        });
        results.push({ eventType, success: true });
      } else {
        results.push({ eventType, success: false, error: "Not found" });
      }
    }

    const allSettings = await storage.getAllEmailNotificationSettings();

    res.json({
      success: true,
      results,
      settings: allSettings,
    });
  } catch (error) {
    console.error("Error bulk updating email notification settings:", error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid request data", details: error.errors });
    }
    res
      .status(500)
      .json({ error: "Failed to update email notification settings" });
  }
});

router.post("/save-smtp", async (req: AdminRequest, res: Response) => {
  try {
    const smtpSchema = z.object({
      host: z.string().min(1),
      port: z.number().int().positive(),
      username: z.string().min(1),
      password: z.string().min(1),
      fromEmail: z.string().email().optional(),
      fromName: z.string().optional(),
    });

    const { host, port, username, password, fromEmail, fromName } =
      smtpSchema.parse(req.body);

    await storage.updateGlobalSetting("smtp_host", host);
    await storage.updateGlobalSetting("smtp_port", port);
    await storage.updateGlobalSetting("smtp_username", username);
    await storage.updateGlobalSetting("smtp_password", password);
    if (fromEmail) {
      await storage.updateGlobalSetting("smtp_from_email", fromEmail);
    }
    if (fromName) {
      await storage.updateGlobalSetting("smtp_from_name", fromName);
    }

    const reinitialized = await emailService.reinitializeFromDatabase();

    res.json({
      success: true,
      reinitialized,
      message: reinitialized
        ? "SMTP settings saved and email service reinitialized"
        : "SMTP settings saved but email service could not reinitialize",
    });
  } catch (error) {
    console.error("Error saving SMTP settings:", error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid SMTP settings", details: error.errors });
    }
    res.status(500).json({ error: "Failed to save SMTP settings" });
  }
});

router.post("/reinitialize", async (req: AdminRequest, res: Response) => {
  try {
    const reinitialized = await emailService.reinitializeFromDatabase();

    res.json({
      success: reinitialized,
      message: reinitialized
        ? "Email service reinitialized from database settings"
        : "Could not reinitialize - check SMTP settings in database",
    });
  } catch (error) {
    console.error("Error reinitializing email service:", error);
    res.status(500).json({ error: "Failed to reinitialize email service" });
  }
});

export default router;
