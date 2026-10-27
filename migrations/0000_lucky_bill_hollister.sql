CREATE TABLE "agent_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"version_number" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changes_summary" text,
	"changed_fields" text[],
	"edited_by" varchar,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"eleven_labs_credential_id" varchar,
	"telephony_provider" text DEFAULT 'twilio',
	"sip_trunk_id" varchar,
	"sip_phone_number_id" varchar,
	"livekit_credential_id" varchar,
	"openai_voice" text,
	"openai_credential_id" varchar,
	"realtime_model" text DEFAULT 'gpt-realtime',
	"type" text NOT NULL,
	"name" text NOT NULL,
	"voice_tone" text,
	"personality" text,
	"system_prompt" text,
	"language" text DEFAULT 'en',
	"first_message" text DEFAULT 'Hello! How can I help you today?',
	"llm_model" text DEFAULT 'gpt-4o-mini',
	"temperature" double precision DEFAULT 0.5,
	"eleven_labs_agent_id" text,
	"transfer_phone_number" text,
	"transfer_enabled" boolean DEFAULT false,
	"detect_language_enabled" boolean DEFAULT false,
	"end_conversation_enabled" boolean DEFAULT false,
	"appointment_booking_enabled" boolean DEFAULT false,
	"knowledge_base_ids" text[],
	"eleven_labs_voice_id" text,
	"voice_stability" double precision DEFAULT 0.55,
	"voice_similarity_boost" double precision DEFAULT 0.85,
	"voice_speed" double precision DEFAULT 1,
	"flow_id" varchar,
	"form_id" varchar,
	"max_duration_seconds" integer DEFAULT 600,
	"agent_link" text,
	"config" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_scripts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'custom' NOT NULL,
	"code" text NOT NULL,
	"head_code" text,
	"body_code" text,
	"placement" text[] DEFAULT ARRAY['head']::text[] NOT NULL,
	"load_priority" integer DEFAULT 0 NOT NULL,
	"async" boolean DEFAULT false,
	"defer" boolean DEFAULT false,
	"enabled" boolean DEFAULT true NOT NULL,
	"description" text,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"api_key_id" varchar,
	"method" text NOT NULL,
	"endpoint" text NOT NULL,
	"path" text NOT NULL,
	"request_body" jsonb,
	"query_params" jsonb,
	"status_code" integer NOT NULL,
	"response_time" integer,
	"error_message" text,
	"ip_address" text,
	"user_agent" text,
	"request_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"hashed_secret" text NOT NULL,
	"scopes" text[] DEFAULT ARRAY['calls:read', 'calls:write', 'campaigns:read', 'contacts:read']::text[] NOT NULL,
	"rate_limit" integer DEFAULT 100 NOT NULL,
	"rate_limit_window" integer DEFAULT 60 NOT NULL,
	"ip_whitelist" text[] DEFAULT ARRAY[]::text[],
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"last_used_ip" text,
	"total_requests" integer DEFAULT 0 NOT NULL,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_rate_limits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" varchar NOT NULL,
	"window_start" timestamp NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_settings" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"allow_overlapping" boolean DEFAULT false NOT NULL,
	"buffer_minutes" integer DEFAULT 0 NOT NULL,
	"working_hours" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"call_id" varchar,
	"flow_id" varchar,
	"contact_name" varchar(255) NOT NULL,
	"contact_phone" varchar(50) NOT NULL,
	"contact_email" varchar(255),
	"appointment_date" date NOT NULL,
	"appointment_time" time NOT NULL,
	"duration" integer NOT NULL,
	"service_name" varchar(255),
	"notes" text,
	"status" varchar(50) DEFAULT 'scheduled' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"user_id" varchar,
	"target_user_id" varchar,
	"resource_type" text,
	"resource_id" varchar,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"severity" text DEFAULT 'info' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_candidates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"automation_id" varchar NOT NULL,
	"candidate_id" varchar NOT NULL,
	"interview_token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_at" timestamp,
	"scheduled_at" timestamp,
	"reminder_sent_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"expires_at" timestamp,
	"overall_score" double precision,
	"ai_recommendation" text,
	"ai_summary" text,
	"livekit_room_name" text,
	"call_id" varchar,
	"duration" integer,
	"transcript" text,
	"recording_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "automation_candidates_interview_token_unique" UNIQUE("interview_token")
);
--> statement-breakpoint
CREATE TABLE "automation_responses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"automation_candidate_id" varchar NOT NULL,
	"question_set_item_id" varchar NOT NULL,
	"response_text" text,
	"response_start_time" integer,
	"response_duration" integer,
	"score" double precision,
	"score_rationale" text,
	"keywords_matched" text[],
	"follow_up_asked" boolean DEFAULT false,
	"follow_up_text" text,
	"follow_up_response" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avatars" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"provider_avatar_id" text NOT NULL,
	"display_name" text NOT NULL,
	"image_url" text,
	"type" text DEFAULT 'custom' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "banned_words" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"auto_block" boolean DEFAULT false NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"campaign_id" varchar,
	"contact_id" varchar,
	"incoming_connection_id" varchar,
	"widget_id" varchar,
	"incoming_agent_id" varchar,
	"phone_number" text,
	"from_number" text,
	"to_number" text,
	"twilio_sid" text,
	"elevenlabs_conversation_id" text,
	"livekit_room_name" text,
	"livekit_participant_identity" text,
	"livekit_credential_id" varchar,
	"status" text DEFAULT 'pending' NOT NULL,
	"call_direction" text DEFAULT 'outgoing' NOT NULL,
	"duration" integer,
	"recording_url" text,
	"transcript" text,
	"ai_summary" text,
	"classification" text,
	"sentiment" text,
	"disposition" text,
	"metadata" jsonb,
	"was_transferred" boolean DEFAULT false,
	"transferred_to" text,
	"transferred_at" timestamp,
	"started_at" timestamp,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"contact_id" varchar NOT NULL,
	"engine" text DEFAULT 'plivo' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"worker_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"agent_id" varchar,
	"voice_id" text,
	"phone_number_id" varchar,
	"sip_phone_number_id" varchar,
	"flow_id" varchar,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"goal" text,
	"script" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_contacts" integer DEFAULT 0 NOT NULL,
	"completed_calls" integer DEFAULT 0 NOT NULL,
	"successful_calls" integer DEFAULT 0 NOT NULL,
	"failed_calls" integer DEFAULT 0 NOT NULL,
	"retried_calls" integer DEFAULT 0 NOT NULL,
	"scheduled_for" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"deleted_at" timestamp,
	"schedule_enabled" boolean DEFAULT false NOT NULL,
	"schedule_time_start" text,
	"schedule_time_end" text,
	"schedule_days" text[],
	"schedule_timezone" text DEFAULT 'America/New_York',
	"batch_job_id" text,
	"batch_job_status" text,
	"retry_enabled" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"error_code" text,
	"concurrency" integer DEFAULT 10 NOT NULL,
	"config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_rankings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" varchar NOT NULL,
	"job_description_id" varchar NOT NULL,
	"relevance_score" double precision,
	"relevance_summary" text,
	"ranked_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_rankings_candidate_id_job_description_id_unique" UNIQUE("candidate_id","job_description_id")
);
--> statement-breakpoint
CREATE TABLE "candidate_sets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"total_candidates" integer DEFAULT 0 NOT NULL,
	"ranked_candidates" integer DEFAULT 0 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"last_ranked_jd_id" varchar,
	"last_ranked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_set_id" varchar NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text NOT NULL,
	"phone" text,
	"resume_file_url" text,
	"resume_text" text,
	"resume_summary" text,
	"resume_embedding" jsonb,
	"location" text,
	"years_experience" integer,
	"current_title" text,
	"current_company" text,
	"linkedin" text,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"phone" text NOT NULL,
	"email" text,
	"custom_fields" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_violations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"banned_word_id" varchar,
	"detected_word" text NOT NULL,
	"context" text,
	"severity" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"action_taken" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_packages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"credits" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"razorpay_price" numeric(10, 2),
	"stripe_product_id" text,
	"stripe_price_id" text,
	"razorpay_item_id" text,
	"paypal_price" numeric(10, 2),
	"paystack_price" numeric(10, 2),
	"mercadopago_price" numeric(10, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"description" text NOT NULL,
	"reference" text,
	"stripe_payment_id" text,
	"widget_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_transactions_stripe_payment_id_unique" UNIQUE("stripe_payment_id")
);
--> statement-breakpoint
CREATE TABLE "crm_category_preferences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"column_order" text[] DEFAULT ARRAY['warm', 'hot', 'appointment_booked', 'form_submitted', 'call_transfer', 'need_follow_up']::text[] NOT NULL,
	"color_overrides" jsonb DEFAULT '{}'::jsonb,
	"column_sort_preferences" jsonb DEFAULT '{}'::jsonb,
	"hide_leads_without_phone" boolean DEFAULT false NOT NULL,
	"category_pipeline_mappings" jsonb DEFAULT '{}'::jsonb,
	"hot_score_threshold" integer DEFAULT 80,
	"warm_score_threshold" integer DEFAULT 50,
	"hidden_categories" text[] DEFAULT ARRAY[]::text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_token" text NOT NULL,
	"visitor_ip" text,
	"visitor_fingerprint" text,
	"language" text DEFAULT 'en' NOT NULL,
	"voice" text DEFAULT 'alloy' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"duration" integer,
	"max_duration" integer DEFAULT 60 NOT NULL,
	"transcript" text,
	"openai_session_id" text,
	"openai_credential_id" varchar,
	"metadata" jsonb,
	"started_at" timestamp,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "demo_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "eleven_labs_credentials" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"api_key" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"max_concurrency" integer DEFAULT 30 NOT NULL,
	"current_load" integer DEFAULT 0 NOT NULL,
	"total_assigned_agents" integer DEFAULT 0 NOT NULL,
	"total_assigned_users" integer DEFAULT 0 NOT NULL,
	"max_agents_threshold" integer DEFAULT 100 NOT NULL,
	"last_health_check" timestamp,
	"health_status" text DEFAULT 'healthy' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_configs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"smtp_host" text NOT NULL,
	"smtp_port" integer NOT NULL,
	"smtp_username" text NOT NULL,
	"smtp_password" text NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text,
	"invitation_subject" text,
	"invitation_body" text,
	"reminder_subject" text,
	"reminder_body" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"last_verified_at" timestamp,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_notification_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"template_id" varchar,
	"threshold_value" integer,
	"category" text DEFAULT 'general' NOT NULL,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_notification_settings_event_type_unique" UNIQUE("event_type")
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_type" text NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"html_body" text NOT NULL,
	"text_body" text NOT NULL,
	"variables" text[],
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_templates_template_type_unique" UNIQUE("template_type")
);
--> statement-breakpoint
CREATE TABLE "flow_executions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"call_id" varchar NOT NULL,
	"flow_id" varchar NOT NULL,
	"current_node_id" varchar,
	"status" varchar(50) NOT NULL,
	"variables" jsonb DEFAULT '{}'::jsonb,
	"path_taken" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "flows" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"nodes" jsonb NOT NULL,
	"edges" jsonb NOT NULL,
	"agent_id" varchar,
	"voice_settings" jsonb,
	"execution_config" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"compiled_system_prompt" text,
	"compiled_first_message" text,
	"compiled_states" jsonb,
	"compiled_tools" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fonoster_credentials" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"access_key_id" text NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"api_secret_encrypted" text NOT NULL,
	"endpoint" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"health_status" text DEFAULT 'unknown' NOT NULL,
	"last_health_check" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_fields" (
	"id" varchar PRIMARY KEY NOT NULL,
	"form_id" varchar NOT NULL,
	"question" text NOT NULL,
	"field_type" varchar(50) NOT NULL,
	"options" jsonb,
	"is_required" boolean DEFAULT true NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"form_id" varchar NOT NULL,
	"call_id" varchar,
	"flow_execution_id" varchar,
	"contact_name" varchar(255),
	"contact_phone" varchar(50),
	"responses" jsonb NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forms" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_by" varchar,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "global_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "incoming_agents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"eleven_labs_credential_id" varchar,
	"name" text NOT NULL,
	"eleven_labs_agent_id" text NOT NULL,
	"eleven_labs_voice_id" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"system_prompt" text NOT NULL,
	"personality" text DEFAULT 'helpful',
	"voice_tone" text DEFAULT 'professional',
	"first_message" text DEFAULT 'Hello! How can I help you today?' NOT NULL,
	"llm_model" text DEFAULT 'gpt-4o-mini',
	"temperature" double precision DEFAULT 0.5,
	"transfer_phone_number" text,
	"transfer_enabled" boolean DEFAULT false NOT NULL,
	"business_hours_enabled" boolean DEFAULT false NOT NULL,
	"business_hours_start" text,
	"business_hours_end" text,
	"business_days" text[],
	"business_hours_timezone" text DEFAULT 'America/New_York',
	"after_hours_message" text DEFAULT 'Thank you for calling. We''re currently closed. Please call back during business hours.',
	"knowledge_base_ids" text[],
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incoming_connections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"agent_id" varchar NOT NULL,
	"phone_number_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "incoming_connections_phone_number_id_unique" UNIQUE("phone_number_id")
);
--> statement-breakpoint
CREATE TABLE "interview_automations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"job_description_id" varchar NOT NULL,
	"question_set_id" varchar NOT NULL,
	"candidate_set_id" varchar NOT NULL,
	"email_config_id" varchar,
	"candidate_filter" jsonb,
	"avatar_id" varchar,
	"openai_voice" text DEFAULT 'coral' NOT NULL,
	"interviewer_name" text DEFAULT 'Alex' NOT NULL,
	"interviewer_personality" text,
	"language" text DEFAULT 'en' NOT NULL,
	"max_duration_seconds" integer DEFAULT 1800 NOT NULL,
	"company_name" text,
	"company_logo_url" text,
	"thank_you_message" text,
	"concurrency" integer DEFAULT 2 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_candidates" integer DEFAULT 0 NOT NULL,
	"invited_candidates" integer DEFAULT 0 NOT NULL,
	"completed_interviews" integer DEFAULT 0 NOT NULL,
	"average_score" double precision,
	"activated_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_candidates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interview_id" varchar NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text NOT NULL,
	"phone" text,
	"resume_file_url" text,
	"resume_text" text,
	"resume_summary" text,
	"resume_embedding" jsonb,
	"relevance_score" double precision,
	"relevance_summary" text,
	"interview_token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_at" timestamp,
	"scheduled_at" timestamp,
	"reminder_sent_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"expires_at" timestamp,
	"overall_score" double precision,
	"ai_recommendation" text,
	"ai_summary" text,
	"livekit_room_name" text,
	"call_id" varchar,
	"duration" integer,
	"transcript" text,
	"recording_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "interview_candidates_interview_token_unique" UNIQUE("interview_token")
);
--> statement-breakpoint
CREATE TABLE "interview_questions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interview_id" varchar NOT NULL,
	"question" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"order" integer NOT NULL,
	"time_limit_seconds" integer,
	"is_required" boolean DEFAULT true NOT NULL,
	"scoring_rubric" text,
	"max_score" integer DEFAULT 10 NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	"follow_up_guidance" text,
	"expected_keywords" text[],
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_responses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" varchar NOT NULL,
	"question_id" varchar NOT NULL,
	"response_text" text,
	"response_start_time" integer,
	"response_duration" integer,
	"score" double precision,
	"score_rationale" text,
	"keywords_matched" text[],
	"follow_up_asked" boolean DEFAULT false,
	"follow_up_text" text,
	"follow_up_response" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"job_title" text NOT NULL,
	"job_description" text NOT NULL,
	"job_description_file_url" text,
	"department" text,
	"job_description_embedding" jsonb,
	"avatar_id" varchar,
	"openai_voice" text DEFAULT 'coral' NOT NULL,
	"interviewer_name" text DEFAULT 'Alex' NOT NULL,
	"interviewer_personality" text,
	"language" text DEFAULT 'en' NOT NULL,
	"max_duration_seconds" integer DEFAULT 1800 NOT NULL,
	"email_subject" text,
	"email_body" text,
	"company_name" text,
	"company_logo_url" text,
	"thank_you_message" text,
	"total_candidates" integer DEFAULT 0 NOT NULL,
	"completed_interviews" integer DEFAULT 0 NOT NULL,
	"average_score" double precision,
	"concurrency" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"invoice_number" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"customer_address" text,
	"description" text NOT NULL,
	"line_items" jsonb NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"tax" numeric(10, 2) DEFAULT '0.00',
	"total" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"gateway" text NOT NULL,
	"payment_method" text,
	"pdf_url" text,
	"pdf_generated_at" timestamp,
	"status" text DEFAULT 'draft' NOT NULL,
	"email_sent_at" timestamp,
	"email_sent_to" text,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"due_at" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "job_descriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"department" text,
	"company" text,
	"location" text,
	"employment_type" text,
	"embedding" jsonb,
	"tags" text[],
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_base" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"url" text,
	"file_url" text,
	"eleven_labs_doc_id" text,
	"metadata" jsonb,
	"storage_size" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_base_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"embedding" jsonb,
	"token_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_processing_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_base_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"total_chunks" integer DEFAULT 0,
	"processed_chunks" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"activity_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_notes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_stages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6B7280' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_custom" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"source_type" text NOT NULL,
	"campaign_id" varchar,
	"incoming_connection_id" varchar,
	"first_name" text,
	"last_name" text,
	"phone" text NOT NULL,
	"email" text,
	"company" text,
	"custom_fields" jsonb,
	"stage_id" varchar,
	"stage" text DEFAULT 'new' NOT NULL,
	"lead_score" integer,
	"ai_summary" text,
	"ai_next_action" text,
	"sentiment" text,
	"ai_category" text,
	"has_appointment" boolean DEFAULT false NOT NULL,
	"has_form_submission" boolean DEFAULT false NOT NULL,
	"has_transfer" boolean DEFAULT false NOT NULL,
	"has_callback" boolean DEFAULT false NOT NULL,
	"appointment_date" timestamp,
	"appointment_details" jsonb,
	"form_data" jsonb,
	"transferred_to" text,
	"transferred_at" timestamp,
	"callback_scheduled" timestamp,
	"callback_completed" boolean DEFAULT false NOT NULL,
	"call_id" varchar,
	"plivo_call_id" varchar,
	"twilio_openai_call_id" varchar,
	"total_calls" integer DEFAULT 1 NOT NULL,
	"last_call_at" timestamp,
	"tags" text[],
	"assigned_user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" varchar NOT NULL,
	"call_id" varchar,
	"status" text NOT NULL,
	"response_code" integer,
	"response_body" text,
	"payload" jsonb NOT NULL,
	"error_message" text,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"last_attempt_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"campaign_id" varchar NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "livekit_credentials" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"livekit_url" text NOT NULL,
	"livekit_api_key" text NOT NULL,
	"livekit_api_secret" text NOT NULL,
	"sip_trunk_id" text,
	"inbound_trunk_id" text,
	"twilio_account_sid" text,
	"twilio_auth_token" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"max_concurrent_calls" integer DEFAULT 10 NOT NULL,
	"current_load" integer DEFAULT 0 NOT NULL,
	"health_status" text DEFAULT 'healthy' NOT NULL,
	"last_health_check" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_models" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" text NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"tier" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "llm_models_model_id_unique" UNIQUE("model_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"link" text,
	"icon" text,
	"display_type" text DEFAULT 'bell' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"dismissible" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_dismissed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "openai_credentials" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"api_key" text NOT NULL,
	"model_tier" text DEFAULT 'free' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"max_concurrency" integer DEFAULT 50 NOT NULL,
	"current_load" integer DEFAULT 0 NOT NULL,
	"total_assigned_agents" integer DEFAULT 0 NOT NULL,
	"total_assigned_users" integer DEFAULT 0 NOT NULL,
	"max_agents_threshold" integer DEFAULT 100 NOT NULL,
	"last_health_check" timestamp,
	"health_status" text DEFAULT 'healthy' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_verifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"otp_code" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"gateway" text NOT NULL,
	"gateway_transaction_id" text,
	"gateway_subscription_id" text,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"plan_id" varchar,
	"credit_package_id" varchar,
	"subscription_id" varchar,
	"description" text NOT NULL,
	"billing_period" text,
	"credits_awarded" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"invoice_id" varchar,
	"metadata" jsonb,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gateway" text NOT NULL,
	"event_type" text NOT NULL,
	"event_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"last_attempt_at" timestamp,
	"next_retry_at" timestamp,
	"last_error" text,
	"error_history" jsonb,
	"user_id" varchar,
	"transaction_id" varchar,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_number_rentals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"credits_charged" integer NOT NULL,
	"billing_date" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'success' NOT NULL,
	"transaction_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_numbers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"phone_number" text NOT NULL,
	"twilio_sid" text,
	"eleven_labs_phone_number_id" text,
	"eleven_labs_credential_id" varchar,
	"friendly_name" text,
	"country" text DEFAULT 'IN' NOT NULL,
	"capabilities" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"is_system_pool" boolean DEFAULT false NOT NULL,
	"purchase_price" numeric(10, 2),
	"monthly_price" numeric(10, 2),
	"monthly_credits" integer,
	"next_billing_date" timestamp,
	"purchased_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"phone_number_provider" text DEFAULT 'vobiz' NOT NULL,
	"livekit_phone_number_id" text,
	"livekit_credential_id" varchar,
	"sip_trunk_id" text,
	"inbound_trunk_id" text,
	"agent_id" varchar,
	"dispatch_rule_id" text,
	"label" text,
	"vobiz_number_id" text,
	"vobiz_trunk_id" text,
	"assigned_incoming_agent_id" varchar,
	CONSTRAINT "phone_numbers_phone_number_unique" UNIQUE("phone_number"),
	CONSTRAINT "phone_numbers_twilio_sid_unique" UNIQUE("twilio_sid"),
	CONSTRAINT "phone_numbers_livekit_phone_number_id_unique" UNIQUE("livekit_phone_number_id")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text NOT NULL,
	"monthly_price" numeric(10, 2) NOT NULL,
	"yearly_price" numeric(10, 2),
	"razorpay_monthly_price" numeric(10, 2),
	"razorpay_yearly_price" numeric(10, 2),
	"stripe_monthly_price_id" text,
	"stripe_yearly_price_id" text,
	"stripe_product_id" text,
	"razorpay_plan_id" text,
	"razorpay_yearly_plan_id" text,
	"paypal_monthly_price" numeric(10, 2),
	"paypal_yearly_price" numeric(10, 2),
	"paypal_product_id" text,
	"paypal_monthly_plan_id" text,
	"paypal_yearly_plan_id" text,
	"paystack_monthly_price" numeric(10, 2),
	"paystack_yearly_price" numeric(10, 2),
	"paystack_monthly_plan_code" text,
	"paystack_yearly_plan_code" text,
	"mercadopago_monthly_price" numeric(10, 2),
	"mercadopago_yearly_price" numeric(10, 2),
	"mercadopago_monthly_plan_id" text,
	"mercadopago_yearly_plan_id" text,
	"max_agents" integer DEFAULT 1 NOT NULL,
	"max_campaigns" integer DEFAULT 1 NOT NULL,
	"max_contacts_per_campaign" integer DEFAULT 5 NOT NULL,
	"max_webhooks" integer DEFAULT 3 NOT NULL,
	"max_knowledge_bases" integer DEFAULT 5 NOT NULL,
	"max_flows" integer DEFAULT 3 NOT NULL,
	"max_phone_numbers" integer DEFAULT 1 NOT NULL,
	"max_widgets" integer DEFAULT 1 NOT NULL,
	"included_credits" integer DEFAULT 0 NOT NULL,
	"default_llm_model" text,
	"can_choose_llm" boolean DEFAULT false NOT NULL,
	"can_purchase_numbers" boolean DEFAULT false NOT NULL,
	"use_system_pool" boolean DEFAULT true NOT NULL,
	"features" jsonb,
	"sip_enabled" boolean DEFAULT false NOT NULL,
	"max_concurrent_sip_calls" integer DEFAULT 1 NOT NULL,
	"sip_engines_allowed" text[] DEFAULT ARRAY['elevenlabs-sip']::text[],
	"rest_api_enabled" boolean DEFAULT false NOT NULL,
	"team_management_enabled" boolean DEFAULT false NOT NULL,
	"max_team_members" integer DEFAULT 0 NOT NULL,
	"max_custom_roles" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "plivo_calls" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"campaign_id" varchar,
	"contact_id" varchar,
	"agent_id" varchar,
	"plivo_phone_number_id" varchar,
	"openai_credential_id" varchar,
	"plivo_call_uuid" text,
	"from_number" text NOT NULL,
	"to_number" text NOT NULL,
	"openai_session_id" text,
	"openai_voice" text DEFAULT 'alloy',
	"openai_model" text DEFAULT 'gpt-4o-mini-realtime-preview',
	"status" text DEFAULT 'pending' NOT NULL,
	"call_direction" text DEFAULT 'outbound' NOT NULL,
	"duration" integer,
	"recording_id" text,
	"recording_url" text,
	"recording_duration" integer,
	"transcript" text,
	"ai_summary" text,
	"lead_quality_score" integer,
	"sentiment" text,
	"classification" text,
	"key_points" jsonb,
	"next_actions" jsonb,
	"was_transferred" boolean DEFAULT false,
	"transferred_to" text,
	"transferred_at" timestamp,
	"started_at" timestamp,
	"answered_at" timestamp,
	"ended_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plivo_calls_plivo_call_uuid_unique" UNIQUE("plivo_call_uuid")
);
--> statement-breakpoint
CREATE TABLE "plivo_credentials" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"auth_id" text NOT NULL,
	"auth_token" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plivo_phone_numbers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"plivo_credential_id" varchar,
	"openai_credential_id" varchar,
	"phone_number" text NOT NULL,
	"plivo_number_id" text NOT NULL,
	"friendly_name" text,
	"country" text NOT NULL,
	"region" text,
	"number_type" text DEFAULT 'local',
	"capabilities" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"purchase_credits" integer DEFAULT 0 NOT NULL,
	"monthly_credits" integer DEFAULT 0 NOT NULL,
	"next_billing_date" timestamp,
	"assigned_agent_id" varchar,
	"purchased_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plivo_phone_numbers_phone_number_unique" UNIQUE("phone_number"),
	CONSTRAINT "plivo_phone_numbers_plivo_number_id_unique" UNIQUE("plivo_number_id")
);
--> statement-breakpoint
CREATE TABLE "plivo_phone_pricing" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" text NOT NULL,
	"country_name" text NOT NULL,
	"purchase_credits" integer DEFAULT 100 NOT NULL,
	"monthly_credits" integer DEFAULT 50 NOT NULL,
	"kyc_required" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plivo_phone_pricing_country_code_unique" UNIQUE("country_code")
);
--> statement-breakpoint
CREATE TABLE "prompt_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'general' NOT NULL,
	"system_prompt" text NOT NULL,
	"first_message" text,
	"variables" text[],
	"suggested_voice_tone" text,
	"suggested_personality" text,
	"is_system_template" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_set_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_set_id" varchar NOT NULL,
	"question" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"order" integer NOT NULL,
	"time_limit_seconds" integer,
	"is_required" boolean DEFAULT true NOT NULL,
	"scoring_rubric" text,
	"max_score" integer DEFAULT 10 NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	"follow_up_guidance" text,
	"expected_keywords" text[],
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_sets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"source_job_description_id" varchar,
	"question_count" integer DEFAULT 0 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ranking_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_set_id" varchar NOT NULL,
	"job_description_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_candidates" integer DEFAULT 0 NOT NULL,
	"processed_candidates" integer DEFAULT 0 NOT NULL,
	"failed_candidates" integer DEFAULT 0 NOT NULL,
	"parameters" jsonb,
	"errors" jsonb,
	"average_score" double precision,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"is_valid" boolean DEFAULT true NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"gateway" text NOT NULL,
	"gateway_refund_id" text,
	"reason" text NOT NULL,
	"initiated_by" text NOT NULL,
	"admin_id" varchar,
	"status" text DEFAULT 'pending' NOT NULL,
	"credits_reversed" integer,
	"user_suspended" boolean DEFAULT false NOT NULL,
	"admin_note" text,
	"customer_note" text,
	"metadata" jsonb,
	"refund_note_number" text,
	"pdf_url" text,
	"pdf_generated_at" timestamp,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"default_title" text DEFAULT 'Wtrops.ai - AI Calling Platform',
	"default_description" text DEFAULT 'Enterprise AI-powered bulk calling platform with voice agents, Twilio integration, and intelligent lead classification.',
	"default_keywords" text[] DEFAULT ARRAY[]::text[],
	"default_og_image" text DEFAULT '/og-image.png',
	"sitemap_enabled" boolean DEFAULT true,
	"sitemap_urls" jsonb DEFAULT '[]'::jsonb,
	"sitemap_auto_generate" boolean DEFAULT true,
	"robots_enabled" boolean DEFAULT true,
	"robots_rules" jsonb DEFAULT '[{"userAgent":"*","allow":["/","/pricing","/features","/blog","/contact"],"disallow":["/app/","/admin/","/api/"]}]'::jsonb,
	"robots_crawl_delay" integer DEFAULT 0,
	"structured_data_enabled" boolean DEFAULT true,
	"structured_data" jsonb DEFAULT '{"organizationName":"Wtrops.ai","organizationUrl":"","organizationLogo":"/logo.png","organizationDescription":"AI-powered voice agents for automated calling","socialProfiles":[],"contactEmail":"","contactPhone":""}'::jsonb,
	"structured_data_faq" jsonb DEFAULT '[]'::jsonb,
	"structured_data_faq_enabled" boolean DEFAULT false,
	"structured_data_product" jsonb DEFAULT 'null'::jsonb,
	"structured_data_product_enabled" boolean DEFAULT false,
	"twitter_handle" text,
	"facebook_app_id" text,
	"canonical_base_url" text,
	"google_verification" text,
	"bing_verification" text,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sip_caller_ids" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number" text NOT NULL,
	"label" text,
	"livekit_credential_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sip_calls" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sip_phone_number_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"agent_id" varchar,
	"campaign_id" varchar,
	"contact_id" varchar,
	"direction" text NOT NULL,
	"engine" text NOT NULL,
	"to_number" text,
	"from_number" text,
	"external_call_id" text,
	"status" text DEFAULT 'initiated' NOT NULL,
	"duration_seconds" integer,
	"transcript_json" jsonb,
	"conversation_data" jsonb,
	"started_at" timestamp,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sip_phone_numbers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sip_trunk_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"phone_number" text NOT NULL,
	"label" text,
	"engine" text NOT NULL,
	"agent_id" varchar,
	"inbound_enabled" boolean DEFAULT true NOT NULL,
	"outbound_enabled" boolean DEFAULT true NOT NULL,
	"external_elevenlabs_phone_id" text,
	"external_fonoster_phone_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sip_trunks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"engine" text NOT NULL,
	"provider" text DEFAULT 'generic' NOT NULL,
	"sip_host" text NOT NULL,
	"sip_port" integer DEFAULT 5060 NOT NULL,
	"transport" text DEFAULT 'tls' NOT NULL,
	"media_encryption" text DEFAULT 'require' NOT NULL,
	"inbound_transport" text DEFAULT 'tcp',
	"inbound_port" integer DEFAULT 5060,
	"codecs_allowed" text[] DEFAULT ARRAY['PCMU', 'PCMA']::text[],
	"username" text,
	"password" text,
	"realm" text,
	"registrar_host" text,
	"external_elevenlabs_id" text,
	"external_fonoster_trunk_id" text,
	"fonoster_credential_id" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"health_status" text DEFAULT 'unknown' NOT NULL,
	"last_health_check" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supported_languages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"providers" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "supported_languages_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "synced_voices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credential_id" varchar NOT NULL,
	"voice_id" text NOT NULL,
	"public_owner_id" text NOT NULL,
	"voice_name" text,
	"status" text DEFAULT 'synced' NOT NULL,
	"error_message" text,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "synced_voices_credential_id_voice_id_unique" UNIQUE("credential_id","voice_id")
);
--> statement-breakpoint
CREATE TABLE "tools" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"config" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "twilio_countries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(2) NOT NULL,
	"name" text NOT NULL,
	"dial_code" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	CONSTRAINT "twilio_countries_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "twilio_openai_calls" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"campaign_id" varchar,
	"contact_id" varchar,
	"agent_id" varchar,
	"twilio_phone_number_id" varchar,
	"openai_credential_id" varchar,
	"twilio_call_sid" text,
	"from_number" text NOT NULL,
	"to_number" text NOT NULL,
	"openai_session_id" text,
	"openai_voice" text DEFAULT 'alloy',
	"openai_model" text DEFAULT 'gpt-4o-realtime-preview',
	"status" text DEFAULT 'pending' NOT NULL,
	"call_direction" text DEFAULT 'outbound' NOT NULL,
	"duration" integer,
	"recording_url" text,
	"recording_duration" integer,
	"transcript" text,
	"ai_summary" text,
	"lead_quality_score" integer,
	"sentiment" text,
	"classification" text,
	"key_points" jsonb,
	"next_actions" jsonb,
	"was_transferred" boolean DEFAULT false,
	"transferred_to" text,
	"transferred_at" timestamp,
	"started_at" timestamp,
	"answered_at" timestamp,
	"ended_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "twilio_openai_calls_twilio_call_sid_unique" UNIQUE("twilio_call_sid")
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"subscription_id" varchar,
	"call_id" varchar,
	"type" text NOT NULL,
	"minutes_used" integer DEFAULT 0 NOT NULL,
	"cost" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"billing_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_knowledge_storage_limits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"max_storage_bytes" integer DEFAULT 20971520 NOT NULL,
	"used_storage_bytes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_knowledge_storage_limits_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_kyc_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"document_type" text NOT NULL,
	"file_name" text NOT NULL,
	"file_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"plan_id" varchar NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp DEFAULT now() NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"stripe_subscription_id" text,
	"razorpay_subscription_id" text,
	"paypal_subscription_id" text,
	"paystack_subscription_code" text,
	"paystack_customer_code" text,
	"paystack_email_token" text,
	"mercadopago_subscription_id" text,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"billing_period" text DEFAULT 'monthly' NOT NULL,
	"override_max_agents" integer,
	"override_max_campaigns" integer,
	"override_max_contacts_per_campaign" integer,
	"override_max_webhooks" integer,
	"override_max_knowledge_bases" integer,
	"override_max_flows" integer,
	"override_max_phone_numbers" integer,
	"override_max_widgets" integer,
	"override_included_credits" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id"),
	CONSTRAINT "user_subscriptions_razorpay_subscription_id_unique" UNIQUE("razorpay_subscription_id"),
	CONSTRAINT "user_subscriptions_paypal_subscription_id_unique" UNIQUE("paypal_subscription_id"),
	CONSTRAINT "user_subscriptions_paystack_subscription_code_unique" UNIQUE("paystack_subscription_code"),
	CONSTRAINT "user_subscriptions_mercadopago_subscription_id_unique" UNIQUE("mercadopago_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"plan_type" text DEFAULT 'free' NOT NULL,
	"plan_expires_at" timestamp,
	"credits" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"max_webhooks" integer DEFAULT 3 NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" varchar,
	"timezone" text,
	"cookie_consent" boolean,
	"analytics_consent" boolean,
	"marketing_consent" boolean,
	"consent_timestamp" timestamp,
	"terms_accepted_at" timestamp,
	"privacy_accepted_at" timestamp,
	"blocked_reason" text,
	"blocked_at" timestamp,
	"blocked_by" varchar,
	"eleven_labs_credential_id" varchar,
	"kyc_status" text DEFAULT 'pending',
	"kyc_submitted_at" timestamp,
	"kyc_approved_at" timestamp,
	"kyc_rejection_reason" text,
	"billing_name" text,
	"billing_address_line1" text,
	"billing_address_line2" text,
	"billing_city" text,
	"billing_state" text,
	"billing_postal_code" text,
	"billing_country" text,
	"company" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "voices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"eleven_labs_voice_id" text,
	"gender" text,
	"accent" text,
	"tone" text,
	"is_custom" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"webhook_id" varchar,
	"event" varchar(100) NOT NULL,
	"payload" jsonb NOT NULL,
	"success" boolean NOT NULL,
	"status_code" integer,
	"response_body" text,
	"response_time" integer,
	"error" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"max_attempts" integer DEFAULT 3,
	"next_retry_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_subscriptions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"url" text NOT NULL,
	"method" varchar(10) DEFAULT 'POST' NOT NULL,
	"headers" jsonb,
	"secret" varchar(64) NOT NULL,
	"auth_type" varchar(50),
	"auth_credentials" jsonb,
	"events" jsonb NOT NULL,
	"campaign_ids" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_widgets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"agent_id" varchar,
	"agent_type" text DEFAULT 'natural' NOT NULL,
	"icon_url" text,
	"icon_path" text,
	"brand_name" text,
	"button_label" text DEFAULT 'VOICE CHAT' NOT NULL,
	"primary_color" text DEFAULT '#3B82F6' NOT NULL,
	"accent_color" text DEFAULT '#1E40AF' NOT NULL,
	"background_color" text DEFAULT '#FFFFFF' NOT NULL,
	"text_color" text DEFAULT '#1F2937' NOT NULL,
	"require_terms_acceptance" boolean DEFAULT false NOT NULL,
	"welcome_message" text DEFAULT 'Hi! Click to start a voice conversation.' NOT NULL,
	"launcher_text" text DEFAULT 'Talk to us' NOT NULL,
	"offline_message" text DEFAULT 'We''re currently unavailable. Please try again later.' NOT NULL,
	"low_credits_message" text DEFAULT 'Service temporarily unavailable.' NOT NULL,
	"allowed_domains" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"business_hours_enabled" boolean DEFAULT false NOT NULL,
	"business_hours_start" text DEFAULT '09:00',
	"business_hours_end" text DEFAULT '17:00',
	"business_days" text[] DEFAULT ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday']::text[],
	"business_timezone" text DEFAULT 'America/New_York',
	"max_concurrent_calls" integer DEFAULT 5 NOT NULL,
	"max_call_duration" integer DEFAULT 300 NOT NULL,
	"embed_token" text NOT NULL,
	"avatar_enabled" boolean DEFAULT false NOT NULL,
	"avatar_id" varchar,
	"text_chat_enabled" boolean DEFAULT true NOT NULL,
	"total_calls" integer DEFAULT 0 NOT NULL,
	"total_minutes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "website_widgets_embed_token_unique" UNIQUE("embed_token")
);
--> statement-breakpoint
CREATE TABLE "widget_call_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"widget_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"session_token" text NOT NULL,
	"visitor_ip" text,
	"visitor_domain" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"duration" integer,
	"credits_used" integer DEFAULT 0,
	"recording_url" text,
	"transcript" text,
	"ai_summary" text,
	"sentiment" text,
	"openai_session_id" text,
	"openai_credential_id" varchar,
	"started_at" timestamp,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "widget_call_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_eleven_labs_credential_id_eleven_labs_credentials_id_fk" FOREIGN KEY ("eleven_labs_credential_id") REFERENCES "public"."eleven_labs_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_livekit_credential_id_livekit_credentials_id_fk" FOREIGN KEY ("livekit_credential_id") REFERENCES "public"."livekit_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_scripts" ADD CONSTRAINT "analytics_scripts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_audit_logs" ADD CONSTRAINT "api_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_audit_logs" ADD CONSTRAINT "api_audit_logs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_rate_limits" ADD CONSTRAINT "api_rate_limits_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_candidates" ADD CONSTRAINT "automation_candidates_automation_id_interview_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."interview_automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_candidates" ADD CONSTRAINT "automation_candidates_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_responses" ADD CONSTRAINT "automation_responses_automation_candidate_id_automation_candidates_id_fk" FOREIGN KEY ("automation_candidate_id") REFERENCES "public"."automation_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_responses" ADD CONSTRAINT "automation_responses_question_set_item_id_question_set_items_id_fk" FOREIGN KEY ("question_set_item_id") REFERENCES "public"."question_set_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avatars" ADD CONSTRAINT "avatars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banned_words" ADD CONSTRAINT "banned_words_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_incoming_connection_id_incoming_connections_id_fk" FOREIGN KEY ("incoming_connection_id") REFERENCES "public"."incoming_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_incoming_agent_id_incoming_agents_id_fk" FOREIGN KEY ("incoming_agent_id") REFERENCES "public"."incoming_agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_livekit_credential_id_livekit_credentials_id_fk" FOREIGN KEY ("livekit_credential_id") REFERENCES "public"."livekit_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_phone_number_id_phone_numbers_id_fk" FOREIGN KEY ("phone_number_id") REFERENCES "public"."phone_numbers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_rankings" ADD CONSTRAINT "candidate_rankings_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_rankings" ADD CONSTRAINT "candidate_rankings_job_description_id_job_descriptions_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_sets" ADD CONSTRAINT "candidate_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_sets" ADD CONSTRAINT "candidate_sets_last_ranked_jd_id_job_descriptions_id_fk" FOREIGN KEY ("last_ranked_jd_id") REFERENCES "public"."job_descriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_candidate_set_id_candidate_sets_id_fk" FOREIGN KEY ("candidate_set_id") REFERENCES "public"."candidate_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_violations" ADD CONSTRAINT "content_violations_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_violations" ADD CONSTRAINT "content_violations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_violations" ADD CONSTRAINT "content_violations_banned_word_id_banned_words_id_fk" FOREIGN KEY ("banned_word_id") REFERENCES "public"."banned_words"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_violations" ADD CONSTRAINT "content_violations_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_category_preferences" ADD CONSTRAINT "crm_category_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_openai_credential_id_openai_credentials_id_fk" FOREIGN KEY ("openai_credential_id") REFERENCES "public"."openai_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_configs" ADD CONSTRAINT "email_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_notification_settings" ADD CONSTRAINT "email_notification_settings_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_notification_settings" ADD CONSTRAINT "email_notification_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_executions" ADD CONSTRAINT "flow_executions_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_flow_execution_id_flow_executions_id_fk" FOREIGN KEY ("flow_execution_id") REFERENCES "public"."flow_executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_settings" ADD CONSTRAINT "global_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_agents" ADD CONSTRAINT "incoming_agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_agents" ADD CONSTRAINT "incoming_agents_eleven_labs_credential_id_eleven_labs_credentials_id_fk" FOREIGN KEY ("eleven_labs_credential_id") REFERENCES "public"."eleven_labs_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_connections" ADD CONSTRAINT "incoming_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_connections" ADD CONSTRAINT "incoming_connections_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_connections" ADD CONSTRAINT "incoming_connections_phone_number_id_phone_numbers_id_fk" FOREIGN KEY ("phone_number_id") REFERENCES "public"."phone_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_automations" ADD CONSTRAINT "interview_automations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_automations" ADD CONSTRAINT "interview_automations_job_description_id_job_descriptions_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_automations" ADD CONSTRAINT "interview_automations_question_set_id_question_sets_id_fk" FOREIGN KEY ("question_set_id") REFERENCES "public"."question_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_automations" ADD CONSTRAINT "interview_automations_candidate_set_id_candidate_sets_id_fk" FOREIGN KEY ("candidate_set_id") REFERENCES "public"."candidate_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_automations" ADD CONSTRAINT "interview_automations_email_config_id_email_configs_id_fk" FOREIGN KEY ("email_config_id") REFERENCES "public"."email_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_automations" ADD CONSTRAINT "interview_automations_avatar_id_avatars_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."avatars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_candidates" ADD CONSTRAINT "interview_candidates_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_responses" ADD CONSTRAINT "interview_responses_candidate_id_interview_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."interview_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_responses" ADD CONSTRAINT "interview_responses_question_id_interview_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."interview_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_avatar_id_avatars_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."avatars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_transaction_id_payment_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_descriptions" ADD CONSTRAINT "job_descriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base" ADD CONSTRAINT "knowledge_base_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_knowledge_base_id_knowledge_base_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_processing_queue" ADD CONSTRAINT "knowledge_processing_queue_knowledge_base_id_knowledge_base_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_processing_queue" ADD CONSTRAINT "knowledge_processing_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_stages" ADD CONSTRAINT "lead_stages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_incoming_connection_id_incoming_connections_id_fk" FOREIGN KEY ("incoming_connection_id") REFERENCES "public"."incoming_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_stage_id_lead_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."lead_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_plivo_call_id_plivo_calls_id_fk" FOREIGN KEY ("plivo_call_id") REFERENCES "public"."plivo_calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_twilio_openai_call_id_twilio_openai_calls_id_fk" FOREIGN KEY ("twilio_openai_call_id") REFERENCES "public"."twilio_openai_calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "livekit_credentials" ADD CONSTRAINT "livekit_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_credit_package_id_credit_packages_id_fk" FOREIGN KEY ("credit_package_id") REFERENCES "public"."credit_packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_subscription_id_user_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."user_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_webhook_queue" ADD CONSTRAINT "payment_webhook_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_webhook_queue" ADD CONSTRAINT "payment_webhook_queue_transaction_id_payment_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_number_rentals" ADD CONSTRAINT "phone_number_rentals_phone_number_id_phone_numbers_id_fk" FOREIGN KEY ("phone_number_id") REFERENCES "public"."phone_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_number_rentals" ADD CONSTRAINT "phone_number_rentals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_number_rentals" ADD CONSTRAINT "phone_number_rentals_transaction_id_credit_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."credit_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_eleven_labs_credential_id_eleven_labs_credentials_id_fk" FOREIGN KEY ("eleven_labs_credential_id") REFERENCES "public"."eleven_labs_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_livekit_credential_id_livekit_credentials_id_fk" FOREIGN KEY ("livekit_credential_id") REFERENCES "public"."livekit_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_assigned_incoming_agent_id_incoming_agents_id_fk" FOREIGN KEY ("assigned_incoming_agent_id") REFERENCES "public"."incoming_agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plivo_calls" ADD CONSTRAINT "plivo_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plivo_calls" ADD CONSTRAINT "plivo_calls_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plivo_calls" ADD CONSTRAINT "plivo_calls_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plivo_calls" ADD CONSTRAINT "plivo_calls_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plivo_calls" ADD CONSTRAINT "plivo_calls_plivo_phone_number_id_plivo_phone_numbers_id_fk" FOREIGN KEY ("plivo_phone_number_id") REFERENCES "public"."plivo_phone_numbers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plivo_calls" ADD CONSTRAINT "plivo_calls_openai_credential_id_openai_credentials_id_fk" FOREIGN KEY ("openai_credential_id") REFERENCES "public"."openai_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plivo_phone_numbers" ADD CONSTRAINT "plivo_phone_numbers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plivo_phone_numbers" ADD CONSTRAINT "plivo_phone_numbers_plivo_credential_id_plivo_credentials_id_fk" FOREIGN KEY ("plivo_credential_id") REFERENCES "public"."plivo_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plivo_phone_numbers" ADD CONSTRAINT "plivo_phone_numbers_openai_credential_id_openai_credentials_id_fk" FOREIGN KEY ("openai_credential_id") REFERENCES "public"."openai_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plivo_phone_numbers" ADD CONSTRAINT "plivo_phone_numbers_assigned_agent_id_agents_id_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_set_items" ADD CONSTRAINT "question_set_items_question_set_id_question_sets_id_fk" FOREIGN KEY ("question_set_id") REFERENCES "public"."question_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_sets" ADD CONSTRAINT "question_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_sets" ADD CONSTRAINT "question_sets_source_job_description_id_job_descriptions_id_fk" FOREIGN KEY ("source_job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_jobs" ADD CONSTRAINT "ranking_jobs_candidate_set_id_candidate_sets_id_fk" FOREIGN KEY ("candidate_set_id") REFERENCES "public"."candidate_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_jobs" ADD CONSTRAINT "ranking_jobs_job_description_id_job_descriptions_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_jobs" ADD CONSTRAINT "ranking_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_transaction_id_payment_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_settings" ADD CONSTRAINT "seo_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sip_caller_ids" ADD CONSTRAINT "sip_caller_ids_livekit_credential_id_livekit_credentials_id_fk" FOREIGN KEY ("livekit_credential_id") REFERENCES "public"."livekit_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sip_calls" ADD CONSTRAINT "sip_calls_sip_phone_number_id_sip_phone_numbers_id_fk" FOREIGN KEY ("sip_phone_number_id") REFERENCES "public"."sip_phone_numbers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sip_calls" ADD CONSTRAINT "sip_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sip_calls" ADD CONSTRAINT "sip_calls_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sip_calls" ADD CONSTRAINT "sip_calls_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sip_calls" ADD CONSTRAINT "sip_calls_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sip_phone_numbers" ADD CONSTRAINT "sip_phone_numbers_sip_trunk_id_sip_trunks_id_fk" FOREIGN KEY ("sip_trunk_id") REFERENCES "public"."sip_trunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sip_phone_numbers" ADD CONSTRAINT "sip_phone_numbers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sip_phone_numbers" ADD CONSTRAINT "sip_phone_numbers_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sip_trunks" ADD CONSTRAINT "sip_trunks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sip_trunks" ADD CONSTRAINT "sip_trunks_fonoster_credential_id_fonoster_credentials_id_fk" FOREIGN KEY ("fonoster_credential_id") REFERENCES "public"."fonoster_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synced_voices" ADD CONSTRAINT "synced_voices_credential_id_eleven_labs_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."eleven_labs_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twilio_openai_calls" ADD CONSTRAINT "twilio_openai_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twilio_openai_calls" ADD CONSTRAINT "twilio_openai_calls_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twilio_openai_calls" ADD CONSTRAINT "twilio_openai_calls_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twilio_openai_calls" ADD CONSTRAINT "twilio_openai_calls_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twilio_openai_calls" ADD CONSTRAINT "twilio_openai_calls_twilio_phone_number_id_phone_numbers_id_fk" FOREIGN KEY ("twilio_phone_number_id") REFERENCES "public"."phone_numbers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twilio_openai_calls" ADD CONSTRAINT "twilio_openai_calls_openai_credential_id_openai_credentials_id_fk" FOREIGN KEY ("openai_credential_id") REFERENCES "public"."openai_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_subscription_id_user_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."user_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_knowledge_storage_limits" ADD CONSTRAINT "user_knowledge_storage_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_kyc_documents" ADD CONSTRAINT "user_kyc_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voices" ADD CONSTRAINT "voices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_webhook_id_webhook_subscriptions_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhook_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_widgets" ADD CONSTRAINT "website_widgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_widgets" ADD CONSTRAINT "website_widgets_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_widgets" ADD CONSTRAINT "website_widgets_avatar_id_avatars_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."avatars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_call_sessions" ADD CONSTRAINT "widget_call_sessions_widget_id_website_widgets_id_fk" FOREIGN KEY ("widget_id") REFERENCES "public"."website_widgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_call_sessions" ADD CONSTRAINT "widget_call_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;