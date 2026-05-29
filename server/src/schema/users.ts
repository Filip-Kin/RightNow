import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

// Minimal PII by design: email is the only identifier. All encryption keys are
// derived client-side. The KDF salt is the normalized email (Bitwarden model),
// so we store no salt and login needs no pre-login round trip.
//
// auth_hash     = Bun.password.hash(auth_token_pw)  where auth_token_pw is derived
//                 client-side from the account password (Argon2id -> HKDF "auth").
// recovery_hash = Bun.password.hash(auth_token_rc)  derived the same way from the
//                 64-char recovery code. Lets the client authenticate a password reset.
// The server never sees the password, the recovery code, any KEK, or the DEK.
export const usersTable = pgTable("users", {
    id: uuid().primaryKey().defaultRandom(),
    email: varchar({ length: 255 }).notNull().unique(),
    auth_hash: varchar({ length: 255 }).notNull(),
    recovery_hash: varchar({ length: 255 }).notNull(),
    created_at: timestamp().notNull().defaultNow(),
});
