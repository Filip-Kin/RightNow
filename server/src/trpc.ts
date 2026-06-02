import { initTRPC, TRPCError } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from './db';
import { tokensTable } from './schema/tokens';

export interface Session {
    userId: string;
    tokenId: string;
    kind: string; // 'session'
}

/** Stored form of a session token. We keep only SHA-256(token) in the DB so a
 *  leaked token table (backup, snapshot) can't be replayed: the 256-bit random
 *  token is never persisted in the clear. Mirrors the recovery_lookup pattern. */
export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

/** Best-effort client IP behind Traefik (X-Forwarded-For is set by the proxy). */
export function clientIp(req: Request): string {
    return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
}

/**
 * Builds per-request context. Reads `Authorization: Bearer <token>`, validates
 * its SHA-256 against the tokens table (existence + expiry), and attaches the
 * session. The token is the only thing that identifies the caller; it never
 * carries any decryption key.
 */
export async function createContext({ req }: FetchCreateContextFnOptions) {
    let session: Session | null = null;

    const header = req.headers.get('authorization');
    if (header?.startsWith('Bearer ')) {
        const token = header.slice('Bearer '.length).trim();
        const row = (await db.select().from(tokensTable).where(eq(tokensTable.token, hashToken(token))))[0];
        if (row && row.expires_at > new Date()) {
            session = { userId: row.user_id, tokenId: row.id, kind: row.kind };
        }
    }

    return { db, session, ip: clientIp(req) };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;

/** Open to anyone: register, login, recovery-code sign-in, link relay. */
export const publicProcedure = t.procedure;

/** Requires a normal (kind 'session') access token. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
    if (!ctx.session || ctx.session.kind !== 'session') {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    return next({ ctx: { ...ctx, session: ctx.session } });
});
