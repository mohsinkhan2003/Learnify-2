-- Production foundation (hand-reviewed).
-- Non-destructive: adds tables/columns/indexes and converts types losslessly.
-- Existing timestamps were written as UTC wall-clock values, so they are converted with AT TIME ZONE 'UTC'.
-- notification_sent: text 'true'/'false' -> boolean.
CREATE TABLE IF NOT EXISTS "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"assignment_id" uuid,
	"kind" varchar(20) NOT NULL,
	"model" varchar(64) NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"audio_seconds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assignment_students" (
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_students_assignment_id_student_id_pk" PRIMARY KEY("assignment_id","student_id")
);
--> statement-breakpoint
ALTER TABLE "assignments" ALTER COLUMN "notification_time" SET DATA TYPE timestamp with time zone USING "notification_time" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "assignments" ALTER COLUMN "notification_sent" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "assignments" ALTER COLUMN "notification_sent" SET DATA TYPE boolean USING ("notification_sent"::text = 'true');--> statement-breakpoint
ALTER TABLE "assignments" ALTER COLUMN "notification_sent" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "assignments" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "assignments" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone USING "timestamp" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER COLUMN "timestamp" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "push_subscriptions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "push_subscriptions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "student_progress" ALTER COLUMN "started_at" SET DATA TYPE timestamp with time zone USING "started_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "student_progress" ALTER COLUMN "completed_at" SET DATA TYPE timestamp with time zone USING "completed_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "student_progress" ALTER COLUMN "last_active_at" SET DATA TYPE timestamp with time zone USING "last_active_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "student_progress" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "student_progress" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_push_subscriptions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "user_push_subscriptions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "audience" varchar(20) DEFAULT 'school' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "stage" varchar(32);--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "source" varchar(10);--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "assessment" varchar(24);--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "misconception" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "client_message_id" uuid;--> statement-breakpoint
ALTER TABLE "student_progress" ADD COLUMN IF NOT EXISTS "tutor_stage" varchar(32) DEFAULT 'NOT_STARTED' NOT NULL;--> statement-breakpoint
ALTER TABLE "student_progress" ADD COLUMN IF NOT EXISTS "stage_turns" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "student_progress" ADD COLUMN IF NOT EXISTS "practice_completed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "student_progress" ADD COLUMN IF NOT EXISTS "hint_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "student_progress" ADD COLUMN IF NOT EXISTS "correct_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "student_progress" ADD COLUMN IF NOT EXISTS "incorrect_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "student_progress" ADD COLUMN IF NOT EXISTS "flagged_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "student_progress" ADD COLUMN IF NOT EXISTS "summary" text;--> statement-breakpoint
ALTER TABLE "student_progress" ADD COLUMN IF NOT EXISTS "turn_locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "student_progress" ADD COLUMN IF NOT EXISTS "last_heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_students" ADD CONSTRAINT "assignment_students_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_students" ADD CONSTRAINT "assignment_students_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_user_created_idx" ON "ai_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_students_student_idx" ON "assignment_students" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignments_teacher_created_idx" ON "assignments" USING btree ("teacher_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignments_school_release_idx" ON "assignments" USING btree ("teacher_school","notification_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignments_pending_notification_idx" ON "assignments" USING btree ("notification_time") WHERE "assignments"."notification_sent" = false;--> statement-breakpoint
DROP INDEX IF EXISTS "chat_messages_assignment_user_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_assignment_user_idx" ON "chat_messages" USING btree ("assignment_id","user_id","timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chat_messages_client_message_idx" ON "chat_messages" USING btree ("user_id","client_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_progress_student_idx" ON "student_progress" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_user_subscription_idx" ON "user_push_subscriptions" USING btree ("user_id","subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_push_subscriptions_subscription_idx" ON "user_push_subscriptions" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_school_role_idx" ON "users" USING btree ("school","role");--> statement-breakpoint
-- Backfill the new tutor state machine from the demo's coarse status (non-destructive).
UPDATE "student_progress" SET "tutor_stage" = CASE "status"
  WHEN 'completed' THEN 'COMPLETED'
  WHEN 'summary_provided' THEN 'READY_TO_COMPLETE'
  WHEN 'in_progress' THEN 'KNOWLEDGE_CHECK'
  ELSE 'NOT_STARTED' END
WHERE "tutor_stage" = 'NOT_STARTED';
