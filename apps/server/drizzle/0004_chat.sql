CREATE TABLE "chat_blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reported_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"message_text" text NOT NULL,
	"message_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_blocks" ADD CONSTRAINT "chat_blocks_blocker_id_characters_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_blocks" ADD CONSTRAINT "chat_blocks_blocked_id_characters_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_reporter_id_characters_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_reported_id_characters_id_fk" FOREIGN KEY ("reported_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_blocks_pair_idx" ON "chat_blocks" USING btree ("blocker_id","blocked_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_reports_reporter_message_idx" ON "chat_reports" USING btree ("reporter_id","message_id");--> statement-breakpoint
CREATE INDEX "chat_reports_status_idx" ON "chat_reports" USING btree ("status");