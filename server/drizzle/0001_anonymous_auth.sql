-- Migrate to anonymous-first auth: recovery code is primary (recovery_lookup),
-- email + password become an optional backup. Written idempotently so it is safe
-- on a fresh DB (0000 just created the old email/password schema) AND on the
-- already-hand-migrated prod DB (every statement is a no-op if already applied).
-- It intentionally does NOT delete data; the clean break on prod was a one-off.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "auth_hash" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "recovery_hash";
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "recovery_lookup" varchar(128);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "recovery_lookup" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_recovery_lookup_unique" UNIQUE("recovery_lookup");
EXCEPTION
 WHEN duplicate_object THEN null;
 WHEN duplicate_table THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "user_keys" ALTER COLUMN "wrapped_dek_pw" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_keys" ALTER COLUMN "wrapped_dek_pw_nonce" DROP NOT NULL;
