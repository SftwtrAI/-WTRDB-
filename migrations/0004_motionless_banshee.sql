CREATE TABLE "claw_audit_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"claw_id" varchar,
	"user_id" varchar,
	"event_type" varchar(50) NOT NULL,
	"event_data" jsonb,
	"ip_address" varchar(45),
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"retention_expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "claw_hosts" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"organization_id" varchar,
	"status" varchar(20) DEFAULT 'healthy',
	"platform" varchar(50),
	"cpu_cores" integer,
	"memory_mb" integer,
	"disk_mb" integer,
	"gpu_model" varchar(100),
	"has_local_nemotron" boolean DEFAULT false,
	"max_sandboxes" integer DEFAULT 10,
	"active_sandboxes" integer DEFAULT 0,
	"last_heartbeat_at" timestamp,
	"cpu_usage_pct" real,
	"memory_usage_pct" real,
	"host_secret" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claw_inference_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"claw_id" varchar NOT NULL,
	"provider" varchar(50) NOT NULL,
	"model" varchar(100) NOT NULL,
	"tokens_in" integer NOT NULL,
	"tokens_out" integer NOT NULL,
	"credits_consumed" numeric(12, 4) NOT NULL,
	"latency_ms" integer,
	"event_type" varchar(30) NOT NULL,
	"routing_decision" varchar(30),
	"metadata" jsonb,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claw_policy_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar,
	"name" varchar(100) NOT NULL,
	"description" text,
	"network_whitelist" jsonb DEFAULT '[]'::jsonb,
	"network_mode" varchar(20) DEFAULT 'whitelist',
	"allowed_providers" jsonb,
	"allowed_models" jsonb,
	"min_skill_security_score" varchar(1),
	"blocked_skills" jsonb DEFAULT '[]'::jsonb,
	"allowed_skills" jsonb,
	"skill_install_approval_required" boolean DEFAULT true,
	"allowed_workflows" jsonb,
	"workflow_approval_required" boolean DEFAULT false,
	"max_workflow_executions_per_day" integer,
	"allowed_mcp_servers" jsonb,
	"mcp_tool_approval_required" boolean DEFAULT false,
	"max_mcp_calls_per_day" integer,
	"routing_policy" jsonb,
	"max_credits_per_call" integer,
	"is_system_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claw_tool_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"claw_id" varchar NOT NULL,
	"tool_source" varchar(20) NOT NULL,
	"tool_id" varchar(255) NOT NULL,
	"tool_name" varchar(255) NOT NULL,
	"status" varchar(20) NOT NULL,
	"deny_reason" varchar(100),
	"credits_consumed" numeric(12, 4) NOT NULL,
	"execution_ms" integer,
	"input_summary" text,
	"output_summary" text,
	"metadata" jsonb,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claws" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar(100) NOT NULL,
	"display_name" varchar(255),
	"status" varchar(20) DEFAULT 'provisioning' NOT NULL,
	"sandbox_id" varchar(255),
	"host_id" varchar(255),
	"model_provider" varchar(50) NOT NULL,
	"model_id" varchar(100) NOT NULL,
	"policy_template_id" varchar,
	"data_classification" varchar(20) DEFAULT 'internal',
	"credit_budget_daily" integer,
	"credit_budget_monthly" integer,
	"auto_pause_on_budget" boolean DEFAULT true,
	"soul_md" text,
	"skills" jsonb DEFAULT '[]'::jsonb,
	"channels" jsonb DEFAULT '[]'::jsonb,
	"assigned_agent_ids" jsonb DEFAULT '[]'::jsonb,
	"max_concurrent_voice_sessions" integer DEFAULT 3,
	"last_heartbeat_at" timestamp,
	"last_inference_at" timestamp,
	"total_credits_consumed" integer DEFAULT 0,
	"uptime_seconds" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concurrency_allocations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"team_id" varchar,
	"user_id" varchar,
	"concurrency_limit" integer NOT NULL,
	"concurrency_used" integer DEFAULT 0 NOT NULL,
	"overflow_policy" varchar(20) DEFAULT 'reject' NOT NULL,
	"allocated_by" varchar NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concurrency_limits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"voice_concurrency_limit" integer DEFAULT 2 NOT NULL,
	"voice_concurrency_used" integer DEFAULT 0 NOT NULL,
	"claw_concurrency_limit" integer DEFAULT 2 NOT NULL,
	"claw_concurrency_used" integer DEFAULT 0 NOT NULL,
	"total_concurrency_limit" integer DEFAULT 2 NOT NULL,
	"total_concurrency_used" integer DEFAULT 0 NOT NULL,
	"limit_source" varchar(20) DEFAULT 'plan' NOT NULL,
	"override_reason" text,
	"override_by" varchar,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "concurrency_limits_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "concurrency_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"team_id" varchar,
	"user_id" varchar,
	"session_type" varchar(20) NOT NULL,
	"resource_id" varchar(255) NOT NULL,
	"session_token" varchar(255),
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"last_heartbeat_at" timestamp,
	"status" varchar(20) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_balance_buckets" (
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
CREATE TABLE "credit_ledger_entries" (
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
CREATE TABLE "credit_rate_cards" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_tier" text NOT NULL,
	"audio_in_per_1k" integer DEFAULT 0 NOT NULL,
	"audio_out_per_1k" integer DEFAULT 0 NOT NULL,
	"text_in_per_1k" integer DEFAULT 0 NOT NULL,
	"text_out_per_1k" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_rate_cards_model_tier_unique" UNIQUE("model_tier")
);
--> statement-breakpoint
CREATE TABLE "data_connections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" varchar(100) NOT NULL,
	"provider" varchar(30) NOT NULL,
	"connection_config" jsonb,
	"credential_id" varchar,
	"status" varchar(20) DEFAULT 'pending',
	"last_sync_at" timestamp,
	"schema_version" integer DEFAULT 0,
	"allowed_team_ids" jsonb,
	"data_classification" varchar(20) DEFAULT 'internal',
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_schema_cache" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" varchar NOT NULL,
	"table_name" varchar(255) NOT NULL,
	"schema_name" varchar(255),
	"columns" jsonb NOT NULL,
	"row_count_estimate" bigint,
	"size_estimate_mb" integer,
	"business_name" varchar(255),
	"business_description" text,
	"common_queries" jsonb,
	"last_sync_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_regions" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"provider" varchar(20) DEFAULT 'oci' NOT NULL,
	"continent" varchar(20) NOT NULL,
	"country" varchar(100) NOT NULL,
	"is_primary" boolean DEFAULT false,
	"has_database" boolean DEFAULT false,
	"has_cdn_edge" boolean DEFAULT true,
	"has_claw_hosts" boolean DEFAULT false,
	"status" varchar(20) DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_rate_cards" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"region" text DEFAULT 'india' NOT NULL,
	"provider" text DEFAULT 'vobiz' NOT NULL,
	"call_direction" text NOT NULL,
	"call_type" text DEFAULT 'local_mobile' NOT NULL,
	"pstn_cost_per_min_usd" numeric(10, 6) DEFAULT '0.000000' NOT NULL,
	"livekit_cost_per_min_usd" numeric(10, 6) DEFAULT '0.000000' NOT NULL,
	"multiplier" numeric(10, 4) DEFAULT '2.5000' NOT NULL,
	"surcharge_credits_per_min" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'provisional' NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "infra_rate_cards_region_provider_call_direction_call_type_unique" UNIQUE("region","provider","call_direction","call_type")
);
--> statement-breakpoint
CREATE TABLE "managed_cloud_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"price_monthly" numeric(12, 2) NOT NULL,
	"price_currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"credits_included" integer NOT NULL,
	"concurrency_limit" integer NOT NULL,
	"claw_agent_limit" integer NOT NULL,
	"voice_agent_limit" integer,
	"phone_numbers_included" integer DEFAULT 1 NOT NULL,
	"custom_policy_templates" boolean DEFAULT false,
	"enterprise_rbac" boolean DEFAULT false,
	"multi_region_deployment" boolean DEFAULT false,
	"priority_support" boolean DEFAULT false,
	"compliance_reports" boolean DEFAULT false,
	"custom_mcp_servers" boolean DEFAULT false,
	"sla_guarantee" varchar(10),
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "managed_cloud_trials" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"trial_started_at" timestamp DEFAULT now() NOT NULL,
	"trial_expires_at" timestamp NOT NULL,
	"grace_expires_at" timestamp NOT NULL,
	"talk_time_minutes_total" integer DEFAULT 30 NOT NULL,
	"talk_time_minutes_used" numeric(10, 2) DEFAULT '0' NOT NULL,
	"concurrency_limit" integer DEFAULT 2 NOT NULL,
	"assigned_phone_number_id" varchar,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"converted_at" timestamp,
	"converted_to_plan_id" varchar,
	"day_before_expiry_reminder_sent" boolean DEFAULT false,
	"expiry_reminder_sent" boolean DEFAULT false,
	"grace_reminder_sent" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "managed_cloud_trials_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "org_mcp_servers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"transport" varchar(10) NOT NULL,
	"endpoint" varchar(500),
	"command" varchar(500),
	"env_vars" jsonb,
	"is_active" boolean DEFAULT true,
	"available_to" varchar(20) DEFAULT 'all',
	"allowed_claw_ids" jsonb,
	"allowed_agent_ids" jsonb,
	"requires_approval" boolean DEFAULT false,
	"data_classification_min" varchar(20),
	"tool_count" integer DEFAULT 0,
	"last_health_check_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar(30) DEFAULT 'member' NOT NULL,
	"invited_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_regions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"region_id" varchar(30) NOT NULL,
	"is_primary" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"owner_id" varchar NOT NULL,
	"logo" text,
	"default_region_id" varchar(30),
	"trial_status" varchar(20) DEFAULT 'no_trial',
	"managed_cloud_plan_id" varchar,
	"google_oauth_enabled" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"category" varchar(50) NOT NULL,
	CONSTRAINT "permissions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "phone_number_pool" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar,
	"provider_id" varchar,
	"provider_number_sid" varchar(255),
	"phone_number" varchar(20) NOT NULL,
	"country_code" varchar(5) NOT NULL,
	"country" varchar(100) NOT NULL,
	"number_type" varchar(20) DEFAULT 'local',
	"status" varchar(20) DEFAULT 'available' NOT NULL,
	"assigned_to_agent_id" varchar,
	"assigned_to_campaign_id" varchar,
	"pool_status" varchar(20) DEFAULT 'available',
	"cooldown_until" timestamp,
	"previous_organization_id" varchar,
	"monthly_cost" numeric(10, 4),
	"monthly_cost_currency" varchar(3) DEFAULT 'USD',
	"purchased_at" timestamp,
	"released_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "query_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"connection_id" varchar NOT NULL,
	"user_id" varchar,
	"claw_id" varchar,
	"natural_language_query" text,
	"generated_sql" text NOT NULL,
	"execution_time_ms" integer,
	"rows_returned" integer,
	"bytes_scanned" bigint,
	"credits_consumed" numeric(12, 4),
	"status" varchar(20) NOT NULL,
	"error_message" text,
	"deny_reason" varchar(100),
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rbac_audit_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"actor_user_id" varchar NOT NULL,
	"target_user_id" varchar,
	"event_type" varchar(50) NOT NULL,
	"event_data" jsonb,
	"ip_address" varchar(45),
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" varchar NOT NULL,
	"permission_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar,
	"name" varchar(50) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"description" text,
	"is_system_role" boolean DEFAULT false,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "semantic_mappings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" varchar NOT NULL,
	"business_term" varchar(100) NOT NULL,
	"definition" text NOT NULL,
	"sql_expression" text,
	"related_tables" jsonb,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar(30) DEFAULT 'member' NOT NULL,
	"added_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"parent_team_id" varchar,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telephony_providers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"provider" varchar(30) NOT NULL,
	"display_name" varchar(100),
	"api_key" text,
	"api_secret" text,
	"account_sid" text,
	"auth_token" text,
	"additional_config" jsonb,
	"is_active" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"last_verified_at" timestamp,
	"verification_status" varchar(20) DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"role_id" varchar NOT NULL,
	"scope_team_id" varchar,
	"assigned_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_models" ADD COLUMN "credit_tier" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "signup_bonus_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "credit_rollover_months" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "credit_rollover_cap" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "max_knowledge_base_size_mb" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "support_tier" text DEFAULT 'community' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signup_bonus_credited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "monthly_credits_granted_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "rollover_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "claw_audit_events" ADD CONSTRAINT "claw_audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claw_audit_events" ADD CONSTRAINT "claw_audit_events_claw_id_claws_id_fk" FOREIGN KEY ("claw_id") REFERENCES "public"."claws"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claw_audit_events" ADD CONSTRAINT "claw_audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claw_hosts" ADD CONSTRAINT "claw_hosts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claw_inference_events" ADD CONSTRAINT "claw_inference_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claw_inference_events" ADD CONSTRAINT "claw_inference_events_claw_id_claws_id_fk" FOREIGN KEY ("claw_id") REFERENCES "public"."claws"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claw_policy_templates" ADD CONSTRAINT "claw_policy_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claw_tool_events" ADD CONSTRAINT "claw_tool_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claw_tool_events" ADD CONSTRAINT "claw_tool_events_claw_id_claws_id_fk" FOREIGN KEY ("claw_id") REFERENCES "public"."claws"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claws" ADD CONSTRAINT "claws_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claws" ADD CONSTRAINT "claws_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claws" ADD CONSTRAINT "claws_policy_template_id_claw_policy_templates_id_fk" FOREIGN KEY ("policy_template_id") REFERENCES "public"."claw_policy_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concurrency_allocations" ADD CONSTRAINT "concurrency_allocations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concurrency_allocations" ADD CONSTRAINT "concurrency_allocations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concurrency_allocations" ADD CONSTRAINT "concurrency_allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concurrency_allocations" ADD CONSTRAINT "concurrency_allocations_allocated_by_users_id_fk" FOREIGN KEY ("allocated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concurrency_limits" ADD CONSTRAINT "concurrency_limits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concurrency_limits" ADD CONSTRAINT "concurrency_limits_override_by_users_id_fk" FOREIGN KEY ("override_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concurrency_sessions" ADD CONSTRAINT "concurrency_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concurrency_sessions" ADD CONSTRAINT "concurrency_sessions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concurrency_sessions" ADD CONSTRAINT "concurrency_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_balance_buckets" ADD CONSTRAINT "credit_balance_buckets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_balance_buckets" ADD CONSTRAINT "credit_balance_buckets_ledger_entry_id_credit_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."credit_ledger_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_connections" ADD CONSTRAINT "data_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_connections" ADD CONSTRAINT "data_connections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_schema_cache" ADD CONSTRAINT "data_schema_cache_connection_id_data_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."data_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_cloud_trials" ADD CONSTRAINT "managed_cloud_trials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_cloud_trials" ADD CONSTRAINT "managed_cloud_trials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_cloud_trials" ADD CONSTRAINT "managed_cloud_trials_assigned_phone_number_id_phone_number_pool_id_fk" FOREIGN KEY ("assigned_phone_number_id") REFERENCES "public"."phone_number_pool"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_mcp_servers" ADD CONSTRAINT "org_mcp_servers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_regions" ADD CONSTRAINT "organization_regions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_regions" ADD CONSTRAINT "organization_regions_region_id_deployment_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."deployment_regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_number_pool" ADD CONSTRAINT "phone_number_pool_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_number_pool" ADD CONSTRAINT "phone_number_pool_provider_id_telephony_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."telephony_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_history" ADD CONSTRAINT "query_history_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_history" ADD CONSTRAINT "query_history_connection_id_data_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."data_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_history" ADD CONSTRAINT "query_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_history" ADD CONSTRAINT "query_history_claw_id_claws_id_fk" FOREIGN KEY ("claw_id") REFERENCES "public"."claws"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbac_audit_events" ADD CONSTRAINT "rbac_audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbac_audit_events" ADD CONSTRAINT "rbac_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbac_audit_events" ADD CONSTRAINT "rbac_audit_events_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semantic_mappings" ADD CONSTRAINT "semantic_mappings_connection_id_data_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."data_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semantic_mappings" ADD CONSTRAINT "semantic_mappings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_providers" ADD CONSTRAINT "telephony_providers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_scope_team_id_teams_id_fk" FOREIGN KEY ("scope_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;