-- Manual migration to anonymous-first auth (recovery code primary; email+password
-- optional). The deploy does NOT auto-run migrations, so this is applied to prod by
-- hand (and drizzle-kit can't generate non-interactively here). Clean break: the
-- pre-existing email/password accounts are wiped (data lives in clients' local
-- stores; users re-create an anonymous account and restore a backup).
BEGIN;

DELETE FROM entries;
DELETE FROM tokens;
DELETE FROM user_keys;
DELETE FROM users;

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN auth_hash DROP NOT NULL;
ALTER TABLE users DROP COLUMN IF EXISTS recovery_hash;
ALTER TABLE users ADD COLUMN recovery_lookup varchar(128);
ALTER TABLE users ALTER COLUMN recovery_lookup SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_recovery_lookup_unique UNIQUE (recovery_lookup);

ALTER TABLE user_keys ALTER COLUMN wrapped_dek_pw DROP NOT NULL;
ALTER TABLE user_keys ALTER COLUMN wrapped_dek_pw_nonce DROP NOT NULL;

COMMIT;
