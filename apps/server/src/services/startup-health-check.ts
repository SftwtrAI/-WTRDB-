"use strict";
import { db } from "../db";
import { sql, eq } from "drizzle-orm";
// stripe-service and razorpay-service have been removed; stub the helpers
// so the health check still reports "not configured" without crashing.
async function isStripeConfigured(): Promise<boolean> { return false; }
async function isStripeEnabled(): Promise<boolean> { return false; }
async function isRazorpayConfigured(): Promise<boolean> { return false; }
async function isRazorpayEnabled(): Promise<boolean> { return false; }
import { emailService } from "./email-service";
import * as os from "os";

async function logSystemResources(): Promise<void> {
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const totalMemoryGB = totalMemoryBytes / (1024 * 1024 * 1024);
  const freeMemoryGB = freeMemoryBytes / (1024 * 1024 * 1024);
  const usedMemoryGB = totalMemoryGB - freeMemoryGB;

  console.log("💾 [System] Memory Status:");
  console.log(`   Total RAM: ${totalMemoryGB.toFixed(2)} GB`);
  console.log(
    `   Used: ${usedMemoryGB.toFixed(2)} GB | Free: ${freeMemoryGB.toFixed(2)} GB`,
  );
  console.log(`   Auto-restart limits are admin-configurable via Settings`);
}

export interface HealthCheckResult {
  healthy: boolean;
  checks: {
    database: { status: "ok" | "error" | "warning"; message: string };
    environment: { status: "ok" | "warning"; missing: string[] };
    integrations: {
      status: "ok" | "warning";
      details: {
        twilio: boolean;
        stripe: { configured: boolean; enabled: boolean };
        razorpay: { configured: boolean; enabled: boolean };
        openai: boolean;
        smtp: boolean;
      };
    };
  };
  warnings: string[];
  errors: string[];
}

const REQUIRED_ENV_VARS = ["DATABASE_URL", "JWT_SECRET"];

const OPTIONAL_ENV_VARS = [
  { key: "TWILIO_ACCOUNT_SID", name: "Twilio Account SID" },
  { key: "TWILIO_AUTH_TOKEN", name: "Twilio Auth Token" },
  { key: "OPENAI_API_KEY", name: "OpenAI" },
  { key: "STRIPE_SECRET_KEY", name: "Stripe Secret Key" },
  { key: "VITE_STRIPE_PUBLIC_KEY", name: "Stripe Public Key" },
  { key: "SMTP_HOST", name: "SMTP Host" },
  { key: "SMTP_USER", name: "SMTP User" },
  { key: "SMTP_PASS", name: "SMTP Password" },
];

export async function runStartupHealthCheck(): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    healthy: true,
    checks: {
      database: { status: "ok", message: "Connected" },
      environment: { status: "ok", missing: [] },
      integrations: {
        status: "ok",
        details: {
          twilio: false,
          stripe: { configured: false, enabled: false },
          razorpay: { configured: false, enabled: false },
          openai: false,
          smtp: false,
        },
      },
    },
    warnings: [],
    errors: [],
  };

  await logSystemResources();
  console.log("🔍 [Startup] Running health checks...");

  await checkDatabase(result);
  checkEnvironment(result);
  await checkIntegrations(result);

  await logHealthCheckResults(result);

  return result;
}

async function checkDatabase(result: HealthCheckResult): Promise<void> {
  try {
    await db.execute(sql`SELECT 1`);

    const tableCheck = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'agents', 'campaigns', 'calls', 'plans')
    `);

    const existingTables = (tableCheck.rows as any[]).map(
      (r: any) => r.table_name,
    );
    const requiredTables = ["users", "agents", "campaigns", "calls", "plans"];
    const missingTables = requiredTables.filter(
      (t) => !existingTables.includes(t),
    );

    if (missingTables.length > 0) {
      result.checks.database = {
        status: "warning",
        message: `Missing tables: ${missingTables.join(", ")}. Run npm run db:push to initialize.`,
      };
      result.warnings.push(
        `Database tables missing: ${missingTables.join(", ")}`,
      );
    } else {
      const schemaIssues = await validateSchemaColumns();
      if (schemaIssues.length > 0) {
        result.checks.database = {
          status: "warning",
          message: `Schema drift detected: ${schemaIssues.length} column issue(s). Run npm run db:push to fix.`,
        };
        for (const issue of schemaIssues) {
          result.warnings.push(`Schema: ${issue}`);
        }
      } else {
        result.checks.database = {
          status: "ok",
          message: "All tables present",
        };
      }
    }
  } catch (error: any) {
    result.healthy = false;
    result.checks.database = {
      status: "error",
      message: error.message || "Database connection failed",
    };
    result.errors.push(`Database: ${error.message}`);
  }
}

async function validateSchemaColumns(): Promise<string[]> {
  const issues: string[] = [];

  const expectedColumns: Record<string, string[]> = {
    users: [
      "id",
      "email",
      "password",
      "name",
      "role",
      "plan_type",
      "plan_expires_at",
      "credits",
    ],
    agents: [
      "id",
      "user_id",
      "name",
      "type",
      "system_prompt",
      "eleven_labs_agent_id",
    ],
    campaigns: ["id", "user_id", "name", "status", "agent_id"],
    plans: ["id", "name", "monthly_price", "yearly_price"],
  };

  for (const [table, columns] of Object.entries(expectedColumns)) {
    try {
      const result = await db.execute(sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = ${table}
      `);

      const existingColumns = (result.rows as any[]).map(
        (r: any) => r.column_name,
      );

      for (const col of columns) {
        if (!existingColumns.includes(col)) {
          issues.push(`Missing column: ${table}.${col}`);
        }
      }
    } catch (error) {}
  }

  return issues;
}

