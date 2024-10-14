import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const tokensTable = pgTable("tokens", {
    id: uuid().primaryKey().defaultRandom(),
    user_id: uuid().notNull().references(() => usersTable.id),
    token: varchar({ length: 255 }).notNull(),
    expires_at: timestamp().notNull(),
    created_at: timestamp().notNull().defaultNow(),
    ip_address: varchar({ length: 255 }).notNull(),
});