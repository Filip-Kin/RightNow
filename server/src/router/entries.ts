import { z } from 'zod';
import { and, asc, count, eq, gt, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { entriesTable } from '../schema/entries';
import { protectedProcedure, router } from '../trpc';

// Cap the rows returned per pull so a large account can't force the whole dataset
// into memory in one response. Comfortably larger than a single push batch (500),
// so the "drop the trailing same-received_at group" boundary logic below always
// makes forward progress. The client loops on `hasMore` until drained.
const PULL_LIMIT = 2000;

// One opaque encrypted cell. cellId is an HMAC the server can match on but not
// interpret; ciphertext/nonce are AEAD output. updatedAt is the client's logical
// clock (epoch ms) used for last-write-wins.
const recordInput = z.object({
    cellId: z.string().min(1).max(128),
    ciphertext: z.string().max(4096),
    nonce: z.string().max(512),
    deleted: z.boolean().default(false),
    updatedAt: z.number().int().nonnegative(),
});

export const entriesRouter = router({
    // Upload encrypted cells. Last-write-wins: an incoming record only overwrites
    // an existing one when its updatedAt is strictly newer.
    push: protectedProcedure
        .input(z.object({ records: z.array(recordInput).min(1).max(500) }))
        .mutation(async ({ ctx, input }) => {
            const rows = input.records.map((r) => ({
                user_id: ctx.session.userId,
                cell_id: r.cellId,
                ciphertext: r.ciphertext,
                nonce: r.nonce,
                deleted: r.deleted,
                updated_at: new Date(r.updatedAt),
            }));

            await db.insert(entriesTable).values(rows).onConflictDoUpdate({
                target: [entriesTable.user_id, entriesTable.cell_id],
                set: {
                    ciphertext: sql`excluded.ciphertext`,
                    nonce: sql`excluded.nonce`,
                    deleted: sql`excluded.deleted`,
                    updated_at: sql`excluded.updated_at`,
                    received_at: sql`now()`,
                },
                setWhere: sql`${entriesTable.updated_at} < excluded.updated_at`,
            });

            return { ok: true, count: rows.length };
        }),

    // Incremental, paginated sync via a (received_at, id) KEYSET cursor. A single
    // push stamps every row in its batch with the same received_at, so a received_at
    // alone can't disambiguate within a batch; the id tie-breaker lets pages be full
    // PULL_LIMIT chunks with no row dropped or re-fetched (fast even when an import
    // packed thousands of cells into a few seconds). Returns the next (cursor,
    // cursorId) to pass back, `hasMore`, and `total` (computed only on the first page
    // - since === undefined - so we don't COUNT on every page).
    pull: protectedProcedure
        .input(z.object({
            since: z.number().int().nonnegative().optional(),
            sinceId: z.string().max(64).optional(),
        }))
        .query(async ({ ctx, input }) => {
            const mine = eq(entriesTable.user_id, ctx.session.userId);
            const where = input.since === undefined
                ? mine
                : and(mine, or(
                    gt(entriesTable.received_at, new Date(input.since)),
                    input.sinceId
                        ? and(eq(entriesTable.received_at, new Date(input.since)), gt(entriesTable.id, input.sinceId))
                        : sql`false`,
                ));

            const total = input.since === undefined
                ? (await db.select({ value: count() }).from(entriesTable).where(mine))[0].value
                : -1;

            const rows = await db.select().from(entriesTable)
                .where(where)
                .orderBy(asc(entriesTable.received_at), asc(entriesTable.id))
                .limit(PULL_LIMIT);

            const hasMore = rows.length === PULL_LIMIT;
            const last = rows[rows.length - 1];
            const records = rows.map((r) => ({
                cellId: r.cell_id,
                ciphertext: r.ciphertext,
                nonce: r.nonce,
                deleted: r.deleted,
                updatedAt: r.updated_at.getTime(),
                receivedAt: r.received_at.getTime(),
            }));

            return {
                records,
                cursor: last ? last.received_at.getTime() : (input.since ?? 0),
                cursorId: last ? last.id : (input.sinceId ?? ""),
                hasMore,
                total,
            };
        }),
});
