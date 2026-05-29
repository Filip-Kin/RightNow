import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { tokensTable } from './schema/tokens';

export interface Session {
    userId: string;
    tokenId: string;
    kind: string; // 'session' | 'recovery'
}

/**
 * Builds per-request context. Reads `Authorization: Bearer <token>`, validates
 * it against the tokens table (existence + expiry), and attaches the session.
 * The token is the only thing that identifies the caller; it never carries any
 * decryption key.
 */
export async function createContext({ req }: CreateHTTPContextOptions) {
    let session: Session | null = null;

    const header = req.headers['authorization'];
    if (header?.startsWith('Bearer ')) {
        const token = header.slice('Bearer '.length).trim();
        const row = (await db.select().from(tokensTable).where(eq(tokensTable.token, token)))[0];
        if (row && row.expires_at > new Date()) {
            session = { userId: row.user_id, tokenId: row.id, kind: row.kind };
        }
    }

    return { db, session };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;

/** Open to anyone: register, login, recover. */
export const publicProcedure = t.procedure;

/** Requires a normal (kind 'session') access token. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
    if (!ctx.session || ctx.session.kind !== 'session') {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    return next({ ctx: { ...ctx, session: ctx.session } });
});

/** Accepts a session OR a short-lived recovery token. Used by resetPassword. */
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
    if (!ctx.session) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    return next({ ctx: { ...ctx, session: ctx.session } });
});
