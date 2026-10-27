ALTER TABLE "plans"
ADD COLUMN IF NOT EXISTS "signup_bonus_credits" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "plans"
ADD COLUMN IF NOT EXISTS "credit_rollover_months" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "plans"
ADD COLUMN IF NOT EXISTS "credit_rollover_cap" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "plans"
ADD COLUMN IF NOT EXISTS "max_knowledge_base_size_mb" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "plans"
ADD COLUMN IF NOT EXISTS "support_tier" text DEFAULT 'community' NOT NULL;
--> statement-breakpoint

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "signup_bonus_credited" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "monthly_credits_granted_at" timestamp;
--> statement-breakpoint
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "rollover_credits" integer DEFAULT 0 NOT NULL;
