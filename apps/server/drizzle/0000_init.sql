CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sex" text NOT NULL,
	"base_look" smallint NOT NULL,
	"skin_tone" smallint NOT NULL,
	"hair_color" smallint NOT NULL,
	"body_type" smallint NOT NULL,
	"city_id" text NOT NULL,
	"district_id" text NOT NULL,
	"dwelling_id" text,
	"money_cents" bigint NOT NULL,
	"hunger" real NOT NULL,
	"hygiene" real NOT NULL,
	"appearance" real NOT NULL,
	"health" real NOT NULL,
	"gauges_updated_at" timestamp with time zone NOT NULL,
	"pos_x" real NOT NULL,
	"pos_y" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "characters_player_id_unique" UNIQUE("player_id"),
	CONSTRAINT "characters_money_non_negative" CHECK ("characters"."money_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unlocked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"id" text PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dwellings" (
	"id" text PRIMARY KEY NOT NULL,
	"district_id" text NOT NULL,
	"building_id" text NOT NULL,
	"building_name" text NOT NULL,
	"kind" text NOT NULL,
	"weekly_rent_cents" bigint NOT NULL,
	"tenant_character_id" uuid,
	CONSTRAINT "dwellings_tenant_character_id_unique" UNIQUE("tenant_character_id")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"balance_after_cents" bigint NOT NULL,
	"reason" text NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pseudo" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_dwelling_id_dwellings_id_fk" FOREIGN KEY ("dwelling_id") REFERENCES "public"."dwellings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dwellings" ADD CONSTRAINT "dwellings_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dwellings_district_kind_idx" ON "dwellings" USING btree ("district_id","kind");--> statement-breakpoint
CREATE INDEX "ledger_character_idx" ON "ledger_entries" USING btree ("character_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "players_pseudo_lower_idx" ON "players" USING btree (lower("pseudo"));