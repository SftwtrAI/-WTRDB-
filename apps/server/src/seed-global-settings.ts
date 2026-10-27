import { db } from "./db";
import { globalSettings } from "@wtrops/shared";
import { sql } from "drizzle-orm";

const GLOBAL_SETTINGS_SEED_DATA = [
  // ============================================
  // BRANDING & COMPANY SETTINGS
  // ============================================
  {
    key: "company_name",
    value: "Wtrops.ai",
    description: "Company name displayed throughout the platform",
  },
  {
    key: "company_tagline",
    value: "AI-Powered Bulk Calling Platform",
    description: "Company tagline for branding",
  },
  {
    key: "company_logo_url",
    value: "",
    description: "URL to company logo image",
  },
  {
    key: "company_favicon_url",
    value: "",
    description: "URL to favicon",
  },
  {
    key: "support_email",
    value: "",
    description: "Support email address (must be configured in Admin Panel)",
  },
  {
    key: "support_phone",
    value: "",
    description: "Support phone number",
  },
  {
    key: "company_address",
    value: "",
    description: "Company physical address",
  },
  {
    key: "terms_url",
    value: "/terms",
    description: "Terms of Service URL",
  },
  {
    key: "privacy_url",
    value: "/privacy",
    description: "Privacy Policy URL",
  },

  // ============================================
  // PLATFORM FEATURE FLAGS
  // ============================================
  {
    key: "feature_registration_enabled",
    value: true,
    description: "Enable/disable new user registration",
  },
  {
    key: "feature_google_auth_enabled",
    value: false,
    description: "Enable/disable Google OAuth login",
  },
  {
    key: "feature_email_verification_required",
    value: false,
    description: "Require email verification for new accounts",
  },
  {
    key: "feature_maintenance_mode",
    value: false,
    description: "Enable maintenance mode (blocks user access)",
  },
  {
    key: "feature_demo_mode",
    value: false,
    description: "Enable demo mode with sample data",
  },

  // ============================================
  // CREDIT & BILLING SETTINGS
  // ============================================
  {
    key: "low_credits_threshold",
    value: 50,
    description: "Credit balance below which to send low credits alert",
  },
  {
    key: "credits_per_minute",
    value: 1,
    description: "Credits consumed per minute of call time",
  },
  {
    key: "free_trial_credits",
    value: 50,
    description:
      "Credits given to new users on signup (DEPRECATED: now uses Free plan includedCredits)",
  },
  {
    key: "phone_number_monthly_credits",
    value: 1190,
    description: "Credits charged monthly for renting a phone number",
  },
  {
    key: "currency_default",
    value: "INR",
    description: "Default currency for the platform",
  },
  {
    key: "currency_symbol",
    value: "₹",
    description: "Default currency symbol",
  },

  // Credit system overhaul settings
  {
    key: "infra_surcharge_outbound_per_min",
    value: 8,
    description: "Infrastructure surcharge credits per minute for outbound calls",
  },
  {
    key: "infra_surcharge_inbound_per_min",
    value: 0,
    description: "Infrastructure surcharge credits per minute for inbound calls",
  },
  {
    key: "credit_value_inr",
    value: 0.84,
    description: "Value of 1 credit in INR",
  },
  {
    key: "credit_value_usd",
    value: 0.01,
    description: "Value of 1 credit in USD",
  },
  {
    key: "signup_bonus_enabled",
    value: true,
    description: "Enable signup bonus credits for new users",
  },
  {
    key: "monthly_grant_enabled",
    value: true,
    description: "Enable monthly credit grants for free plan users",
  },
  {
    key: "mini_credits_per_min",
    value: 14,
    description: "Fallback credits per minute for mini tier models (6 token + 8 infra)",
  },
  {
    key: "standard_credits_per_min",
    value: 25,
    description: "Fallback credits per minute for standard tier models (17 token + 8 infra)",
  },

  // ============================================
  // CALL SETTINGS
  // ============================================
  {
    key: "max_call_duration_seconds",
    value: 1800,
    description: "Maximum call duration in seconds (30 minutes)",
  },
  {
    key: "default_call_retry_attempts",
    value: 2,
    description: "Default number of retry attempts for failed calls",
  },
  {
    key: "call_recording_enabled",
    value: true,
    description: "Enable call recording by default",
  },
  {
    key: "transcription_enabled",
    value: true,
    description: "Enable call transcription by default",
  },

  // ============================================
  // CAMPAIGN SETTINGS
  // ============================================
  {
    key: "campaign_batch_size",
    value: 10,
    description: "Number of calls to process per batch",
  },
  {
    key: "campaign_rate_limit_per_minute",
    value: 60,
    description: "Maximum calls per minute per campaign",
  },
  {
    key: "campaign_time_window_start",
    value: "09:00",
    description: "Default campaign calling window start time",
  },
  {
    key: "campaign_time_window_end",
    value: "18:00",
    description: "Default campaign calling window end time",
  },
  {
    key: "campaign_timezone_default",
    value: "Asia/Kolkata",
    description: "Default timezone for campaign scheduling",
  },

  // ============================================
  // WEBHOOK & INTEGRATION SETTINGS
  // ============================================
  {
    key: "webhook_retry_max_attempts",
    value: 5,
    description: "Maximum webhook retry attempts",
  },
  {
    key: "webhook_retry_intervals_minutes",
    value: [1, 5, 15, 30, 60],
    description:
      "Retry intervals in minutes for each attempt (array of 5 values)",
  },
  {
    key: "webhook_expiry_hours",
    value: 24,
    description: "Hours before a failed webhook expires and stops retrying",
  },
  {
    key: "webhook_timeout_seconds",
    value: 30,
    description: "Webhook request timeout in seconds",
  },

  // ============================================
  // SECURITY SETTINGS
  // ============================================
  {
    key: "otp_expiry_minutes",
    value: 5,
    description: "OTP verification code expiry time in minutes",
  },
  {
    key: "jwt_expiry_days",
    value: 7,
    description: "JWT token expiry time in days",
  },
  {
    key: "session_timeout_minutes",
    value: 1440,
    description: "Session timeout in minutes (24 hours)",
  },
  {
    key: "password_min_length",
    value: 8,
    description: "Minimum password length",
  },
  {
    key: "max_login_attempts",
    value: 5,
    description: "Maximum login attempts before lockout",
  },
  {
    key: "lockout_duration_minutes",
    value: 30,
    description: "Account lockout duration in minutes",
  },
  {
    key: "api_rate_limit_requests",
    value: 1000,
    description: "API rate limit - requests per hour",
  },

  // ============================================
  // NOTIFICATION SETTINGS
  // ============================================
  {
    key: "notification_low_credits_enabled",
    value: true,
    description: "Send email when credits are low",
  },
  {
    key: "notification_campaign_completed_enabled",
    value: true,
    description: "Send email when campaign completes",
  },
  {
    key: "notification_payment_received_enabled",
    value: true,
    description: "Send email on successful payment",
  },
  {
    key: "notification_payment_failed_enabled",
    value: true,
    description: "Send email on failed payment",
  },

  // ============================================
  // SYSTEM SETTINGS
  // ============================================
  {
    key: "system_timezone",
    value: "UTC",
    description: "System default timezone",
  },
  {
    key: "system_date_format",
    value: "YYYY-MM-DD",
    description: "System date format",
  },
  {
    key: "system_time_format",
    value: "HH:mm:ss",
    description: "System time format",
  },
  {
    key: "pagination_default_limit",
    value: 25,
    description: "Default pagination limit",
  },
  {
    key: "pagination_max_limit",
    value: 100,
    description: "Maximum pagination limit",
  },

  // ============================================
  // CONNECTION LIMITS
  // ============================================
  {
    key: "max_ws_connections_per_process",
    value: 1000,
    description: "Maximum WebSocket connections per server process",
  },
  {
    key: "max_ws_connections_per_user",
    value: 5,
    description: "Maximum concurrent call connections per user",
  },
  {
    key: "max_ws_connections_per_ip",
    value: 10,
    description: "Maximum WebSocket connections per IP address",
  },
  {
    key: "max_openai_connections_per_credential",
    value: 50,
    description: "Maximum concurrent OpenAI connections per API key",
  },
  {
    key: "openai_connection_timeout_ms",
    value: 3600000,
    description: "OpenAI connection timeout in milliseconds",
  },
  {
    key: "openai_idle_timeout_ms",
    value: 300000,
    description: "OpenAI connection idle timeout in milliseconds",
  },
  {
    key: "db_pool_min_connections",
    value: 2,
    description: "Minimum database connections in pool",
  },
  {
    key: "db_pool_max_connections",
    value: 20,
    description: "Maximum database connections in pool",
  },
  {
    key: "db_pool_idle_timeout_ms",
    value: 30000,
    description: "Database connection idle timeout in milliseconds",
  },
  {
    key: "campaign_batch_concurrency",
    value: 10,
    description: "Number of concurrent calls per campaign batch",
  },

  // ============================================
  // SEED VERSIONING
  // ============================================
  {
    key: "seed_version",
    value: "1.0.0",
    description: "Version of seed data applied (used for tracking updates)",
  },
  {
    key: "seed_applied_at",
    value: new Date().toISOString(),
    description: "Timestamp when seed data was last applied",
  },
];

