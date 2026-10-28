CREATE TABLE "friendships" (
	"low_id" uuid NOT NULL,
	"high_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "friendships_ordered" CHECK ("friendships"."low_id" < "friendships"."high_id")
);
--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_low_id_characters_id_fk" FOREIGN KEY ("low_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_high_id_characters_id_fk" FOREIGN KEY ("high_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requested_by_characters_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "friendships_pair_idx" ON "friendships" USING btree ("low_id","high_id");--> statement-breakpoint
CREATE INDEX "friendships_high_idx" ON "friendships" USING btree ("high_id");