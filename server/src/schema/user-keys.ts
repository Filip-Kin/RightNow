import { pgTable, timestamp, uuid, text } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// The Data Encryption Key (DEK), wrapped under one or two KEKs, base64-encoded. The
// server stores these opaque blobs and never has the keys to unwrap them:
//   - *_rc: DEK encrypted under KEK_rc (from the recovery code) - ALWAYS present.
//   - *_pw: DEK encrypted under KEK_pw (from the optional account password) - null
//           until the user adds the email+password backup.
// Both unwrap to the same DEK, so adding/changing the password only re-wraps *_pw;
// entry ciphertext is never touched.
export const userKeysTable = pgTable("user_keys", {
    user_id: uuid().primaryKey().references(() => usersTable.id),
    wrapped_dek_rc: text().notNull(),
    wrapped_dek_rc_nonce: text().notNull(),
    wrapped_dek_pw: text(),
    wrapped_dek_pw_nonce: text(),
    updated_at: timestamp().notNull().defaultNow(),
});
