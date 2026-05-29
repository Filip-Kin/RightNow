import { boolean, pgTable, timestamp, uuid, text, unique, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// One encrypted record per (date, hour) cell. The server sees only opaque blobs:
//   - cell_id    = HMAC(client key, date||hour) hex. Stable per cell so we can
//                  upsert/merge, but it leaks neither the date nor the hour.
//   - ciphertext = AEAD(client key, { activity, feeling, source, ... }). base64.
//
// Conflict resolution is last-write-wins on the client-supplied `updated_at`
// (a logical timestamp), so multiple devices converge. `received_at` is the
// server clock, used only as the cursor for incremental `pull(since)`.
export const entriesTable = pgTable("entries", {
    id: uuid().primaryKey().defaultRandom(),
    user_id: uuid().notNull().references(() => usersTable.id),
    cell_id: text().notNull(),
    ciphertext: text().notNull(),
    nonce: text().notNull(),
    deleted: boolean().notNull().default(false),
    // Millisecond precision so the cursor (a JS epoch-ms number) round-trips
    // losslessly; Postgres' default microsecond now() would make pull(since)
    // re-return the latest rows on every call.
    updated_at: timestamp({ precision: 3 }).notNull(),
    received_at: timestamp({ precision: 3 }).notNull().defaultNow(),
}, (t) => ({
    userCellUnique: unique().on(t.user_id, t.cell_id),
    userReceivedIdx: index("entries_user_received_idx").on(t.user_id, t.received_at),
}));
