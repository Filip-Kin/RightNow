import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// kind 'session'  -> normal access token (long-lived, ~7 days).
// kind 'recovery' -> short-lived token minted by auth.recover, only authorizes
//                    auth.resetPassword. Lets a user who forgot their password
//                    rotate it after proving ownership via the recovery code.
export const tokensTable = pgTable("tokens", {
    id: uuid().primaryKey().defaultRandom(),
    user_id: uuid().notNull().references(() => usersTable.id),
    token: varchar({ length: 255 }).notNull(),
    kind: varchar({ length: 32 }).notNull().default("session"),
    expires_at: timestamp().notNull(),
    created_at: timestamp().notNull().defaultNow(),
    ip_address: varchar({ length: 255 }).notNull().default(""),
});
