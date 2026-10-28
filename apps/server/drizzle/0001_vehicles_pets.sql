CREATE TABLE "pets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"species" text NOT NULL,
	"coat" smallint NOT NULL,
	"name" text NOT NULL,
	"hunger" real NOT NULL,
	"happiness" real NOT NULL,
	"gauges_updated_at" timestamp with time zone NOT NULL,
	"adopted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pets_character_id_unique" UNIQUE("character_id")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"battery" real DEFAULT 100 NOT NULL,
	"bought_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "active_vehicle" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "pet_lost_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_character_kind_idx" ON "vehicles" USING btree ("character_id","kind");