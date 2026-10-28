CREATE TABLE "errands_done" (
	"character_id" uuid NOT NULL,
	"offer_id" text NOT NULL,
	"district_id" text NOT NULL,
	"day" text NOT NULL,
	"type" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "kindness" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "kindness_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "errands_done" ADD CONSTRAINT "errands_done_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "errands_done_offer_idx" ON "errands_done" USING btree ("character_id","district_id","offer_id");--> statement-breakpoint
CREATE INDEX "errands_done_day_idx" ON "errands_done" USING btree ("character_id","day");