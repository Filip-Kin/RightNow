import { z } from 'zod';
import { and, asc, count, eq, gt, sql } from 'drizzle-orm';
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

    // Incremental, paginated sync. Returns up to PULL_LIMIT records whose server
    // receipt time is after the given cursor (epoch ms), the new cursor to pass
    // next time, `hasMore` (loop until false), and `total` (full matching count,
    // so the client can show an accurate download progress bar).
    pull: protectedProcedure
        .input(z.object({ since: z.number().int().nonnegative().optional() }))
        .query(async ({ ctx, input }) => {
            const where = input.since !== undefined
                ? and(eq(entriesTable.user_id, ctx.session.userId), gt(entriesTable.received_at, new Date(input.since)))
                : eq(entriesTable.user_id, ctx.session.userId);

            const [{ value: total }] = await db.select({ value: count() }).from(entriesTable).where(where);

            // Order by (received_at, id) for a stable page boundary.
            const rows = await db.select().from(entriesTable)
                .where(where)
                .orderBy(asc(entriesTable.received_at), asc(entriesTable.id))
                .limit(PULL_LIMIT);

            // The cursor is a received_at (ms); a single push stamps every row in the
            // batch with the same received_at. If a page ends mid-group, advancing the
            // cursor past that received_at would skip the rest of the group. So when the
            // page is full, drop the trailing rows sharing the max received_at - they
            // come back on the next page (group size <= push cap 500 < PULL_LIMIT, so
            // this always leaves progress).
            let pageRows = rows;
            let hasMore = false;
            if (rows.length === PULL_LIMIT) {
                hasMore = true;
                const maxMs = rows[rows.length - 1].received_at.getTime();
                const firstAtMax = rows.findIndex((r) => r.received_at.getTime() === maxMs);
                if (firstAtMax > 0) pageRows = rows.slice(0, firstAtMax);
            }

            let cursor = input.since ?? 0;
            const records = pageRows.map((r) => {
                const receivedAt = r.received_at.getTime();
                if (receivedAt > cursor) cursor = receivedAt;
                return {
                    cellId: r.cell_id,
                    ciphertext: r.ciphertext,
                    nonce: r.nonce,
                    deleted: r.deleted,
                    updatedAt: r.updated_at.getTime(),
                    receivedAt,
                };
            });

            return { records, cursor, hasMore, total };
        }),
});
