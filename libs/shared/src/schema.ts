import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  timestamp,
  boolean,
  jsonb,
  decimal,
  serial,
  unique,
  bigint,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("user"),
  planType: text("plan_type").notNull().default("free"), // 'free' or 'pro'
  planExpiresAt: timestamp("plan_expires_at"),
  credits: integer("credits").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  maxWebhooks: integer("max_webhooks").notNull().default(3), // Webhook subscription limit (admin can adjust)
  isDeleted: boolean("is_deleted").notNull().default(false), // Soft delete flag - user requested account deletion
  deletedAt: timestamp("deleted_at"), // When the user requested deletion
  deletedBy: varchar("deleted_by"), // Who deleted: 'user' for self-deletion, admin user ID for admin deletion
  // Timezone preference - IANA timezone string (e.g., "America/New_York", "Europe/London")
  timezone: text("timezone"),
  // GDPR Consent preferences
  cookieConsent: boolean("cookie_consent"), // Essential cookies always enabled, this tracks analytics/marketing consent
  analyticsConsent: boolean("analytics_consent"),
  marketingConsent: boolean("marketing_consent"),
  consentTimestamp: timestamp("consent_timestamp"), // When user gave/updated consent
  termsAcceptedAt: timestamp("terms_accepted_at"), // When user accepted Terms of Service
  privacyAcceptedAt: timestamp("privacy_accepted_at"), // When user accepted Privacy Policy
  // User blocking for content violations
  blockedReason: text("blocked_reason"), // Reason for blocking (e.g., "Content violation: banned words detected")
  blockedAt: timestamp("blocked_at"), // When the user was blocked
  blockedBy: varchar("blocked_by"), // Admin who blocked the user
  // Billing Details - Stored for payment processing and pre-filling
  billingName: text("billing_name"),
  billingAddressLine1: text("billing_address_line1"),
  billingAddressLine2: text("billing_address_line2"),
  billingCity: text("billing_city"),
  billingState: text("billing_state"),
  billingPostalCode: text("billing_postal_code"),
  billingCountry: text("billing_country"),
  company: text("company"), // Company name for profile and team naming
  // Credit system overhaul fields
  signupBonusCredited: boolean("signup_bonus_credited").notNull().default(false),
  monthlyCreditsGrantedAt: timestamp("monthly_credits_granted_at"),
  rolloverCredits: integer("rollover_credits").notNull().default(0),
  // MFA (Multi-Factor Authentication) — CMMC IA.2.081
  mfaSecret: text("mfa_secret"), // Encrypted TOTP secret
  mfaEnabled: boolean("mfa_enabled").default(false),
  mfaVerifiedAt: timestamp("mfa_verified_at"), // When MFA was last verified
  mfaBackupCodes: jsonb("mfa_backup_codes").$type<string[]>(), // Hashed backup codes
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// OTP Verifications for signup
export const otpVerifications = pgTable("otp_verifications", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  otpCode: text("otp_code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Refresh Tokens for session management
export const refreshTokens = pgTable("refresh_tokens", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  isValid: boolean("is_valid").notNull().default(true),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const knowledgeBase = pgTable("knowledge_base", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  content: text("content"),
  url: text("url"),
  fileUrl: text("file_url"),
  elevenLabsDocId: text("eleven_labs_doc_id"),
  metadata: jsonb("metadata"),
  storageSize: integer("storage_size").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// New SaaS Platform Tables
export const plans = pgTable("plans", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(), // 'free' or 'pro'
  displayName: text("display_name").notNull(),
  description: text("description").notNull(),
  monthlyPrice: decimal("monthly_price", { precision: 10, scale: 2 }).notNull(), // USD price
  yearlyPrice: decimal("yearly_price", { precision: 10, scale: 2 }), // USD price
  razorpayMonthlyPrice: decimal("razorpay_monthly_price", {
    precision: 10,
    scale: 2,
  }), // INR price
  razorpayYearlyPrice: decimal("razorpay_yearly_price", {
    precision: 10,
    scale: 2,
  }), // INR price
  stripeMonthlyPriceId: text("stripe_monthly_price_id"), // Stripe Price ID for monthly plan
  stripeYearlyPriceId: text("stripe_yearly_price_id"), // Stripe Price ID for yearly plan
  stripeProductId: text("stripe_product_id"), // Stripe Product ID
  razorpayPlanId: text("razorpay_plan_id"), // Razorpay Plan ID (monthly)
  razorpayYearlyPlanId: text("razorpay_yearly_plan_id"), // Razorpay Plan ID (yearly)

  // PayPal pricing and plan IDs
  paypalMonthlyPrice: decimal("paypal_monthly_price", {
    precision: 10,
    scale: 2,
  }), // PayPal price (supports multiple currencies)
  paypalYearlyPrice: decimal("paypal_yearly_price", {
    precision: 10,
    scale: 2,
  }),
  paypalProductId: text("paypal_product_id"), // PayPal Product ID
  paypalMonthlyPlanId: text("paypal_monthly_plan_id"), // PayPal Plan ID for monthly
  paypalYearlyPlanId: text("paypal_yearly_plan_id"), // PayPal Plan ID for yearly

  // Paystack pricing and plan codes (Africa: NGN, GHS, ZAR, KES)
  paystackMonthlyPrice: decimal("paystack_monthly_price", {
    precision: 10,
    scale: 2,
  }),
  paystackYearlyPrice: decimal("paystack_yearly_price", {
    precision: 10,
    scale: 2,
  }),
  paystackMonthlyPlanCode: text("paystack_monthly_plan_code"), // Paystack Plan Code for monthly
  paystackYearlyPlanCode: text("paystack_yearly_plan_code"), // Paystack Plan Code for yearly

  // MercadoPago pricing and plan IDs (LATAM: BRL, MXN, ARS, CLP, COP)
  mercadopagoMonthlyPrice: decimal("mercadopago_monthly_price", {
    precision: 10,
    scale: 2,
  }),
  mercadopagoYearlyPrice: decimal("mercadopago_yearly_price", {
    precision: 10,
    scale: 2,
  }),
  mercadopagoMonthlyPlanId: text("mercadopago_monthly_plan_id"), // MercadoPago preapproval_plan_id
  mercadopagoYearlyPlanId: text("mercadopago_yearly_plan_id"),

  maxAgents: integer("max_agents").notNull().default(1),
  maxCampaigns: integer("max_campaigns").notNull().default(1),
  maxContactsPerCampaign: integer("max_contacts_per_campaign")
    .notNull()
    .default(5),
  maxWebhooks: integer("max_webhooks").notNull().default(3), // Max webhook subscriptions
  maxKnowledgeBases: integer("max_knowledge_bases").notNull().default(5), // Max knowledge base items
  maxFlows: integer("max_flows").notNull().default(3), // Max flow automations
  maxPhoneNumbers: integer("max_phone_numbers").notNull().default(1), // Max rented phone numbers
  maxWidgets: integer("max_widgets").notNull().default(1), // Max website widgets
  includedCredits: integer("included_credits").notNull().default(0),
  defaultLlmModel: text("default_llm_model"), // For free plan restrictions
  canChooseLlm: boolean("can_choose_llm").notNull().default(false),
  canPurchaseNumbers: boolean("can_purchase_numbers").notNull().default(false),
  useSystemPool: boolean("use_system_pool").notNull().default(true), // Free plan uses system pool
  features: jsonb("features"), // Additional feature flags

  // SIP Engine Plugin - Plan-level access control
  sipEnabled: boolean("sip_enabled").notNull().default(false),
  maxConcurrentSipCalls: integer("max_concurrent_sip_calls")
    .notNull()
    .default(1),
  sipEnginesAllowed: text("sip_engines_allowed")
    .array()
    .default(sql`ARRAY['elevenlabs-sip']::text[]`), // ['elevenlabs-sip', 'fonoster-openai']

  // REST API Plugin - Plan-level access control
  restApiEnabled: boolean("rest_api_enabled").notNull().default(false),

  // Team Management Plugin - Plan-level access control
  teamManagementEnabled: boolean("team_management_enabled")
    .notNull()
    .default(false),
  maxTeamMembers: integer("max_team_members").notNull().default(0), // 0 = disabled
  maxCustomRoles: integer("max_custom_roles").notNull().default(0), // 0 = disabled

  // Credit system overhaul fields
  signupBonusCredits: integer("signup_bonus_credits").notNull().default(0),
  creditRolloverMonths: integer("credit_rollover_months").notNull().default(0),
  creditRolloverCap: integer("credit_rollover_cap").notNull().default(0),
  maxKnowledgeBaseSizeMb: integer("max_knowledge_base_size_mb").notNull().default(0),
  supportTier: text("support_tier").notNull().default('community'),

  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Global Platform Settings
export const globalSettings = pgTable("global_settings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// LLM Models - Available models with tier restrictions
export const llmModels = pgTable("llm_models", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  modelId: text("model_id").notNull().unique(), // e.g., 'gpt-4o-mini', 'claude-3-5-sonnet'
  name: text("name").notNull(), // Display name e.g., 'GPT-4o Mini (OpenAI)'
  provider: text("provider").notNull(), // 'openai', 'anthropic', 'google', 'elevenlabs'
  tier: text("tier").notNull(), // 'free' or 'pro'
  creditTier: text("credit_tier").notNull().default('standard'), // 'mini' or 'standard'
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0), // For custom ordering in UI
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});


// Canonical, append-only credit ledger
export const creditLedgerEntries = pgTable("credit_ledger_entries", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  entryType: text("entry_type").notNull(), // grant, debit, refund, adjustment, expiry
  sourceType: text("source_type").notNull(), // signup_bonus, monthly_grant, voice_call, task_execution, topup
  sourceId: text("source_id"),
  amount: integer("amount").notNull(), // signed credits delta
  description: text("description").notNull(),
  idempotencyKey: text("idempotency_key").unique(),
  metadata: jsonb("metadata"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Bucketed balances to support rollover + expiry semantics
export const creditBalanceBuckets = pgTable("credit_balance_buckets", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(), // signup_bonus, monthly_grant, topup, etc.
  sourceId: text("source_id"),
  initialCredits: integer("initial_credits").notNull(),
  remainingCredits: integer("remaining_credits").notNull(),
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
  status: text("status").notNull().default("active"), // active, exhausted, expired
  ledgerEntryId: varchar("ledger_entry_id").references(
    () => creditLedgerEntries.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});


// Credit Packages
export const creditPackages = pgTable("credit_packages", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  credits: integer("credits").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(), // USD price
  razorpayPrice: decimal("razorpay_price", { precision: 10, scale: 2 }), // INR price
  stripeProductId: text("stripe_product_id"),
  stripePriceId: text("stripe_price_id"),
  razorpayItemId: text("razorpay_item_id"), // Razorpay Item ID for credit package

  // PayPal credit package pricing
  paypalPrice: decimal("paypal_price", { precision: 10, scale: 2 }), // PayPal price

  // Paystack credit package pricing (Africa)
  paystackPrice: decimal("paystack_price", { precision: 10, scale: 2 }), // Paystack price

  // MercadoPago credit package pricing (LATAM)
  mercadopagoPrice: decimal("mercadopago_price", { precision: 10, scale: 2 }), // MercadoPago price

  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// User Subscriptions
export const userSubscriptions = pgTable("user_subscriptions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  planId: varchar("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("active"), // 'active', 'cancelled', 'expired'
  currentPeriodStart: timestamp("current_period_start").notNull().defaultNow(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(), // Unique constraint for idempotency
  razorpaySubscriptionId: text("razorpay_subscription_id").unique(), // Razorpay Subscription ID

  // PayPal subscription tracking
  paypalSubscriptionId: text("paypal_subscription_id").unique(), // PayPal Subscription ID

  // Paystack subscription tracking (Africa)
  paystackSubscriptionCode: text("paystack_subscription_code").unique(), // Paystack Subscription Code
  paystackCustomerCode: text("paystack_customer_code"), // Paystack Customer Code
  paystackEmailToken: text("paystack_email_token"), // Token for customer management

  // MercadoPago subscription tracking (LATAM)
  mercadopagoSubscriptionId: text("mercadopago_subscription_id").unique(), // MercadoPago preapproval ID

  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  billingPeriod: text("billing_period").notNull().default("monthly"), // 'monthly' or 'yearly'

  // Admin-set per-user limit overrides (null = use plan defaults)
  overrideMaxAgents: integer("override_max_agents"), // Override plan's maxAgents
  overrideMaxCampaigns: integer("override_max_campaigns"), // Override plan's maxCampaigns
  overrideMaxContactsPerCampaign: integer("override_max_contacts_per_campaign"), // Override plan's maxContactsPerCampaign
  overrideMaxWebhooks: integer("override_max_webhooks"), // Override plan's maxWebhooks
  overrideMaxKnowledgeBases: integer("override_max_knowledge_bases"), // Override plan's maxKnowledgeBases
  overrideMaxFlows: integer("override_max_flows"), // Override plan's maxFlows
  overrideMaxPhoneNumbers: integer("override_max_phone_numbers"), // Override plan's maxPhoneNumbers
  overrideMaxWidgets: integer("override_max_widgets"), // Override plan's maxWidgets
  overrideIncludedCredits: integer("override_included_credits"), // Override plan's includedCredits

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});



// Notifications
export const notifications = pgTable("notifications", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, {
    onDelete: "cascade",
  }), // Nullable for broadcast notifications
  type: text("type").notNull(), // low_credits, membership_upgraded, membership_expiry, campaign_completed, campaign_failed, etc.
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link"), // Optional link to navigate when clicked
  icon: text("icon"), // Custom icon name (lucide icon name)
  displayType: text("display_type").notNull().default("bell"), // 'bell', 'banner', or 'both'
  priority: integer("priority").notNull().default(0), // For ordering banner notifications (higher = more important)
  dismissible: boolean("dismissible").notNull().default(true), // Whether the notification can be dismissed
  expiresAt: timestamp("expires_at"), // When the notification should expire (null = never)
  isRead: boolean("is_read").notNull().default(false),
  isDismissed: boolean("is_dismissed").notNull().default(false), // For banner dismissals
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Email Templates - Customizable email templates for system notifications
export const emailTemplates = pgTable("email_templates", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  templateType: text("template_type").notNull().unique(), // 'otp', 'welcome', 'low_credits', 'campaign_complete', 'membership_upgrade', etc.
  name: text("name").notNull(), // Display name for admin
  subject: text("subject").notNull(), // Email subject line with variable support
  htmlBody: text("html_body").notNull(), // HTML email body with variable support
  textBody: text("text_body").notNull(), // Plain text fallback with variable support
  variables: text("variables").array(), // Available variables: ['userName', 'companyName', 'code', etc.]
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Prompt Templates - Reusable system prompts with variable placeholders
// Users can create templates with {{variable}} syntax for personalization
export const promptTemplates = pgTable("prompt_templates", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, {
    onDelete: "cascade",
  }), // null = system template
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("general"), // 'sales', 'support', 'appointment', 'survey', 'general'
  systemPrompt: text("system_prompt").notNull(),
  firstMessage: text("first_message"),
  variables: text("variables").array(), // Available variables: ['company', 'product', 'customerName', etc.]
  suggestedVoiceTone: text("suggested_voice_tone"), // Recommended voice settings
  suggestedPersonality: text("suggested_personality"),
  isSystemTemplate: boolean("is_system_template").notNull().default(false), // System-provided templates
  isPublic: boolean("is_public").notNull().default(false), // Can be used by other users
  usageCount: integer("usage_count").notNull().default(0), // Track popularity
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});


// Audit Logs - Track sensitive operations for security and compliance
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  action: text("action").notNull(), // e.g., 'user.login', 'admin.user_update', 'payment.subscription_created'
  userId: varchar("user_id").references(() => users.id, {
    onDelete: "set null",
  }), // User who performed the action
  targetUserId: varchar("target_user_id").references(() => users.id, {
    onDelete: "set null",
  }), // User affected by the action
  resourceType: text("resource_type"), // e.g., 'agent', 'campaign', 'payment'
  resourceId: varchar("resource_id"), // ID of the affected resource
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(), // Additional context
  severity: text("severity").notNull().default("info"), // 'info', 'warning', 'error', 'critical'
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
  name: true,
  role: true,
});

export const insertKnowledgeBaseSchema = createInsertSchema(knowledgeBase).omit(
  {
    id: true,
    createdAt: true,
  },
);

export const insertPromptTemplateSchema = createInsertSchema(
  promptTemplates,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usageCount: true,
});


export const insertCreditLedgerEntrySchema = createInsertSchema(
  creditLedgerEntries,
).omit({
  id: true,
  createdAt: true,
});

export const insertCreditBalanceBucketSchema = createInsertSchema(
  creditBalanceBuckets,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlanSchema = createInsertSchema(plans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGlobalSettingsSchema = createInsertSchema(
  globalSettings,
).omit({
  id: true,
  updatedAt: true,
});

export const insertLlmModelSchema = createInsertSchema(llmModels).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCreditPackageSchema = createInsertSchema(creditPackages)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    // Coerce number inputs to strings for decimal fields (frontend sends numbers)
    price: z.union([z.string(), z.number()]).transform((v) => String(v)),
    razorpayPrice: z
      .union([z.string(), z.number()])
      .transform((v) => (v != null ? String(v) : null))
      .nullable()
      .optional(),
    paypalPrice: z
      .union([z.string(), z.number()])
      .transform((v) => (v != null ? String(v) : null))
      .nullable()
      .optional(),
    paystackPrice: z
      .union([z.string(), z.number()])
      .transform((v) => (v != null ? String(v) : null))
      .nullable()
      .optional(),
    mercadopagoPrice: z
      .union([z.string(), z.number()])
      .transform((v) => (v != null ? String(v) : null))
      .nullable()
      .optional(),
  });

export const insertUserSubscriptionSchema = createInsertSchema(
  userSubscriptions,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  isRead: true,
  isDismissed: true,
});

export const insertEmailTemplateSchema = createInsertSchema(
  emailTemplates,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Twilio Supported Countries for Phone Number Purchasing
export const twilioCountries = pgTable("twilio_countries", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 2 }).notNull().unique(), // ISO 3166-1 alpha-2 code (e.g., "US", "GB")
  name: text("name").notNull(),
  dialCode: text("dial_code").notNull(), // International dialing code (e.g., "+1", "+44")
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(100), // For display ordering (popular countries first)
});

