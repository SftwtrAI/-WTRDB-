CREATE TABLE IF NOT EXISTS "infra_rate_cards" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "region" text DEFAULT 'india' NOT NULL,
  "provider" text DEFAULT 'vobiz' NOT NULL,
  "call_direction" text NOT NULL,
  "call_type" text DEFAULT 'local_mobile' NOT NULL,
  "pstn_cost_per_min_usd" numeric(10, 6) DEFAULT 0.000000 NOT NULL,
  "livekit_cost_per_min_usd" numeric(10, 6) DEFAULT 0.000000 NOT NULL,
  "multiplier" numeric(10, 4) DEFAULT 2.5000 NOT NULL,
  "surcharge_credits_per_min" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'provisional' NOT NULL,
  "notes" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_infra_rate_cards_unique"
  ON "infra_rate_cards" ("region", "provider", "call_direction", "call_type");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "credit_ledger_entries" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL,
  "entry_type" text NOT NULL,
  "source_type" text NOT NULL,
  "source_id" text,
  "amount" integer NOT NULL,
  "description" text NOT NULL,
  "idempotency_key" text,
  "metadata" jsonb,
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "credit_ledger_entries_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "credit_balance_buckets" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL,
  "source_type" text NOT NULL,
  "source_id" text,
  "initial_credits" integer NOT NULL,
  "remaining_credits" integer NOT NULL,
  "granted_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp,
  "status" text DEFAULT 'active' NOT NULL,
  "ledger_entry_id" varchar,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "credit_ledger_entries"
  ADD CONSTRAINT "credit_ledger_entries_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "credit_balance_buckets"
  ADD CONSTRAINT "credit_balance_buckets_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "credit_balance_buckets"
  ADD CONSTRAINT "credit_balance_buckets_ledger_entry_id_credit_ledger_entries_id_fk"
  FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."credit_ledger_entries"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_credit_ledger_entries_user_created_at"
  ON "credit_ledger_entries" ("user_id", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_credit_ledger_entries_source"
  ON "credit_ledger_entries" ("source_type", "source_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_credit_balance_buckets_user_status_expires_at"
  ON "credit_balance_buckets" ("user_id", "status", "expires_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_credit_balance_buckets_expiry_scan"
  ON "credit_balance_buckets" ("status", "expires_at");
