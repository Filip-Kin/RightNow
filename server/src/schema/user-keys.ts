import { pgTable, timestamp, uuid, text } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// The Data Encryption Key (DEK), wrapped two ways, base64-encoded. The server
// stores these opaque blobs and never has the keys to unwrap them:
//   - *_pw: DEK encrypted under KEK_pw (derived from the account password)
//   - *_rc: DEK encrypted under KEK_rc (derived from the recovery code)
// Both unwrap to the same DEK, so a password reset only re-wraps *_pw; entry
// ciphertext is never touched.
export const userKeysTable = pgTable("user_keys", {
    user_id: uuid().primaryKey().references(() => usersTable.id),
    wrapped_dek_pw: text().notNull(),
    wrapped_dek_pw_nonce: text().notNull(),
    wrapped_dek_rc: text().notNull(),
    wrapped_dek_rc_nonce: text().notNull(),
    updated_at: timestamp().notNull().defaultNow(),
});
