import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

// Anonymous-first, zero-knowledge. An account is created with only a recovery code
// (256-bit, client-side); email + password are an OPTIONAL backup added later.
//   recovery_lookup = SHA-256(auth_token_rc)  -> queryable key to find an account
//                     from its recovery code with no email (a fast hash is fine:
//                     auth_token_rc has 256 bits of entropy and can't be brute-forced,
//                     and the lookup hash reveals neither the code nor the KEK).
//   email / auth_hash = the optional email+password backup (Bitwarden-style: the KDF
//                     salt is the normalized email). Null until the user opts in.
// The server never sees the password, the recovery code, any KEK, or the DEK.
export const usersTable = pgTable("users", {
    id: uuid().primaryKey().defaultRandom(),
    recovery_lookup: varchar({ length: 128 }).notNull().unique(),
    email: varchar({ length: 255 }).unique(),
    auth_hash: varchar({ length: 255 }),
    created_at: timestamp().notNull().defaultNow(),
});
