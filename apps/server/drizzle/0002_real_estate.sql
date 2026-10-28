CREATE TABLE "properties" (
	"id" text PRIMARY KEY NOT NULL,
	"district_id" text NOT NULL,
	"spot_id" text NOT NULL,
	"kind" text NOT NULL,
	"owner_character_id" uuid,
	"tenant_character_id" uuid,
	"lease_started_at" timestamp with time zone,
	"rent_periods_paid" integer DEFAULT 0 NOT NULL,
	"business_type" text,
	"business_name" text,
	"business_opened_at" timestamp with time zone,
	"payout_periods_paid" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "properties_owner_xor_tenant" CHECK ("properties"."owner_character_id" is null or "properties"."tenant_character_id" is null)
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "home_property_id" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "moved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_owner_character_id_characters_id_fk" FOREIGN KEY ("owner_character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_tenant_character_id_characters_id_fk" FOREIGN KEY ("tenant_character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "properties_owner_idx" ON "properties" USING btree ("owner_character_id");--> statement-breakpoint
CREATE INDEX "properties_tenant_idx" ON "properties" USING btree ("tenant_character_id");