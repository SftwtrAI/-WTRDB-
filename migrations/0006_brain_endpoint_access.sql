CREATE TABLE IF NOT EXISTS "brain_endpoint_access" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brain_endpoint_id" varchar NOT NULL,
  "user_id" varchar NOT NULL,
  "granted_by" varchar NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "brain_endpoint_access"
    ADD CONSTRAINT "brain_endpoint_access_brain_endpoint_id_fk"
    FOREIGN KEY ("brain_endpoint_id") REFERENCES "brain_endpoints"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_brain_endpoint_access_unique"
  ON "brain_endpoint_access" ("brain_endpoint_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_brain_endpoint_access_user"
  ON "brain_endpoint_access" ("user_id");
