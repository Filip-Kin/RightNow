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

// Idle lifetime of a session token. It's a SLIDING window: every authenticated
// request extends it (see createContext), so an everyday user never has to re-enter
// credentials - the token only lapses after this long with no activity at all.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Don't rewrite expires_at on every request - only once it has drifted more than this
// past its last renewal. Caps the renewal write to ~once/day per active token.
const SESSION_RENEW_INTERVAL_MS = 24 * 60 * 60 * 1000;

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
        const now = Date.now();
        if (row && row.expires_at.getTime() > now) {
            session = { userId: row.user_id, tokenId: row.id, kind: row.kind };
            // Sliding renewal: push the expiry back out so an active device stays signed
            // in indefinitely. Only write when it has drifted past the renew interval
            // (i.e. last renewed > a day ago), keeping this off the hot path. Fire and
            // forget - the current request is already authorized.
            if (row.expires_at.getTime() < now + SESSION_TTL_MS - SESSION_RENEW_INTERVAL_MS) {
                void db.update(tokensTable)
                    .set({ expires_at: new Date(now + SESSION_TTL_MS) })
                    .where(eq(tokensTable.id, row.id))
                    .catch(() => { /* best-effort; expiry just renews on a later request */ });
            }
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
