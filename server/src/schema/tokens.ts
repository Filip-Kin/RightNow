import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// kind 'session' -> normal access token (long-lived, ~7 days).
// `token` stores SHA-256(token), never the raw token (see trpc.hashToken), so a
// leaked tokens table can't be replayed.
export const tokensTable = pgTable("tokens", {
    id: uuid().primaryKey().defaultRandom(),
    user_id: uuid().notNull().references(() => usersTable.id),
    token: varchar({ length: 255 }).notNull(),
    kind: varchar({ length: 32 }).notNull().default("session"),
    expires_at: timestamp().notNull(),
    created_at: timestamp().notNull().defaultNow(),
    ip_address: varchar({ length: 255 }).notNull().default(""),
});
