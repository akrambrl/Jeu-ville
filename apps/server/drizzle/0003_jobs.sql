CREATE TABLE "job_xp" (
	"character_id" uuid NOT NULL,
	"job_type" text NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"employer_id" text NOT NULL,
	"job_type" text NOT NULL,
	"hired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_xp" ADD CONSTRAINT "job_xp_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_xp_character_type_idx" ON "job_xp" USING btree ("character_id","job_type");