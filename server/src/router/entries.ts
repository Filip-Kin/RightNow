import { z } from 'zod';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '../db';
import { entriesTable } from '../schema/entries';
import { protectedProcedure, router } from '../trpc';

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

    // Incremental sync. Returns records whose server receipt time is after the
    // given cursor (epoch ms), plus the new cursor to pass next time.
    pull: protectedProcedure
        .input(z.object({ since: z.number().int().nonnegative().optional() }))
        .query(async ({ ctx, input }) => {
            const where = input.since !== undefined
                ? and(eq(entriesTable.user_id, ctx.session.userId), gt(entriesTable.received_at, new Date(input.since)))
                : eq(entriesTable.user_id, ctx.session.userId);

            const rows = await db.select().from(entriesTable)
                .where(where)
                .orderBy(entriesTable.received_at);

            let cursor = input.since ?? 0;
            const records = rows.map((r) => {
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

            return { records, cursor };
        }),
});