export const insertTwilioCountrySchema = createInsertSchema(
  twilioCountries,
).omit({
  id: true,
});

export type TwilioCountry = typeof twilioCountries.$inferSelect;
export type InsertTwilioCountry = z.infer<typeof insertTwilioCountrySchema>;

// ============================================
// RAG KNOWLEDGE BASE SYSTEM
// ============================================
// Separate from legacy ElevenLabs KB - stores chunks with embeddings locally
// Allows unlimited per-user storage without ElevenLabs 20MB limit

// User storage limits for RAG knowledge base
export const userKnowledgeStorageLimits = pgTable(
  "user_knowledge_storage_limits",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    maxStorageBytes: integer("max_storage_bytes").notNull().default(20971520), // 20MB default per user
    usedStorageBytes: integer("used_storage_bytes").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
);

// Knowledge chunks with embeddings for RAG retrieval
export const knowledgeChunks = pgTable("knowledge_chunks", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  knowledgeBaseId: varchar("knowledge_base_id")
    .notNull()
    .references(() => knowledgeBase.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(), // Order within the document
  chunkText: text("chunk_text").notNull(), // The actual text content
  embedding: jsonb("embedding"), // Vector embedding as JSON array of floats
  tokenCount: integer("token_count").notNull().default(0),
  metadata: jsonb("metadata"), // Page number, section, source info
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Processing queue for async embedding generation
export const knowledgeProcessingQueue = pgTable("knowledge_processing_queue", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  knowledgeBaseId: varchar("knowledge_base_id")
    .notNull()
    .references(() => knowledgeBase.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  errorMessage: text("error_message"),
  totalChunks: integer("total_chunks").default(0),
  processedChunks: integer("processed_chunks").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserKnowledgeStorageLimitSchema = createInsertSchema(
  userKnowledgeStorageLimits,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertKnowledgeChunkSchema = createInsertSchema(
  knowledgeChunks,
).omit({
  id: true,
  createdAt: true,
});

export const insertKnowledgeProcessingQueueSchema = createInsertSchema(
  knowledgeProcessingQueue,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserKnowledgeStorageLimit =
  typeof userKnowledgeStorageLimits.$inferSelect;
export type InsertUserKnowledgeStorageLimit = z.infer<
  typeof insertUserKnowledgeStorageLimitSchema
>;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
export type InsertKnowledgeChunk = z.infer<typeof insertKnowledgeChunkSchema>;
export type KnowledgeProcessingQueue =
  typeof knowledgeProcessingQueue.$inferSelect;
export type InsertKnowledgeProcessingQueue = z.infer<
  typeof insertKnowledgeProcessingQueueSchema
>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type KnowledgeBase = typeof knowledgeBase.$inferSelect;
export type InsertKnowledgeBase = z.infer<typeof insertKnowledgeBaseSchema>;
export type CreditLedgerEntry = typeof creditLedgerEntries.$inferSelect;
export type InsertCreditLedgerEntry = z.infer<
  typeof insertCreditLedgerEntrySchema
>;
export type CreditBalanceBucket = typeof creditBalanceBuckets.$inferSelect;
export type InsertCreditBalanceBucket = z.infer<
  typeof insertCreditBalanceBucketSchema
>;
export type Plan = typeof plans.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type GlobalSettings = typeof globalSettings.$inferSelect;
export type InsertGlobalSettings = z.infer<typeof insertGlobalSettingsSchema>;
export type LlmModel = typeof llmModels.$inferSelect;
export type InsertLlmModel = z.infer<typeof insertLlmModelSchema>;
export type CreditPackage = typeof creditPackages.$inferSelect;
export type InsertCreditPackage = z.infer<typeof insertCreditPackageSchema>;
export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type InsertUserSubscription = z.infer<
  typeof insertUserSubscriptionSchema
>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type PromptTemplate = typeof promptTemplates.$inferSelect;
export type InsertPromptTemplate = z.infer<typeof insertPromptTemplateSchema>;

// Webhook Subscriptions table
export const webhookSubscriptions = pgTable("webhook_subscriptions", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  url: text("url").notNull(),
  method: varchar("method", { length: 10 }).default("POST").notNull(),
  headers: jsonb("headers").$type<Record<string, string>>(),
  secret: varchar("secret", { length: 64 }).notNull(),
  authType: varchar("auth_type", { length: 50 }),
  authCredentials: jsonb("auth_credentials").$type<Record<string, string>>(),
  events: jsonb("events").notNull().$type<string[]>(),
  campaignIds: jsonb("campaign_ids").$type<string[] | null>(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Alias for backward compatibility
export const webhooks = webhookSubscriptions;

export const insertWebhookSchema = createInsertSchema(webhooks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const createWebhookSchema = insertWebhookSchema.omit({ userId: true });
export type InsertWebhook = z.infer<typeof insertWebhookSchema>;
export type CreateWebhook = z.infer<typeof createWebhookSchema>;
export type Webhook = typeof webhooks.$inferSelect;

// Webhook Delivery Logs table
export const webhookDeliveryLogs = pgTable("webhook_logs", {
  id: serial("id").primaryKey(),
  webhookId: varchar("webhook_id").references(() => webhookSubscriptions.id, {
    onDelete: "cascade",
  }),
  event: varchar("event", { length: 100 }).notNull(),
  payload: jsonb("payload").notNull(),
  success: boolean("success").notNull(),
  httpStatus: integer("status_code"),
  responseBody: text("response_body"),
  responseTime: integer("response_time"),
  error: text("error"),
  attemptNumber: integer("attempt").default(1).notNull(),
  maxAttempts: integer("max_attempts").default(3),
  nextRetryAt: timestamp("next_retry_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const webhookLogs = webhookDeliveryLogs;

export const insertWebhookLogSchema = createInsertSchema(webhookLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertWebhookLog = z.infer<typeof insertWebhookLogSchema>;
export type WebhookLog = typeof webhookLogs.$inferSelect;


// SEO Settings table - Platform-wide SEO configuration
export interface SitemapUrl {
  url: string;
  changefreq:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority: number;
  lastmod?: string;
}

export interface RobotsRule {
  userAgent: string;
  allow: string[];
  disallow: string[];
}

export interface StructuredDataConfig {
  organizationName: string;
  organizationUrl: string;
  organizationLogo: string;
  organizationDescription: string;
  socialProfiles: string[];
  contactEmail: string;
  contactPhone: string;
}

// FAQ structured data for Google FAQ rich snippets
export interface FaqItem {
  question: string;
  answer: string;
}

// Product structured data for Google Product rich snippets
export interface ProductStructuredData {
  name: string;
  description: string;
  image: string;
  brand: string;
  sku: string;
  price: string;
  priceCurrency: string;
  availability: "InStock" | "OutOfStock" | "PreOrder" | "Discontinued";
  url: string;
  ratingValue?: string;
  ratingCount?: string;
}

export const seoSettings = pgTable("seo_settings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // Meta Tags - Default values for pages without specific SEO
  defaultTitle: text("default_title").default(
    "Wtrops.ai - AI Calling Platform",
  ),
  defaultDescription: text("default_description").default(
    "Enterprise AI-powered bulk calling platform with voice agents, Twilio integration, and intelligent lead classification.",
  ),
  defaultKeywords: text("default_keywords")
    .array()
    .default(sql`ARRAY[]::text[]`),
  defaultOgImage: text("default_og_image").default("/og-image.png"),

  // Sitemap Configuration
  sitemapEnabled: boolean("sitemap_enabled").default(true),
  sitemapUrls: jsonb("sitemap_urls").$type<SitemapUrl[]>().default([]),
  sitemapAutoGenerate: boolean("sitemap_auto_generate").default(true),

  // Robots.txt Configuration
  robotsEnabled: boolean("robots_enabled").default(true),
  robotsRules: jsonb("robots_rules")
    .$type<RobotsRule[]>()
    .default([
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/features", "/blog", "/contact"],
        disallow: ["/app/", "/admin/", "/api/"],
      },
    ]),
  robotsCrawlDelay: integer("robots_crawl_delay").default(0),

  // Structured Data / Schema.org
  structuredDataEnabled: boolean("structured_data_enabled").default(true),
  structuredData: jsonb("structured_data")
    .$type<StructuredDataConfig>()
    .default({
      organizationName: "Wtrops.ai",
      organizationUrl: "",
      organizationLogo: "/logo.png",
      organizationDescription: "AI-powered voice agents for automated calling",
      socialProfiles: [],
      contactEmail: "",
      contactPhone: "",
    }),

  // FAQ Structured Data for rich snippets
  structuredDataFaq: jsonb("structured_data_faq")
    .$type<FaqItem[]>()
    .default([]),
  structuredDataFaqEnabled: boolean("structured_data_faq_enabled").default(
    false,
  ),

  // Product Structured Data for rich snippets
  structuredDataProduct: jsonb("structured_data_product")
    .$type<ProductStructuredData | null>()
    .default(null),
  structuredDataProductEnabled: boolean(
    "structured_data_product_enabled",
  ).default(false),

  // Social Media Meta Tags
  twitterHandle: text("twitter_handle"),
  facebookAppId: text("facebook_app_id"),

  // Advanced Settings
  canonicalBaseUrl: text("canonical_base_url"),
  googleVerification: text("google_verification"),
  bingVerification: text("bing_verification"),

  // Audit
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSeoSettingsSchema = createInsertSchema(seoSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSeoSettings = z.infer<typeof insertSeoSettingsSchema>;
export type SeoSettings = typeof seoSettings.$inferSelect;

// ============================================================
// ANALYTICS & TRACKING SCRIPTS
// ============================================================

// Analytics Scripts - Admin-configurable tracking scripts (GTM, GA4, Facebook Pixel, etc.)
export const analyticsScripts = pgTable("analytics_scripts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // Script Identity
  name: text("name").notNull(), // Display name (e.g., "Google Tag Manager", "Facebook Pixel")
  type: text("type").notNull().default("custom"), // 'gtm', 'ga4', 'facebook_pixel', 'linkedin', 'twitter', 'tiktok', 'hotjar', 'clarity', 'custom'

  // Script Content
  code: text("code").notNull(), // Legacy single code field (for backward compatibility)
  headCode: text("head_code"), // Code to inject in <head> section
  bodyCode: text("body_code"), // Code to inject after <body> tag (e.g., GTM noscript)

  // Placement Configuration - Array supports multiple placements (e.g., both head and body for some scripts like GTM)
  placement: text("placement")
    .array()
    .notNull()
    .default(sql`ARRAY['head']::text[]`), // Array of 'head' and/or 'body' - where to inject the script
  loadPriority: integer("load_priority").notNull().default(0), // Higher priority = loads first (within placement group)

  // Script Attributes (for <script> tag configuration)
  async: boolean("async").default(false), // Add async attribute
  defer: boolean("defer").default(false), // Add defer attribute

  // Status
  enabled: boolean("enabled").notNull().default(true),

  // Notes for admin reference
  description: text("description"),

  // Audit
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAnalyticsScriptSchema = createInsertSchema(
  analyticsScripts,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAnalyticsScript = z.infer<typeof insertAnalyticsScriptSchema>;
export type AnalyticsScript = typeof analyticsScripts.$inferSelect;

// ============================================================
// PAYMENT TRANSACTIONS & INVOICING SYSTEM
// ============================================================

// Payment Transactions - Unified log of all payments (plans + credits) across all gateways
export const paymentTransactions = pgTable("payment_transactions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Transaction Type
  type: text("type").notNull(), // 'subscription' or 'credits'

  // Gateway Information
  gateway: text("gateway").notNull(), // 'stripe', 'razorpay', 'paypal', 'paystack', 'mercadopago'
  gatewayTransactionId: text("gateway_transaction_id"), // Payment intent ID, order ID, etc.
  gatewaySubscriptionId: text("gateway_subscription_id"), // For subscription payments

  // Amount & Currency
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),

  // Related Records
  planId: varchar("plan_id").references(() => plans.id, {
    onDelete: "set null",
  }),
  creditPackageId: varchar("credit_package_id").references(
    () => creditPackages.id,
    { onDelete: "set null" },
  ),
  subscriptionId: varchar("subscription_id").references(
    () => userSubscriptions.id,
    { onDelete: "set null" },
  ),

  // Transaction Details
  description: text("description").notNull(),
  billingPeriod: text("billing_period"), // 'monthly', 'yearly' for subscriptions
  creditsAwarded: integer("credits_awarded"), // For credit purchases

  // Status
  status: text("status").notNull().default("pending"), // 'pending', 'completed', 'failed', 'refunded', 'partially_refunded'

  // Invoice Reference
  invoiceId: varchar("invoice_id"), // Will be linked after invoice generation

  // Metadata
  metadata: jsonb("metadata"), // Additional gateway-specific data

  // Timestamps
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPaymentTransactionSchema = createInsertSchema(
  paymentTransactions,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPaymentTransaction = z.infer<
  typeof insertPaymentTransactionSchema
>;
export type PaymentTransaction = typeof paymentTransactions.$inferSelect;

// Refunds - Track all refunds across gateways
export const refunds = pgTable("refunds", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  transactionId: varchar("transaction_id")
    .notNull()
    .references(() => paymentTransactions.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Refund Details
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),

  // Gateway Information
  gateway: text("gateway").notNull(), // Same as original transaction
  gatewayRefundId: text("gateway_refund_id"), // Refund ID from gateway

  // Refund Type
  reason: text("reason").notNull(), // 'admin_request', 'chargeback', 'customer_request', 'duplicate', 'fraudulent'
  initiatedBy: text("initiated_by").notNull(), // 'admin', 'customer', 'gateway' (for chargebacks)
  adminId: varchar("admin_id").references(() => users.id, {
    onDelete: "set null",
  }), // Admin who processed refund

  // Status
  status: text("status").notNull().default("pending"), // 'pending', 'processing', 'completed', 'failed'

  // Credits Reversal
  creditsReversed: integer("credits_reversed"), // Credits taken back

  // User Suspension (for chargebacks)
  userSuspended: boolean("user_suspended").notNull().default(false),

  // Notes
  adminNote: text("admin_note"), // Internal note from admin
  customerNote: text("customer_note"), // Note visible to customer

  // Metadata
  metadata: jsonb("metadata"), // Gateway-specific refund data

  // Refund Note PDF
  refundNoteNumber: text("refund_note_number"), // e.g., RN-2024-0001
  pdfUrl: text("pdf_url"), // URL to stored refund note PDF
  pdfGeneratedAt: timestamp("pdf_generated_at"),

  // Timestamps
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRefundSchema = createInsertSchema(refunds).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRefund = z.infer<typeof insertRefundSchema>;
export type Refund = typeof refunds.$inferSelect;

// Invoices - PDF invoices for all transactions
export const invoices = pgTable("invoices", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  transactionId: varchar("transaction_id")
    .notNull()
    .references(() => paymentTransactions.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Invoice Number (human-readable)
  invoiceNumber: text("invoice_number").notNull().unique(), // e.g., INV-2024-00001

  // Customer Details (snapshot at time of invoice)
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerAddress: text("customer_address"),

  // Invoice Details
  description: text("description").notNull(),
  lineItems: jsonb("line_items").notNull().$type<
    {
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }[]
  >(),

  // Amounts
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  tax: decimal("tax", { precision: 10, scale: 2 }).default("0.00"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),

  // Gateway & Payment Info
  gateway: text("gateway").notNull(),
  paymentMethod: text("payment_method"), // 'card', 'bank_transfer', etc.

  // PDF Storage
  pdfUrl: text("pdf_url"), // URL to stored PDF
  pdfGeneratedAt: timestamp("pdf_generated_at"),

  // Status
  status: text("status").notNull().default("draft"), // 'draft', 'sent', 'paid', 'void'

  // Email Delivery
  emailSentAt: timestamp("email_sent_at"),
  emailSentTo: text("email_sent_to"),

  // Timestamps
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  dueAt: timestamp("due_at"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

// Payment Webhook Queue - For retry logic on failed webhook processing
export const paymentWebhookQueue = pgTable("payment_webhook_queue", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // Webhook Source
  gateway: text("gateway").notNull(), // 'stripe', 'razorpay', 'paypal', 'paystack', 'mercadopago'
  eventType: text("event_type").notNull(), // e.g., 'payment_intent.succeeded', 'subscription.created'
  eventId: text("event_id").notNull(), // Gateway's event ID for idempotency

  // Payload
  payload: jsonb("payload").notNull(), // Full webhook payload

  // Processing Status
  status: text("status").notNull().default("pending"), // 'pending', 'processing', 'completed', 'failed', 'expired'

  // Retry Information
  attemptCount: integer("attempt_count").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  lastAttemptAt: timestamp("last_attempt_at"),
  nextRetryAt: timestamp("next_retry_at"),

  // Error Tracking
  lastError: text("last_error"),
  errorHistory: jsonb("error_history").$type<
    {
      attempt: number;
      error: string;
      timestamp: string;
    }[]
  >(),

  // Related Records (if known)
  userId: varchar("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  transactionId: varchar("transaction_id").references(
    () => paymentTransactions.id,
    { onDelete: "set null" },
  ),

  // Timestamps
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
  expiresAt: timestamp("expires_at").notNull(), // 24 hours from receivedAt
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPaymentWebhookQueueSchema = createInsertSchema(
  paymentWebhookQueue,
).omit({
  id: true,
  createdAt: true,
});
export type InsertPaymentWebhookQueue = z.infer<
  typeof insertPaymentWebhookQueueSchema
>;
export type PaymentWebhookQueue = typeof paymentWebhookQueue.$inferSelect;

// Email Notification Settings - Admin-configurable email types
export const emailNotificationSettings = pgTable(
  "email_notification_settings",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    // Email Type
    eventType: text("event_type").notNull().unique(), // 'welcome', 'purchase_confirmation', 'low_credits', 'campaign_completed', etc.
    displayName: text("display_name").notNull(), // Human-readable name
    description: text("description"), // Description of when this email is sent

    // Settings
    isEnabled: boolean("is_enabled").notNull().default(true),

    // Template Reference (optional - for custom templates)
    templateId: varchar("template_id").references(() => emailTemplates.id, {
      onDelete: "set null",
    }),

    // Thresholds (for certain event types)
    thresholdValue: integer("threshold_value"), // e.g., credit count for low_credits alert

    // Metadata
    category: text("category").notNull().default("general"), // 'authentication', 'billing', 'campaigns', 'account', 'general'

    // Audit
    updatedBy: varchar("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
);

export const insertEmailNotificationSettingsSchema = createInsertSchema(
  emailNotificationSettings,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEmailNotificationSettings = z.infer<
  typeof insertEmailNotificationSettingsSchema
>;
export type EmailNotificationSettings =
  typeof emailNotificationSettings.$inferSelect;

// Banned Words - Admin-configurable list of prohibited words/phrases for call monitoring
export const bannedWords = pgTable("banned_words", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  word: text("word").notNull(), // The banned word or phrase
  category: text("category").notNull().default("general"), // 'profanity', 'harassment', 'hate_speech', 'threats', 'general'
  severity: text("severity").notNull().default("medium"), // 'low', 'medium', 'high', 'critical'
  isActive: boolean("is_active").notNull().default(true),
  autoBlock: boolean("auto_block").notNull().default(false), // Auto-block user when detected
  createdBy: varchar("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBannedWordSchema = createInsertSchema(bannedWords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBannedWord = z.infer<typeof insertBannedWordSchema>;
export type BannedWord = typeof bannedWords.$inferSelect;







// ════════════════════════════════════════════════════════════════════════════════
// PRD v3.4 — ORGANIZATIONS & MULTI-TENANCY
// ════════════════════════════════════════════════════════════════════════════════

export const organizations = pgTable("organizations", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  ownerId: varchar("owner_id")
    .notNull()
    .references(() => users.id),
  logo: text("logo"),
  defaultRegionId: varchar("default_region_id", { length: 30 }),
  trialStatus: varchar("trial_status", { length: 20 }).default("no_trial"),
  managedCloudPlanId: varchar("managed_cloud_plan_id"),
  googleOAuthEnabled: boolean("google_oauth_enabled").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const organizationMembers = pgTable("organization_members", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 30 }).notNull().default("member"),
  invitedBy: varchar("invited_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOrganizationMemberSchema = createInsertSchema(
  organizationMembers,
).omit({ id: true, createdAt: true });

// ════════════════════════════════════════════════════════════════════════════════
// PRD v3.4 — ENTERPRISE RBAC (Section 5.2, 8)
// ════════════════════════════════════════════════════════════════════════════════

export const teams = pgTable("teams", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  parentTeamId: varchar("parent_team_id"),
  createdBy: varchar("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const teamMembers = pgTable("team_members", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  teamId: varchar("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 30 }).notNull().default("member"),
  addedBy: varchar("added_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
  createdAt: true,
});

export const roles = pgTable("roles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id),
  name: varchar("name", { length: 50 }).notNull(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  description: text("description"),
  isSystemRole: boolean("is_system_role").default(false),
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const permissions = pgTable("permissions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull(),
});

export const insertPermissionSchema = createInsertSchema(permissions).omit({
  id: true,
});

export const rolePermissions = pgTable("role_permissions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  roleId: varchar("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  permissionId: varchar("permission_id")
    .notNull()
    .references(() => permissions.id, { onDelete: "cascade" }),
});

export const userRoles = pgTable("user_roles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  roleId: varchar("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  scopeTeamId: varchar("scope_team_id").references(() => teams.id),
  assignedBy: varchar("assigned_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({
  id: true,
  createdAt: true,
});

export const rbacAuditEvents = pgTable("rbac_audit_events", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id")
    .notNull()
    .references(() => organizations.id),
  actorUserId: varchar("actor_user_id")
    .notNull()
    .references(() => users.id),
  targetUserId: varchar("target_user_id").references(() => users.id),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  eventData: jsonb("event_data"),
  ipAddress: varchar("ip_address", { length: 45 }),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

// ════════════════════════════════════════════════════════════════════════════════
// PRD v3.4 — CONCURRENCY GOVERNANCE (Section 5.3, 7)
// ════════════════════════════════════════════════════════════════════════════════

export const concurrencyLimits = pgTable("concurrency_limits", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id")
    .notNull()
    .references(() => organizations.id)
    .unique(),
  voiceConcurrencyLimit: integer("voice_concurrency_limit")
    .notNull()
    .default(2),
  voiceConcurrencyUsed: integer("voice_concurrency_used")
    .notNull()
    .default(0),
  clawConcurrencyLimit: integer("claw_concurrency_limit")
    .notNull()
    .default(2),
  clawConcurrencyUsed: integer("claw_concurrency_used")
    .notNull()
    .default(0),
  totalConcurrencyLimit: integer("total_concurrency_limit")
    .notNull()
    .default(2),
  totalConcurrencyUsed: integer("total_concurrency_used")
    .notNull()
    .default(0),
  limitSource: varchar("limit_source", { length: 20 })
    .notNull()
    .default("plan"),
  overrideReason: text("override_reason"),
  overrideBy: varchar("override_by").references(() => users.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const concurrencyAllocations = pgTable("concurrency_allocations", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id")
    .notNull()
    .references(() => organizations.id),
  teamId: varchar("team_id").references(() => teams.id),
  userId: varchar("user_id").references(() => users.id),
  concurrencyLimit: integer("concurrency_limit").notNull(),
  concurrencyUsed: integer("concurrency_used").notNull().default(0),
  overflowPolicy: varchar("overflow_policy", { length: 20 })
    .notNull()
    .default("reject"),
  allocatedBy: varchar("allocated_by")
    .notNull()
    .references(() => users.id),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const concurrencySessions = pgTable("concurrency_sessions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id")
    .notNull()
    .references(() => organizations.id),
  teamId: varchar("team_id").references(() => teams.id),
  userId: varchar("user_id").references(() => users.id),
  sessionType: varchar("session_type", { length: 20 }).notNull(),
  resourceId: varchar("resource_id", { length: 255 }).notNull(),
  sessionToken: varchar("session_token", { length: 255 }),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  lastHeartbeatAt: timestamp("last_heartbeat_at"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
});

// ════════════════════════════════════════════════════════════════════════════════
// PRD v3.4 — CLAW ENGINE (Section 5.1)
// ════════════════════════════════════════════════════════════════════════════════

export const clawPolicyTemplates = pgTable("claw_policy_templates", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  networkWhitelist: jsonb("network_whitelist").$type<string[]>().default([]),
  networkMode: varchar("network_mode", { length: 20 }).default("whitelist"),
  allowedProviders: jsonb("allowed_providers").$type<string[]>(),
  allowedModels: jsonb("allowed_models").$type<string[]>(),
  minSkillSecurityScore: varchar("min_skill_security_score", { length: 1 }),
  blockedSkills: jsonb("blocked_skills").$type<string[]>().default([]),
  allowedSkills: jsonb("allowed_skills").$type<string[]>(),
  skillInstallApprovalRequired: boolean("skill_install_approval_required").default(true),
  allowedWorkflows: jsonb("allowed_workflows").$type<string[]>(),
  workflowApprovalRequired: boolean("workflow_approval_required").default(false),
  maxWorkflowExecutionsPerDay: integer("max_workflow_executions_per_day"),
  allowedMcpServers: jsonb("allowed_mcp_servers").$type<string[]>(),
  mcpToolApprovalRequired: boolean("mcp_tool_approval_required").default(false),
  maxMcpCallsPerDay: integer("max_mcp_calls_per_day"),
  routingPolicy: jsonb("routing_policy"),
  maxCreditsPerCall: integer("max_credits_per_call"),
  isSystemDefault: boolean("is_system_default").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertClawPolicyTemplateSchema = createInsertSchema(
  clawPolicyTemplates,
).omit({ id: true, createdAt: true, updatedAt: true });


export const orgMcpServers = pgTable("org_mcp_servers", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  transport: varchar("transport", { length: 10 }).notNull(),
  endpoint: varchar("endpoint", { length: 500 }),
  command: varchar("command", { length: 500 }),
  envVars: jsonb("env_vars").$type<Record<string, string>>(),
  isActive: boolean("is_active").default(true),
  availableTo: varchar("available_to", { length: 20 }).default("all"),
  allowedClawIds: jsonb("allowed_claw_ids").$type<string[]>(),
  allowedAgentIds: jsonb("allowed_agent_ids").$type<string[]>(),
  requiresApproval: boolean("requires_approval").default(false),
  dataClassificationMin: varchar("data_classification_min", { length: 20 }),
  toolCount: integer("tool_count").default(0),
  lastHealthCheckAt: timestamp("last_health_check_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOrgMcpServerSchema = createInsertSchema(orgMcpServers).omit({
  id: true,
  toolCount: true,
  lastHealthCheckAt: true,
  createdAt: true,
  updatedAt: true,
});


// ════════════════════════════════════════════════════════════════════════════════
// PRD v3.4 — TELEPHONY PROVIDERS (Section 5.4)
// ════════════════════════════════════════════════════════════════════════════════

export const telephonyProviders = pgTable("telephony_providers", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id")
    .notNull()
    .references(() => organizations.id),
  provider: varchar("provider", { length: 30 }).notNull(),
  displayName: varchar("display_name", { length: 100 }),
  apiKey: text("api_key"),
  apiSecret: text("api_secret"),
  accountSid: text("account_sid"),
  authToken: text("auth_token"),
  additionalConfig: jsonb("additional_config"),
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false),
  lastVerifiedAt: timestamp("last_verified_at"),
  verificationStatus: varchar("verification_status", { length: 20 }).default(
    "pending",
  ),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTelephonyProviderSchema = createInsertSchema(
  telephonyProviders,
).omit({
  id: true,
  lastVerifiedAt: true,
  verificationStatus: true,
  createdAt: true,
  updatedAt: true,
});

export const phoneNumberPool = pgTable("phone_number_pool", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id),
  providerId: varchar("provider_id").references(() => telephonyProviders.id),
  providerNumberSid: varchar("provider_number_sid", { length: 255 }),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  countryCode: varchar("country_code", { length: 5 }).notNull(),
  country: varchar("country", { length: 100 }).notNull(),
  numberType: varchar("number_type", { length: 20 }).default("local"),
  status: varchar("status", { length: 20 }).notNull().default("available"),
  assignedToAgentId: varchar("assigned_to_agent_id"),
  assignedToCampaignId: varchar("assigned_to_campaign_id"),
  poolStatus: varchar("pool_status", { length: 20 }).default("available"),
  cooldownUntil: timestamp("cooldown_until"),
  previousOrganizationId: varchar("previous_organization_id"),
  monthlyCost: decimal("monthly_cost", { precision: 10, scale: 4 }),
  monthlyCostCurrency: varchar("monthly_cost_currency", { length: 3 }).default(
    "USD",
  ),
  purchasedAt: timestamp("purchased_at"),
  releasedAt: timestamp("released_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPhoneNumberPoolSchema = createInsertSchema(
  phoneNumberPool,
).omit({
  id: true,
  poolStatus: true,
  cooldownUntil: true,
  previousOrganizationId: true,
  purchasedAt: true,
  releasedAt: true,
  createdAt: true,
  updatedAt: true,
});

// ════════════════════════════════════════════════════════════════════════════════
// PRD v3.4 — MANAGED CLOUD & TRIALS (Section 5.5)
// ════════════════════════════════════════════════════════════════════════════════

export const managedCloudPlans = pgTable("managed_cloud_plans", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  priceMonthly: decimal("price_monthly", {
    precision: 12,
    scale: 2,
  }).notNull(),
  priceCurrency: varchar("price_currency", { length: 3 })
    .notNull()
    .default("INR"),
  creditsIncluded: integer("credits_included").notNull(),
  concurrencyLimit: integer("concurrency_limit").notNull(),
  clawAgentLimit: integer("claw_agent_limit").notNull(),
  voiceAgentLimit: integer("voice_agent_limit"),
  phoneNumbersIncluded: integer("phone_numbers_included").notNull().default(1),
  customPolicyTemplates: boolean("custom_policy_templates").default(false),
  enterpriseRbac: boolean("enterprise_rbac").default(false),
  multiRegionDeployment: boolean("multi_region_deployment").default(false),
  prioritySupport: boolean("priority_support").default(false),
  complianceReports: boolean("compliance_reports").default(false),
  customMcpServers: boolean("custom_mcp_servers").default(false),
  slaGuarantee: varchar("sla_guarantee", { length: 10 }),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertManagedCloudPlanSchema = createInsertSchema(
  managedCloudPlans,
).omit({ id: true, createdAt: true, updatedAt: true });

export const managedCloudTrials = pgTable("managed_cloud_trials", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id")
    .notNull()
    .references(() => organizations.id)
    .unique(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  trialStartedAt: timestamp("trial_started_at").notNull().defaultNow(),
  trialExpiresAt: timestamp("trial_expires_at").notNull(),
  graceExpiresAt: timestamp("grace_expires_at").notNull(),
  talkTimeMinutesTotal: integer("talk_time_minutes_total")
    .notNull()
    .default(30),
  talkTimeMinutesUsed: decimal("talk_time_minutes_used", {
    precision: 10,
    scale: 2,
  })
    .notNull()
    .default("0"),
  concurrencyLimit: integer("concurrency_limit").notNull().default(2),
  assignedPhoneNumberId: varchar("assigned_phone_number_id").references(
    () => phoneNumberPool.id,
  ),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  convertedAt: timestamp("converted_at"),
  convertedToPlanId: varchar("converted_to_plan_id"),
  dayBeforeExpiryReminderSent: boolean(
    "day_before_expiry_reminder_sent",
  ).default(false),
  expiryReminderSent: boolean("expiry_reminder_sent").default(false),
  graceReminderSent: boolean("grace_reminder_sent").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertManagedCloudTrialSchema = createInsertSchema(
  managedCloudTrials,
).omit({
  id: true,
  trialStartedAt: true,
  status: true,
  convertedAt: true,
  dayBeforeExpiryReminderSent: true,
  expiryReminderSent: true,
  graceReminderSent: true,
  createdAt: true,
  updatedAt: true,
});

// ════════════════════════════════════════════════════════════════════════════════
// PRD v3.4 — GLOBAL DEPLOYMENT & REGIONS (Section 5.6)
// ════════════════════════════════════════════════════════════════════════════════

export const deploymentRegions = pgTable("deployment_regions", {
  id: varchar("id", { length: 30 }).primaryKey(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  provider: varchar("provider", { length: 20 }).notNull().default("oci"),
  continent: varchar("continent", { length: 20 }).notNull(),
  country: varchar("country", { length: 100 }).notNull(),
  isPrimary: boolean("is_primary").default(false),
  hasDatabase: boolean("has_database").default(false),
  hasCdnEdge: boolean("has_cdn_edge").default(true),
  hasClawHosts: boolean("has_claw_hosts").default(false),
  status: varchar("status", { length: 20 }).default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const organizationRegions = pgTable("organization_regions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id")
    .notNull()
    .references(() => organizations.id),
  regionId: varchar("region_id", { length: 30 })
    .notNull()
    .references(() => deploymentRegions.id),
  isPrimary: boolean("is_primary").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ════════════════════════════════════════════════════════════════════════════════
// PRD v3.4 — COPILOT / DATA LAKE INTELLIGENCE (Section 24.8)
// ════════════════════════════════════════════════════════════════════════════════

export const dataConnections = pgTable("data_connections", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: varchar("name", { length: 100 }).notNull(),
  provider: varchar("provider", { length: 30 }).notNull(),
  connectionConfig: jsonb("connection_config"),
  credentialId: varchar("credential_id"),
  status: varchar("status", { length: 20 }).default("pending"),
  lastSyncAt: timestamp("last_sync_at"),
  schemaVersion: integer("schema_version").default(0),
  allowedTeamIds: jsonb("allowed_team_ids").$type<string[]>(),
  dataClassification: varchar("data_classification", { length: 20 }).default(
    "internal",
  ),
  createdBy: varchar("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDataConnectionSchema = createInsertSchema(
  dataConnections,
).omit({
  id: true,
  status: true,
  lastSyncAt: true,
  schemaVersion: true,
  createdAt: true,
  updatedAt: true,
});

export const dataSchemaCache = pgTable("data_schema_cache", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  connectionId: varchar("connection_id")
    .notNull()
    .references(() => dataConnections.id, { onDelete: "cascade" }),
  tableName: varchar("table_name", { length: 255 }).notNull(),
  schemaName: varchar("schema_name", { length: 255 }),
  columns: jsonb("columns").notNull(),
  rowCountEstimate: bigint("row_count_estimate", { mode: "number" }),
  sizeEstimateMb: integer("size_estimate_mb"),
  businessName: varchar("business_name", { length: 255 }),
  businessDescription: text("business_description"),
  commonQueries: jsonb("common_queries").$type<string[]>(),
  lastSyncAt: timestamp("last_sync_at").notNull().defaultNow(),
});

export const semanticMappings = pgTable("semantic_mappings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  connectionId: varchar("connection_id")
    .notNull()
    .references(() => dataConnections.id, { onDelete: "cascade" }),
  businessTerm: varchar("business_term", { length: 100 }).notNull(),
  definition: text("definition").notNull(),
  sqlExpression: text("sql_expression"),
  relatedTables: jsonb("related_tables").$type<string[]>(),
  createdBy: varchar("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSemanticMappingSchema = createInsertSchema(
  semanticMappings,
).omit({ id: true, createdAt: true, updatedAt: true });

export const queryHistory = pgTable("query_history", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id")
    .notNull()
    .references(() => organizations.id),
  connectionId: varchar("connection_id")
    .notNull()
    .references(() => dataConnections.id),
  userId: varchar("user_id").references(() => users.id),
  clawId: varchar("claw_id"),
  naturalLanguageQuery: text("natural_language_query"),
  generatedSql: text("generated_sql").notNull(),
  executionTimeMs: integer("execution_time_ms"),
  rowsReturned: integer("rows_returned"),
  bytesScanned: bigint("bytes_scanned", { mode: "number" }),
  creditsConsumed: decimal("credits_consumed", { precision: 12, scale: 4 }),
  status: varchar("status", { length: 20 }).notNull(),
  errorMessage: text("error_message"),
  denyReason: varchar("deny_reason", { length: 100 }),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

// ════════════════════════════════════════════════════════════════════════════════
// PRD v3.4 — TYPE EXPORTS
// ════════════════════════════════════════════════════════════════════════════════

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type InsertOrganizationMember = z.infer<
  typeof insertOrganizationMemberSchema
>;
export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type Role = typeof roles.$inferSelect;
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Permission = typeof permissions.$inferSelect;
export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type UserRole = typeof userRoles.$inferSelect;
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type RbacAuditEvent = typeof rbacAuditEvents.$inferSelect;
export type ConcurrencyLimit = typeof concurrencyLimits.$inferSelect;
export type ConcurrencyAllocation = typeof concurrencyAllocations.$inferSelect;
export type ConcurrencySession = typeof concurrencySessions.$inferSelect;
export type ClawPolicyTemplate = typeof clawPolicyTemplates.$inferSelect;
export type InsertClawPolicyTemplate = z.infer<
  typeof insertClawPolicyTemplateSchema
>;
export type OrgMcpServer = typeof orgMcpServers.$inferSelect;
export type InsertOrgMcpServer = z.infer<typeof insertOrgMcpServerSchema>;
export type TelephonyProvider = typeof telephonyProviders.$inferSelect;
export type InsertTelephonyProvider = z.infer<
  typeof insertTelephonyProviderSchema
>;
export type PhoneNumberPoolEntry = typeof phoneNumberPool.$inferSelect;
export type InsertPhoneNumberPoolEntry = z.infer<
  typeof insertPhoneNumberPoolSchema
>;
export type ManagedCloudPlan = typeof managedCloudPlans.$inferSelect;
export type InsertManagedCloudPlan = z.infer<
  typeof insertManagedCloudPlanSchema
>;
export type ManagedCloudTrial = typeof managedCloudTrials.$inferSelect;
export type InsertManagedCloudTrial = z.infer<
  typeof insertManagedCloudTrialSchema
>;
export type DeploymentRegion = typeof deploymentRegions.$inferSelect;
export type OrganizationRegion = typeof organizationRegions.$inferSelect;
export type DataConnection = typeof dataConnections.$inferSelect;
export type InsertDataConnection = z.infer<typeof insertDataConnectionSchema>;
export type DataSchemaCacheEntry = typeof dataSchemaCache.$inferSelect;
export type SemanticMapping = typeof semanticMappings.$inferSelect;
export type InsertSemanticMapping = z.infer<typeof insertSemanticMappingSchema>;
export type QueryHistoryEntry = typeof queryHistory.$inferSelect;

// ════════════════════════════════════════════════════════════════════════════════
// Compliance Settings — per-org compliance configuration
// ════════════════════════════════════════════════════════════════════════════════

export const complianceSettings = pgTable("compliance_settings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id")
    .notNull()
    .references(() => organizations.id),
  enabledFrameworks: jsonb("enabled_frameworks")
    .$type<string[]>()
    .default([]),
  // Board oversight
  boardMemberEmails: jsonb("board_member_emails")
    .$type<string[]>()
    .default([]),
  boardReportFrequency: varchar("board_report_frequency", { length: 20 }).default("monthly"),
  boardReportEnabled: boolean("board_report_enabled").default(false),
  // Incident response contacts
  irPrimaryContact: text("ir_primary_contact"),
  irSecondaryContact: text("ir_secondary_contact"),
  irEscalationEmail: text("ir_escalation_email"),
  irSlackWebhook: text("ir_slack_webhook"),
  // Data retention
  auditLogRetentionDays: integer("audit_log_retention_days").default(365),
  dataRetentionDays: integer("data_retention_days").default(730),
  // DPO info
  dpoName: text("dpo_name"),
  dpoEmail: text("dpo_email"),
  // Security training
  securityTrainingProvider: text("security_training_provider"),
  lastTrainingDate: timestamp("last_training_date"),
  trainingFrequencyMonths: integer("training_frequency_months").default(12),
  // Password policy
  minPasswordLength: integer("min_password_length").default(12),
  requireMfa: boolean("require_mfa").default(false),
  mfaEnforcedRoles: jsonb("mfa_enforced_roles")
    .$type<string[]>()
    .default([]),
  // Custom notes per control
  controlNotes: jsonb("control_notes")
    .$type<Record<string, string>>()
    .default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertComplianceSettingsSchema = createInsertSchema(
  complianceSettings,
).omit({ id: true, createdAt: true, updatedAt: true });

// ════════════════════════════════════════════════════════════════════════════════
// Compliance Evidence — uploaded documents and collected evidence per control
// ════════════════════════════════════════════════════════════════════════════════

export const complianceEvidence = pgTable("compliance_evidence", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id")
    .notNull()
    .references(() => organizations.id),
  framework: varchar("framework", { length: 30 }).notNull(),
  controlId: varchar("control_id", { length: 50 }).notNull(),
  evidenceType: varchar("evidence_type", { length: 30 }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  // For uploaded files
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  fileSizeBytes: integer("file_size_bytes"),
  // For log/config evidence (auto-collected)
  evidenceData: jsonb("evidence_data"),
  // For attestations
  attestedBy: varchar("attested_by").references(() => users.id),
  attestedAt: timestamp("attested_at"),
  // Validity
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertComplianceEvidenceSchema = createInsertSchema(
  complianceEvidence,
).omit({ id: true, createdAt: true });

// ════════════════════════════════════════════════════════════════════════════════
// Compliance Scheduled Reports
// ════════════════════════════════════════════════════════════════════════════════

export const complianceScheduledReports = pgTable("compliance_scheduled_reports", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id")
    .notNull()
    .references(() => organizations.id),
  reportType: varchar("report_type", { length: 30 }).notNull(),
  recipientEmails: jsonb("recipient_emails")
    .$type<string[]>()
    .notNull(),
  frequency: varchar("frequency", { length: 20 }).notNull(),
  frameworks: jsonb("frameworks")
    .$type<string[]>()
    .default([]),
  lastSentAt: timestamp("last_sent_at"),
  nextSendAt: timestamp("next_send_at"),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertComplianceScheduledReportSchema = createInsertSchema(
  complianceScheduledReports,
).omit({ id: true, createdAt: true });

// Compliance type exports
export type ComplianceSettingsRow = typeof complianceSettings.$inferSelect;
export type InsertComplianceSettings = z.infer<typeof insertComplianceSettingsSchema>;
export type ComplianceEvidenceRow = typeof complianceEvidence.$inferSelect;
export type InsertComplianceEvidence = z.infer<typeof insertComplianceEvidenceSchema>;
export type ComplianceScheduledReportRow = typeof complianceScheduledReports.$inferSelect;
export type InsertComplianceScheduledReport = z.infer<typeof insertComplianceScheduledReportSchema>;

// ════════════════════════════════════════════════════════════════════════════════
// PRD v3.5 — CLAW CONTEXTS (Section 38.2)
// Named, versioned tool bundles with runtime augmentation and extends inheritance
// ════════════════════════════════════════════════════════════════════════════════

export const clawContexts = pgTable("claw_contexts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: varchar("name", { length: 100 }).notNull(),
  version: varchar("version", { length: 20 }).notNull(),
  description: text("description"),
  tags: jsonb("tags").$type<string[]>().default([]),

  // The full manifest (validated against schema at write time)
  manifest: jsonb("manifest").notNull(),

  // Resolved from manifest for fast queries
  mcpServerRefs: jsonb("mcp_server_refs").$type<string[]>().default([]),
  workflowRefs: jsonb("workflow_refs").$type<string[]>().default([]),
  skillRefs: jsonb("skill_refs").$type<string[]>().default([]),
  knowledgeGraphRefs: jsonb("knowledge_graph_refs").$type<string[]>().default([]),

  // Inheritance: extends another context
  extendsContextId: varchar("extends_context_id"),
  dataClassification: varchar("data_classification", { length: 20 }).default(
    "internal",
  ),
  opaBundleRef: varchar("opa_bundle_ref", { length: 100 }),

  isPublished: boolean("is_published").default(false),
  publishedAt: timestamp("published_at"),
  publishedBy: varchar("published_by").references(() => users.id),

  createdBy: varchar("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertClawContextSchema = createInsertSchema(clawContexts).omit({
  id: true,
  isPublished: true,
  publishedAt: true,
  publishedBy: true,
  createdAt: true,
  updatedAt: true,
});

export const clawContextAssignments = pgTable("claw_context_assignments", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  clawId: varchar("claw_id")
    .notNull(),
  contextId: varchar("context_id")
    .notNull()
    .references(() => clawContexts.id),
  // Per-claw overrides applied at session start on top of the manifest
  runtimeOverrides: jsonb("runtime_overrides"),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  assignedBy: varchar("assigned_by")
    .notNull()
    .references(() => users.id),
});

export const insertClawContextAssignmentSchema = createInsertSchema(
  clawContextAssignments,
).omit({ id: true, assignedAt: true });


// ── Knowledge Graph metadata tracking ──
export const knowledgeGraphs = pgTable("knowledge_graphs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  knowledgeBaseId: varchar("knowledge_base_id")
    .notNull()
    .references(() => knowledgeBase.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  entityCount: integer("entity_count").default(0),
  relationshipCount: integer("relationship_count").default(0),
  entityTypes: jsonb("entity_types").$type<string[]>().default([]),
  errorMessage: text("error_message"),
  falkordbGraphName: varchar("falkordb_graph_name", { length: 200 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertKnowledgeGraphSchema = createInsertSchema(
  knowledgeGraphs,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type KnowledgeGraphRow = typeof knowledgeGraphs.$inferSelect;
export type InsertKnowledgeGraph = z.infer<typeof insertKnowledgeGraphSchema>;

// ── Type exports for Claw Contexts ──
export type ClawContextRow = typeof clawContexts.$inferSelect;
export type InsertClawContext = z.infer<typeof insertClawContextSchema>;
export type ClawContextAssignmentRow = typeof clawContextAssignments.$inferSelect;
export type InsertClawContextAssignment = z.infer<typeof insertClawContextAssignmentSchema>;

// ============================================================
// FEDERATION REGISTRY & MERGE ALGEBRA TABLES (WS1)
//
// These tables implement the bi-level named graph topology from
// the mathematical core (math.md Part A.2). Leaf graphs (Tier 1)
// are mutable, per-knowledge-base graphs. Federation graphs
// (Tier 2) are materialized snapshots produced by merge operations
// with provable algebraic guarantees (Spivak 2012, Robinson 2017).
//
// FalkorDB naming convention:
//   Leaf:       kg_{userId}_{knowledgeBaseId}
//   Federation: kgf_{userId}_{federationId}
// ============================================================

/**
 * graph_federations — Federation graph metadata registry.
 *
 * Each row represents a materialized (or pending) federation of N leaf
 * knowledge graphs. Stores merge/alignment/schema/quality/access configs
 * as JSONB columns matching the user-configurable parameters in math.md
 * Sections 21-25. Quality metrics (consistency_score, conflict_dimension,
 * topo_quality, freshness_score, composite_quality) are computed during
 * materialization via sheaf cohomology (H^0, H^1) and persistent homology.
 *
 * Staleness predicate (math.md Section 1.2):
 *   stale(G_fed) <=> exists G_leaf in constituents : updated_at(G_leaf) > materialized_at(G_fed)
 */
export const graphFederations = pgTable("graph_federations", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // Array of knowledge base IDs that constitute this federation
  constituentKbIds: jsonb("constituent_kb_ids")
    .$type<string[]>()
    .notNull()
    .default([]),
  // Merge mode: union | intersection | differential | conflict_resolution
  // Categorical interpretation: union=Sigma_M (left Kan extension),
  // intersection=Delta_M (pullback), differential=cokernel
  mergeMode: varchar("merge_mode", { length: 50 }).notNull().default("union"),
  // JSONB config columns matching math.md Sections 21-25
  mergeConfig: jsonb("merge_config")
    .$type<Record<string, any>>()
    .notNull()
    .default({}),
  alignmentConfig: jsonb("alignment_config")
    .$type<Record<string, any>>()
    .notNull()
    .default({}),
  schemaConfig: jsonb("schema_config")
    .$type<Record<string, any>>()
    .notNull()
    .default({}),
  qualityConfig: jsonb("quality_config")
    .$type<Record<string, any>>()
    .notNull()
    .default({}),
  accessConfig: jsonb("access_config")
    .$type<Record<string, any>>()
    .notNull()
    .default({}),
  // Refresh policy: manual | on_query | scheduled
  autoRefresh: varchar("auto_refresh", { length: 20 })
    .notNull()
    .default("manual"),
  refreshSchedule: varchar("refresh_schedule", { length: 100 }),
  // Materialization state
  isMaterialized: boolean("is_materialized").notNull().default(false),
  materializedAt: timestamp("materialized_at"),
  // Graph statistics
  entityCount: integer("entity_count").default(0),
  edgeCount: integer("edge_count").default(0),
  conflictCount: integer("conflict_count").default(0),
  // Sheaf cohomology quality metrics (math.md Section 5.4, 7.5)
  // consistency_score = dim(H^0) / |V|   (fraction of globally consistent entity configs)
  consistencyScore: decimal("consistency_score", {
    precision: 5,
    scale: 4,
  }).default("0"),
  // conflict_dimension = dim(H^1)   (independent irreducible conflict modes)
  conflictDimension: integer("conflict_dimension").default(0),
  // Persistent homology quality (math.md Section 8.3)
  topoQuality: decimal("topo_quality", { precision: 5, scale: 4 }).default(
    "0",
  ),
  // Freshness score weighted by entity importance (math.md Section 10)
  freshnessScore: decimal("freshness_score", {
    precision: 5,
    scale: 4,
  }).default("0"),
  // Composite: w_c * consistency + w_t * topo + w_f * freshness (math.md Section 11)
  compositeQuality: decimal("composite_quality", {
    precision: 5,
    scale: 4,
  }).default("0"),
  // Data classification lattice: public < internal < confidential < restricted
  // Federation classification = max(constituent classifications)
  classification: varchar("classification", { length: 20 }).default(
    "internal",
  ),
  // Brain API publishing (graph_plan.md Feature #7)
  isPublishedAsBrain: boolean("is_published_as_brain").default(false),
  brainEndpointId: varchar("brain_endpoint_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertGraphFederationSchema = createInsertSchema(
  graphFederations,
).omit({
  id: true,
  isMaterialized: true,
  materializedAt: true,
  entityCount: true,
  edgeCount: true,
  conflictCount: true,
  consistencyScore: true,
  conflictDimension: true,
  topoQuality: true,
  freshnessScore: true,
  compositeQuality: true,
  isPublishedAsBrain: true,
  brainEndpointId: true,
  createdAt: true,
  updatedAt: true,
});

export type GraphFederationRow = typeof graphFederations.$inferSelect;
export type InsertGraphFederation = z.infer<
  typeof insertGraphFederationSchema
>;

/**
 * graph_alignments — Entity alignment decisions for federation.
 *
 * Stores the results of the three-tier entity resolution cascade
 * (math.md Section 3.2-3.3). Each row records an alignment decision
 * between a source entity in one leaf graph and a target entity in another.
 *
 * Multi-signal alignment score:
 *   A(v_i, v_j) = w1*sim_name + w2*sim_embed + w3*sim_type + w4*sim_struct + w5*sim_prop
 *
 * Resolution tiers: 1=embedding blocking, 2=cheap model, 3=reasoning model.
 * Decision: SAME | DIFFERENT | UNCERTAIN
 *
 * These records form the alignment context Lambda = (A_resolved, Omega, canon)
 * which is computed once and reused across all merge operations on the same
 * federation (math.md Section 6).
 */
export const graphAlignments = pgTable("graph_alignments", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  federationId: varchar("federation_id")
    .notNull()
    .references(() => graphFederations.id, { onDelete: "cascade" }),
  sourceKbId: varchar("source_kb_id").notNull(),
  sourceEntityId: varchar("source_entity_id", { length: 255 }).notNull(),
  sourceEntityName: varchar("source_entity_name", { length: 500 }).notNull(),
  targetKbId: varchar("target_kb_id").notNull(),
  targetEntityId: varchar("target_entity_id", { length: 255 }).notNull(),
  targetEntityName: varchar("target_entity_name", { length: 500 }).notNull(),
  // Composite alignment confidence A(v_i, v_j) in [0, 1]
  confidence: decimal("confidence", { precision: 5, scale: 4 }).notNull(),
  // Which resolution tier produced this decision (1, 2, or 3)
  resolutionTier: integer("resolution_tier").notNull(),
  // SAME | DIFFERENT | UNCERTAIN
  decision: varchar("decision", { length: 20 }).notNull(),
  // The canonical entity ID in the merged graph (set when decision=SAME)
  canonicalEntityId: varchar("canonical_entity_id", { length: 255 }),
  // Breakdown of individual alignment signals, override info, etc.
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertGraphAlignmentSchema = createInsertSchema(
  graphAlignments,
).omit({
  id: true,
  createdAt: true,
});

export type GraphAlignmentRow = typeof graphAlignments.$inferSelect;
export type InsertGraphAlignment = z.infer<
  typeof insertGraphAlignmentSchema
>;

/**
 * merge_operations — Audit log for every materialization run.
 *
 * Each row records a single execution of the materialization pipeline
 * (math.md Section 12):
 *   materialize(constituents, mode, Lambda, config) -> G_fed
 *
 * Stores a config snapshot (so historical operations are reproducible),
 * counts of entities/edges/conflicts processed, sheaf cohomology metrics
 * (consistency_score = dim(H^0)/|V|, conflict_dimension = dim(H^1)),
 * topological quality from persistent homology, and execution metadata.
 */
export const mergeOperations = pgTable("merge_operations", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  federationId: varchar("federation_id")
    .notNull()
    .references(() => graphFederations.id, { onDelete: "cascade" }),
  // union | intersection | differential | conflict_resolution
  operationType: varchar("operation_type", { length: 50 }).notNull(),
  // Full config snapshot at time of execution for reproducibility
  configSnapshot: jsonb("config_snapshot")
    .$type<Record<string, any>>()
    .notNull(),
  // Processing counts
  entitiesProcessed: integer("entities_processed").default(0),
  edgesProcessed: integer("edges_processed").default(0),
  entitiesMerged: integer("entities_merged").default(0),
  conflictsDetected: integer("conflicts_detected").default(0),
  conflictsAutoResolved: integer("conflicts_auto_resolved").default(0),
  conflictsDeferred: integer("conflicts_deferred").default(0),
  // Quality metrics computed during materialization
  consistencyScore: decimal("consistency_score", {
    precision: 5,
    scale: 4,
  }),
  conflictDimension: integer("conflict_dimension"),
  topoQuality: decimal("topo_quality", { precision: 5, scale: 4 }),
  // Execution metadata
  durationMs: integer("duration_ms"),
  operatorId: varchar("operator_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMergeOperationSchema = createInsertSchema(
  mergeOperations,
).omit({
  id: true,
  createdAt: true,
});

export type MergeOperationRow = typeof mergeOperations.$inferSelect;
export type InsertMergeOperation = z.infer<
  typeof insertMergeOperationSchema
>;

/**
 * merge_conflicts — Individual conflict records from merge operations.
 *
 * Each row is one conflict detected during a conflict resolution merge
 * (math.md Section 7.5). Conflicts decompose into four types:
 *   C = C_entity | C_edge | C_property | C_temporal
 *
 * Each conflict maps to a generator of H^1(G_union; F) — a minimal
 * inconsistent cycle in the sheaf cohomology. The cohomology_class field
 * indexes which H^1 generator this conflict corresponds to.
 *
 * Resolution strategies (priority order): temporal_precedence,
 * source_reliability, evidence_weight, user_preference, defer_to_human.
 */
export const mergeConflicts = pgTable("merge_conflicts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  mergeOperationId: varchar("merge_operation_id")
    .notNull()
    .references(() => mergeOperations.id, { onDelete: "cascade" }),
  // entity | edge | property | temporal
  conflictType: varchar("conflict_type", { length: 50 }).notNull(),
  // Index into H^1 basis — which cohomology generator this conflict corresponds to
  cohomologyClass: integer("cohomology_class"),
  // Left side of the conflict
  sourceKb1: varchar("source_kb_1").notNull(),
  element1: jsonb("element_1").$type<Record<string, any>>().notNull(),
  // Right side of the conflict
  sourceKb2: varchar("source_kb_2").notNull(),
  element2: jsonb("element_2").$type<Record<string, any>>().notNull(),
  // Resolution suggestion from the pipeline
  suggestedStrategy: varchar("suggested_strategy", { length: 50 }),
  suggestedWinner: varchar("suggested_winner", { length: 10 }),
  // Actual resolution (set when a human resolves or auto-resolved)
  actualResolution: varchar("actual_resolution", { length: 50 }),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMergeConflictSchema = createInsertSchema(
  mergeConflicts,
).omit({
  id: true,
  actualResolution: true,
  resolvedBy: true,
  resolvedAt: true,
  createdAt: true,
});

export type MergeConflictRow = typeof mergeConflicts.$inferSelect;
export type InsertMergeConflict = z.infer<typeof insertMergeConflictSchema>;

/**
 * schema_proposals — Schema evolution proposals from extraction.
 *
 * During knowledge graph construction, the DIAL-KG extraction pipeline
 * discovers entity types and relationship types from data (math.md
 * Section 2.5). New discoveries enter a proposal pool for human curation
 * via the Schema Observatory (graph_plan.md Feature #2).
 *
 * Proposals can be for leaf graphs or federation graphs. The graph_type
 * field distinguishes them. Proposal types include: new_entity_type,
 * new_relationship_type, type_synonym, relationship_canonicalization.
 */
export const schemaProposals = pgTable("schema_proposals", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  // The graph this proposal is associated with (knowledgeGraphs.id or graphFederations.id)
  graphId: varchar("graph_id").notNull(),
  // leaf | federation
  graphType: varchar("graph_type", { length: 20 }).notNull().default("leaf"),
  // new_entity_type | new_relationship_type | type_synonym | relationship_canonicalization
  proposalType: varchar("proposal_type", { length: 50 }).notNull(),
  // The proposed label (e.g., "Ticket", "DEPLOYED_TO")
  proposedName: varchar("proposed_name", { length: 255 }).notNull(),
  // Full definition with examples, domain/range, etc.
  proposedDefinition: jsonb("proposed_definition")
    .$type<Record<string, any>>()
    .notNull(),
  // How many times this type was observed in the corpus
  observedFrequency: integer("observed_frequency").notNull().default(1),
  // proposed | accepted | rejected | merged (merged into existing type)
  status: varchar("status", { length: 20 }).notNull().default("proposed"),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSchemaProposalSchema = createInsertSchema(
  schemaProposals,
).omit({
  id: true,
  status: true,
  acceptedAt: true,
  createdAt: true,
});

export type SchemaProposalRow = typeof schemaProposals.$inferSelect;
export type InsertSchemaProposal = z.infer<
  typeof insertSchemaProposalSchema
>;

/**
 * user_kg_model_settings — Per-user model selection for each stage
 * of the DIAL-KG extraction pipeline. Lets users pick expensive
 * reasoning models for critical stages (extraction) and cheaper
 * models for less critical stages (query, adjudication).
 *
 * preferences JSON shape:
 * {
 *   extraction:    { model: "gpt-5.3-codex", reasoningEffort: "high" },
 *   adjudication:  { model: "gpt-5-mini", reasoningEffort: "medium" },
 *   query:         { model: "gpt-4o-mini", reasoningEffort: null }
 * }
 */
export const userKgModelSettings = pgTable("user_kg_model_settings", {
  userId: varchar("user_id").primaryKey(),
  preferences: jsonb("preferences")
    .$type<Record<string, { model: string; reasoningEffort: string | null }>>()
    .notNull()
    .default({}),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type UserKgModelSettingsRow = typeof userKgModelSettings.$inferSelect;

/**
 * brain_endpoints — Externally-published Brain APIs for knowledge graphs.
 *
 * Each row is one published endpoint that wraps a single KG and exposes
 * it via two transports: REST (`/api/brain/:apiKey/ask`) and MCP
 * (`/api/brain/:apiKey/mcp`). Per-endpoint model overrides let the user
 * pin which LLM handles query generation and which handles traversal,
 * independently of their app-wide DIAL-KG defaults.
 */
export const brainEndpoints = pgTable("brain_endpoints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  knowledgeBaseId: varchar("knowledge_base_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  apiKey: varchar("api_key", { length: 64 }).notNull().unique(),
  // Per-endpoint model overrides — null = inherit user's app-wide DIAL-KG settings
  queryModel: varchar("query_model", { length: 100 }),
  queryReasoningEffort: varchar("query_reasoning_effort", { length: 20 }),
  traversalModel: varchar("traversal_model", { length: 100 }),
  traversalReasoningEffort: varchar("traversal_reasoning_effort", { length: 20 }),
  rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(60),
  allowNlQueries: boolean("allow_nl_queries").notNull().default(true),
  allowCypher: boolean("allow_cypher").notNull().default(false),
  expiresAt: timestamp("expires_at"),
  queryCount: integer("query_count").notNull().default(0),
  totalLatencyMs: bigint("total_latency_ms", { mode: "number" }).notNull().default(0),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type BrainEndpointRow = typeof brainEndpoints.$inferSelect;
export type InsertBrainEndpoint = typeof brainEndpoints.$inferInsert;

/**
 * kg_extraction_events — Audit trail for extraction batches.
 *
 * Records each knowledge increment (math.md Section 1.5):
 *   DeltaG_k = (V_k^+, E_k^+, E_k^down)
 *
 * Tracks entities added, edges added, edges deprecated, model used,
 * and freshness invalidation. When a leaf graph receives an increment,
 * every federation graph including it becomes stale.
 */
export const kgExtractionEvents = pgTable("kg_extraction_events", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  knowledgeBaseId: varchar("knowledge_base_id")
    .notNull()
    .references(() => knowledgeBase.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Status of this extraction batch
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  // Counts from the knowledge increment DeltaG_k
  entitiesAdded: integer("entities_added").default(0),
  edgesAdded: integer("edges_added").default(0),
  edgesDeprecated: integer("edges_deprecated").default(0),
  // Source document count processed in this batch
  documentsProcessed: integer("documents_processed").default(0),
  chunksProcessed: integer("chunks_processed").default(0),
  // Model used for extraction
  model: varchar("model", { length: 100 }),
  // Schema proposals generated during this extraction
  schemaProposalsGenerated: integer("schema_proposals_generated").default(0),
  // Execution metadata
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  // Any additional metadata (e.g., routing stats, dual-track breakdown)
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertKgExtractionEventSchema = createInsertSchema(
  kgExtractionEvents,
).omit({
  id: true,
  createdAt: true,
});

export type KgExtractionEventRow = typeof kgExtractionEvents.$inferSelect;
export type InsertKgExtractionEvent = z.infer<
  typeof insertKgExtractionEventSchema
>;

/* ────────────────────────────────────────────────────────────────────────── */
/*  Meta-Knowledge Graphs                                                     */
/*  ─────────────────────────                                                 */
/*  A meta-graph captures structural know-how ("how to reset a password")     */
/*  decoupled from instance data ("Jason's account at Acme"). It has two      */
/*  facets: a *pattern* of typed slots + relationships, and a *procedural*    */
/*  graph stored in FalkorDB at kgm_{userId}_{metaGraphId}. Slots can be      */
/*  bound to selectors over leaf KBs so a single meta-graph can project       */
/*  over many constituent graphs in a federation.                             */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * MetaSlot — a typed role inside a meta-graph pattern.
 *
 * Slots act as the binding interface to constituent KBs. Each slot has a
 * stable id (used by pattern edges and bindings), a human name, an
 * optional description, and a list of expected entity types from the
 * constituent KBs. The colorHint lets the 3D renderer pick a stable hue.
 */
export type MetaSlot = {
  id: string;
  name: string;
  description?: string;
  expectedEntityTypes: string[];
  colorHint?: string;
};

/**
 * MetaPatternEdge — a relationship in the meta-graph pattern.
 *
 * Connects two slots by id. relType is the canonical relationship name
 * (e.g. "RESOLVED_BY"). cardinality is descriptive only in v1
 * ("one_to_one" | "one_to_many" | "many_to_many").
 */
export type MetaPatternEdge = {
  id: string;
  fromSlotId: string;
  toSlotId: string;
  relType: string;
  description?: string;
  cardinality?: "one_to_one" | "one_to_many" | "many_to_many";
};

/**
 * SlotResolver — how to map a meta-graph slot to entities in one KB.
 *
 * - kind="entityType": value is an entity type label (e.g. "Customer")
 * - kind="labelMatch": value is a substring/regex matched against entity names
 * - kind="cypher": value is a raw Cypher predicate that returns matching nodes
 */
export type SlotResolver = {
  kind: "entityType" | "labelMatch" | "cypher";
  value: string;
};

/**
 * meta_graphs — Meta-knowledge graph definitions.
 *
 * Each row is one meta-graph. The slots/pattern columns hold the template
 * (pattern facet). The procedural facet lives in FalkorDB at
 * kgm_{userId}_{id}; we only store counts here.
 */
export const metaGraphs = pgTable("meta_graphs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // "manual" | "induced" | "hybrid"
  source: varchar("source", { length: 20 }).notNull().default("manual"),
  // KB ids the meta-graph was induced/refined from (empty for pure manual)
  derivedFromKbIds: jsonb("derived_from_kb_ids")
    .$type<string[]>()
    .notNull()
    .default([]),
  slots: jsonb("slots").$type<MetaSlot[]>().notNull().default([]),
  pattern: jsonb("pattern").$type<MetaPatternEdge[]>().notNull().default([]),
  // Stats for procedural nodes/edges (those living in kgm_* FalkorDB graph)
  proceduralNodeCount: integer("procedural_node_count").default(0),
  proceduralEdgeCount: integer("procedural_edge_count").default(0),
  // Brain endpoint publishing — meta-graphs can be published just like KBs
  isPublishedAsBrain: boolean("is_published_as_brain").default(false),
  brainEndpointId: varchar("brain_endpoint_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMetaGraphSchema = createInsertSchema(metaGraphs).omit({
  id: true,
  proceduralNodeCount: true,
  proceduralEdgeCount: true,
  isPublishedAsBrain: true,
  brainEndpointId: true,
  createdAt: true,
  updatedAt: true,
});

export type MetaGraphRow = typeof metaGraphs.$inferSelect;
export type InsertMetaGraph = z.infer<typeof insertMetaGraphSchema>;

/**
 * meta_graph_bindings — Per-KB resolvers for a meta-graph's slots.
 *
 * One row per (metaGraphId, knowledgeBaseId) pair. slotResolvers is a
 * map of slotId → SlotResolver describing how to find concrete entities
 * in that KB for that slot. Used by projected queries.
 */
export const metaGraphBindings = pgTable("meta_graph_bindings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  metaGraphId: varchar("meta_graph_id")
    .notNull()
    .references(() => metaGraphs.id, { onDelete: "cascade" }),
  knowledgeBaseId: varchar("knowledge_base_id")
    .notNull()
    .references(() => knowledgeBase.id, { onDelete: "cascade" }),
  slotResolvers: jsonb("slot_resolvers")
    .$type<Record<string, SlotResolver>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MetaGraphBindingRow = typeof metaGraphBindings.$inferSelect;
export type InsertMetaGraphBinding = typeof metaGraphBindings.$inferInsert;

/**
 * meta_graph_federations — A meta-graph + N constituent KBs.
 *
 * Replaces the legacy graphFederations model. The meta-graph is queryable
 * on its own; constituents are queried via slot projection. There is NO
 * materialization — this row is just a named tuple used as a query target.
 */
export const metaGraphFederations = pgTable("meta_graph_federations", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  metaGraphId: varchar("meta_graph_id")
    .notNull()
    .references(() => metaGraphs.id, { onDelete: "cascade" }),
  constituentKbIds: jsonb("constituent_kb_ids")
    .$type<string[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MetaGraphFederationRow =
  typeof metaGraphFederations.$inferSelect;
export type InsertMetaGraphFederation =
  typeof metaGraphFederations.$inferInsert;