function checkEnvironment(result: HealthCheckResult): void {
  const missing: string[] = [];

  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    result.healthy = false;
    result.checks.environment = { status: "warning", missing };
    result.errors.push(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }

  const missingOptional: string[] = [];
  for (const envVar of OPTIONAL_ENV_VARS) {
    if (!process.env[envVar.key]) {
      missingOptional.push(envVar.name);
    }
  }

  if (missingOptional.length > 0) {
    result.warnings.push(
      `Optional integrations not configured: ${missingOptional.join(", ")}`,
    );
  }
}

async function checkIntegrations(result: HealthCheckResult): Promise<void> {
  const details = result.checks.integrations.details;

  // Twilio: Check database settings first (production), fallback to env vars (development)
  details.twilio = false;
  try {
    const { storage } = await import("../storage");
    const twilioSid = await storage.getGlobalSetting("twilio_account_sid");
    const twilioToken = await storage.getGlobalSetting("twilio_auth_token");
    const dbConfigured = !!(twilioSid?.value && twilioToken?.value);
    const envConfigured = !!(
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    );
    details.twilio = dbConfigured || envConfigured;
  } catch (error) {
    // Fallback to env vars if storage check fails
    details.twilio = !!(
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    );
  }

  // OpenAI: Check database settings first (production), fallback to env vars (development)
  details.openai = false;
  try {
    const { storage } = await import("../storage");
    const openaiKey = await storage.getGlobalSetting("openai_api_key");
    const dbConfigured = !!openaiKey?.value;
    const envConfigured = !!process.env.OPENAI_API_KEY;
    details.openai = dbConfigured || envConfigured;
  } catch (error) {
    // Fallback to env vars if storage check fails
    details.openai = !!process.env.OPENAI_API_KEY;
  }

  // Verify SMTP connection with timeout (don't block startup if SMTP is slow)
  // Email service may be configured via env vars OR database settings
  const smtpIsEnabled = emailService.isEnabled();

  if (smtpIsEnabled) {
    try {
      const SMTP_VERIFY_TIMEOUT_MS = 5000; // 5 second timeout
      const verifyPromise = emailService.verifyConnection();
      const timeoutPromise = new Promise<boolean>((_, reject) =>
        setTimeout(
          () => reject(new Error("SMTP verification timeout")),
          SMTP_VERIFY_TIMEOUT_MS,
        ),
      );

      const smtpVerified = await Promise.race([verifyPromise, timeoutPromise]);
      details.smtp = smtpVerified;
      if (!smtpVerified) {
        result.warnings.push(
          "SMTP credentials configured but connection failed. Emails will not be sent.",
        );
      }
    } catch (error: any) {
      details.smtp = false;
      const errorMsg = error?.message?.includes("timeout")
        ? "SMTP verification timed out (server slow/unreachable)"
        : "SMTP connection verification failed";
      result.warnings.push(`${errorMsg}. Emails will not be sent.`);
    }
  } else {
    details.smtp = false;
    // Only add warning if some SMTP vars are present (partial configuration)
    const missingVars = [];
    if (!process.env.SMTP_HOST) missingVars.push("SMTP_HOST");
    if (!process.env.SMTP_USER) missingVars.push("SMTP_USER");
    if (!process.env.SMTP_PASS) missingVars.push("SMTP_PASS");
    if (missingVars.length > 0 && missingVars.length < 3) {
      // Some SMTP vars are set, but not all - this is likely a misconfiguration
      result.warnings.push(
        `SMTP partially configured. Missing: ${missingVars.join(", ")}. Emails will not be sent.`,
      );
    }
    // If all 3 are missing, check if configured via database but failed to initialize
    // This is handled by the email service logging already
  }

  try {
    details.stripe.configured = await isStripeConfigured();
    details.stripe.enabled = await isStripeEnabled();
  } catch (error) {
    details.stripe.configured = false;
    details.stripe.enabled = false;
  }

  try {
    details.razorpay.configured = await isRazorpayConfigured();
    details.razorpay.enabled = await isRazorpayEnabled();
  } catch (error) {
    details.razorpay.configured = false;
    details.razorpay.enabled = false;
  }

  // FalkorDB (Knowledge Graph)
  let falkordbHealthy = false;
  try {
    const { falkordbPoolManager } = await import("../infrastructure");
    if (falkordbPoolManager.isReady()) {
      const fkHealth = await falkordbPoolManager.healthCheck();
      falkordbHealthy = fkHealth.healthy;
    } else {
      // FalkorDB not initialized — optional service, just warn
      falkordbHealthy = false;
    }
  } catch (error) {
    falkordbHealthy = false;
  }

  if (!falkordbHealthy) {
    result.warnings.push(
      "FalkorDB not available. Knowledge graph features will be disabled.",
    );
  }

  const hasAnyPayment = details.stripe.enabled || details.razorpay.enabled;
  if (!hasAnyPayment) {
    result.warnings.push(
      "No payment gateway configured. Users cannot purchase subscriptions or credits.",
    );
  }

  if (!details.twilio) {
    result.warnings.push(
      "Twilio credentials not configured. Phone calling features will be disabled.",
    );
  }

  if (!details.openai) {
    result.warnings.push(
      "OpenAI API key not configured. Knowledge base embeddings will be disabled.",
    );
  }

  // Note: SMTP warnings are already added in the verification block above, no need for duplicate
}