async function seedGlobalSettings() {
  try {
    console.log("⚙️  Starting Global Settings seed...");

    console.log(`📦 Upserting ${GLOBAL_SETTINGS_SEED_DATA.length} global settings...`);

    for (const setting of GLOBAL_SETTINGS_SEED_DATA) {
      await db.execute(sql`
        INSERT INTO global_settings (id, key, value, description, updated_at)
        VALUES (gen_random_uuid(), ${setting.key}, ${JSON.stringify(setting.value)}::jsonb, ${setting.description}, NOW())
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          description = EXCLUDED.description,
          updated_at = NOW()
      `);
    }

    const settingsToInsert = GLOBAL_SETTINGS_SEED_DATA;

    console.log("✅ Successfully seeded Global Settings!");

    const categories = {
      Branding: settingsToInsert.filter(
        (s) => s.key.startsWith("company_") || s.key.includes("_url"),
      ).length,
      Features: settingsToInsert.filter((s) => s.key.startsWith("feature_"))
        .length,
      Credits: settingsToInsert.filter(
        (s) => s.key.includes("credit") || s.key.includes("currency"),
      ).length,
      Calls: settingsToInsert.filter(
        (s) => s.key.includes("call_") && !s.key.includes("campaign"),
      ).length,
      Campaigns: settingsToInsert.filter((s) => s.key.startsWith("campaign_"))
        .length,
      Webhooks: settingsToInsert.filter((s) => s.key.startsWith("webhook_"))
        .length,
      Security: settingsToInsert.filter(
        (s) =>
          s.key.includes("password") ||
          s.key.includes("login") ||
          s.key.includes("session") ||
          s.key.includes("rate_limit"),
      ).length,
      Notifications: settingsToInsert.filter((s) =>
        s.key.startsWith("notification_"),
      ).length,
      System: settingsToInsert.filter(
        (s) => s.key.startsWith("system_") || s.key.startsWith("pagination_"),
      ).length,
      "Connection Limits": settingsToInsert.filter(
        (s) =>
          s.key.includes("_connections") ||
          s.key.includes("_pool_") ||
          s.key.includes("_timeout_ms") ||
          s.key === "campaign_batch_concurrency",
      ).length,
    };

    Object.entries(categories).forEach(([category, count]) => {
      if (count > 0) {
        console.log(`   - ${category}: ${count} settings`);
      }
    });
  } catch (error) {
    console.error("❌ Error seeding Global Settings:", error);
    throw error;
  }
}

export { seedGlobalSettings, GLOBAL_SETTINGS_SEED_DATA };
