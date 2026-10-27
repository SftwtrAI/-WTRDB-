ALTER TABLE "interview_automations" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "interview_automations" ADD COLUMN "share_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_automations" ADD CONSTRAINT "interview_automations_share_token_unique" UNIQUE("share_token");