async function logHealthCheckResults(result: HealthCheckResult): Promise<void> {
  const status = result.healthy ? "✅" : "❌";
  console.log(
    `${status} [Startup] Health check ${result.healthy ? "PASSED" : "FAILED"}`,
  );

  console.log(
    "   📊 Database:",
    result.checks.database.status.toUpperCase(),
    "-",
    result.checks.database.message,
  );

  if (result.checks.environment.missing.length > 0) {
    console.log(
      "   ⚠️  Environment: Missing",
      result.checks.environment.missing.join(", "),
    );
  } else {
    console.log("   ✅ Environment: All required variables present");
  }

  const intDetails = result.checks.integrations.details;
  // Check FalkorDB status for display
  let falkordbStatus = false;
  try {
    const { falkordbPoolManager } = await import("../infrastructure");
    falkordbStatus = falkordbPoolManager?.isReady() ?? false;
  } catch {
    falkordbStatus = false;
  }

  console.log("   🔌 Integrations:");
  console.log(`      - Twilio: ${intDetails.twilio ? "✅" : "❌"}`);
  console.log(`      - OpenAI: ${intDetails.openai ? "✅" : "❌"}`);
  console.log(
    `      - Stripe: ${intDetails.stripe.enabled ? "✅ Enabled" : intDetails.stripe.configured ? "⚠️ Configured (disabled)" : "❌ Not configured"}`,
  );
  console.log(
    `      - Razorpay: ${intDetails.razorpay.enabled ? "✅ Enabled" : intDetails.razorpay.configured ? "⚠️ Configured (disabled)" : "❌ Not configured"}`,
  );
  console.log(`      - SMTP: ${intDetails.smtp ? "✅" : "❌"}`);
  console.log(`      - FalkorDB: ${falkordbStatus ? "✅" : "❌"}`);

  if (result.warnings.length > 0) {
    console.log("   ⚠️  Warnings:");
    for (const warning of result.warnings) {
      console.log(`      - ${warning}`);
    }
  }

  if (result.errors.length > 0) {
    console.log("   ❌ Errors:");
    for (const error of result.errors) {
      console.log(`      - ${error}`);
    }
  }
}

export async function getHealthStatus(): Promise<{
  status: "healthy" | "degraded" | "unhealthy";
  checks: HealthCheckResult["checks"];
  timestamp: string;
}> {
  const result = await runStartupHealthCheck();

  let status: "healthy" | "degraded" | "unhealthy";
  if (!result.healthy) {
    status = "unhealthy";
  } else if (result.warnings.length > 0) {
    status = "degraded";
  } else {
    status = "healthy";
  }

  return {
    status,
    checks: result.checks,
    timestamp: new Date().toISOString(),
  };
}
