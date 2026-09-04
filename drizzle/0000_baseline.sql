CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deck_vocab_items" (
	"deck_id" text NOT NULL,
	"vocab_item_id" text NOT NULL,
	"is_constituent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "deck_vocab_items_deck_id_vocab_item_id_pk" PRIMARY KEY("deck_id","vocab_item_id")
);
--> statement-breakpoint
CREATE TABLE "decks" (
	"id" text PRIMARY KEY NOT NULL,
	"deck_name" text NOT NULL,
	"description" text NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_aids" (
	"id" text PRIMARY KEY NOT NULL,
	"memory_aid" text NOT NULL,
	"vocab_item_id" text NOT NULL,
	"created_by_id" text NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rateLimits" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rateLimits_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_by_id" text NOT NULL,
	"vocab_item_id" text,
	"memory_aid_id" text,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"admin_note" text,
	"resolved_by_id" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_decks" (
	"user_id" text NOT NULL,
	"deck_id" text NOT NULL,
	"include_constituents" boolean DEFAULT false NOT NULL,
	"reading_enabled" boolean DEFAULT true NOT NULL,
	"listening_enabled" boolean DEFAULT true NOT NULL,
	"understanding_enabled" boolean DEFAULT true NOT NULL,
	"writing_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "user_decks_user_id_deck_id_pk" PRIMARY KEY("user_id","deck_id")
);
--> statement-breakpoint
CREATE TABLE "user_vocab_items" (
	"user_id" text NOT NULL,
	"vocab_item_id" text NOT NULL,
	"seen" boolean DEFAULT false NOT NULL,
	"reading_level" integer DEFAULT 0 NOT NULL,
	"listening_level" integer DEFAULT 0 NOT NULL,
	"understanding_level" integer DEFAULT 0 NOT NULL,
	"writing_level" integer DEFAULT 0 NOT NULL,
	"memory_aid_id" text,
	"reading_next_at" timestamp,
	"listening_next_at" timestamp,
	"understanding_next_at" timestamp,
	"writing_next_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "user_vocab_items_user_id_vocab_item_id_pk" PRIMARY KEY("user_id","vocab_item_id")
);
--> statement-breakpoint
CREATE TABLE "user_vocab_synonyms" (
	"user_id" text NOT NULL,
	"vocab_item_id" text NOT NULL,
	"synonym" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "user_vocab_synonyms_user_id_vocab_item_id_synonym_pk" PRIMARY KEY("user_id","vocab_item_id","synonym")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocab_items" (
	"id" text PRIMARY KEY NOT NULL,
	"vocab_item" text NOT NULL,
	"translation" text,
	"pinyin" text NOT NULL,
	"vocab_type" text NOT NULL,
	"phonetic" boolean DEFAULT false NOT NULL,
	"script" text DEFAULT 'both' NOT NULL,
	"audio_url" text NOT NULL,
	"decomposition" text,
	"etymology_hint" text,
	"etymology_type" text,
	"etymology_phonetic" text,
	"etymology_semantic" text,
	"radical" text,
	"strokes" jsonb,
	"stroke_medians" jsonb,
	"stroke_matches" jsonb,
	"disabled" boolean DEFAULT false NOT NULL,
	"default_memory_aid_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "vocab_items_vocabItem_unique" UNIQUE("vocab_item")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_vocab_items" ADD CONSTRAINT "deck_vocab_items_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_vocab_items" ADD CONSTRAINT "deck_vocab_items_vocab_item_id_vocab_items_id_fk" FOREIGN KEY ("vocab_item_id") REFERENCES "public"."vocab_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_aids" ADD CONSTRAINT "memory_aids_vocab_item_id_vocab_items_id_fk" FOREIGN KEY ("vocab_item_id") REFERENCES "public"."vocab_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_aids" ADD CONSTRAINT "memory_aids_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_vocab_item_id_vocab_items_id_fk" FOREIGN KEY ("vocab_item_id") REFERENCES "public"."vocab_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_memory_aid_id_memory_aids_id_fk" FOREIGN KEY ("memory_aid_id") REFERENCES "public"."memory_aids"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_decks" ADD CONSTRAINT "user_decks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_decks" ADD CONSTRAINT "user_decks_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_vocab_items" ADD CONSTRAINT "user_vocab_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_vocab_items" ADD CONSTRAINT "user_vocab_items_vocab_item_id_vocab_items_id_fk" FOREIGN KEY ("vocab_item_id") REFERENCES "public"."vocab_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_vocab_items" ADD CONSTRAINT "user_vocab_items_memory_aid_id_memory_aids_id_fk" FOREIGN KEY ("memory_aid_id") REFERENCES "public"."memory_aids"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_vocab_synonyms" ADD CONSTRAINT "user_vocab_synonyms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_vocab_synonyms" ADD CONSTRAINT "user_vocab_synonyms_vocab_item_id_vocab_items_id_fk" FOREIGN KEY ("vocab_item_id") REFERENCES "public"."vocab_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_items" ADD CONSTRAINT "vocab_items_default_memory_aid_id_memory_aids_id_fk" FOREIGN KEY ("default_memory_aid_id") REFERENCES "public"."memory_aids"("id") ON DELETE no action ON UPDATE no action;