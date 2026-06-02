import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { randomBytes, createHash } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { db } from '../db';
import { usersTable } from '../schema/users';
import { userKeysTable } from '../schema/user-keys';
import { tokensTable } from '../schema/tokens';
import { protectedProcedure, publicProcedure, router, hashToken } from '../trpc';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function mintToken(userId: string, kind: 'session', ip: string) {
    const token = randomBytes(32).toString('hex');
    // Persist only SHA-256(token); the raw token is returned to the client and
    // never stored, so a token-table leak can't be replayed.
    await db.insert(tokensTable).values({
        user_id: userId,
        token: hashToken(token),
        kind,
        ip_address: ip,
        expires_at: new Date(Date.now() + SESSION_TTL_MS),
    });
    return token;
}

/** Queryable lookup key for an account's recovery code. The high-entropy auth token
 *  can't be brute-forced, and SHA-256 reveals neither the code nor any key. */
function recoveryLookup(authTokenRc: string): string {
    return createHash('sha256').update(authTokenRc).digest('hex');
}

export const authRouter = router({
    // Create an account: email is required, a recovery code is always set, and a
    // password is optional (the email+password backup). The DEK is wrapped under the
    // recovery key (always) and the password key (if a password was set).
    register: publicProcedure
        .input(z.object({
            email: z.string().email().max(255),
            authTokenRc: z.string().min(16).max(512),
            wrappedDekRc: z.string().max(2048),
            wrappedDekRcNonce: z.string().max(512),
            authTokenPw: z.string().min(16).max(512).optional(),
            wrappedDekPw: z.string().max(2048).optional(),
            wrappedDekPwNonce: z.string().max(512).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const emailTaken = (await db.select({ id: usersTable.id }).from(usersTable)
                .where(eq(usersTable.email, input.email)))[0];
            if (emailTaken) throw new TRPCError({ code: 'CONFLICT', message: 'That email is already registered' });

            const lookup = recoveryLookup(input.authTokenRc);
            const rcExisting = (await db.select({ id: usersTable.id }).from(usersTable)
                .where(eq(usersTable.recovery_lookup, lookup)))[0];
            if (rcExisting) throw new TRPCError({ code: 'CONFLICT', message: 'Recovery code collision, please try again' });

            // One transaction: a crash between the two inserts must not leave an
            // orphaned user with no key row (which signInWithCode/login would choke on).
            const auth_hash = input.authTokenPw ? await Bun.password.hash(input.authTokenPw) : null;
            const userId = await db.transaction(async (tx) => {
                const [user] = await tx.insert(usersTable).values({
                    email: input.email,
                    recovery_lookup: lookup,
                    auth_hash,
                }).returning({ id: usersTable.id });
                await tx.insert(userKeysTable).values({
                    user_id: user.id,
                    wrapped_dek_rc: input.wrappedDekRc,
                    wrapped_dek_rc_nonce: input.wrappedDekRcNonce,
                    wrapped_dek_pw: input.wrappedDekPw ?? null,
                    wrapped_dek_pw_nonce: input.wrappedDekPwNonce ?? null,
                });
                return user.id;
            });
            const token = await mintToken(userId, 'session', ctx.ip);
            return { token, userId };
        }),

    // Sign in (any device) with the recovery code. Returns the recovery-wrapped DEK.
    signInWithCode: publicProcedure
        .input(z.object({ authTokenRc: z.string().max(512) }))
        .mutation(async ({ ctx, input }) => {
            const lookup = recoveryLookup(input.authTokenRc);
            const user = (await db.select().from(usersTable)
                .where(eq(usersTable.recovery_lookup, lookup)))[0];
            if (!user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid recovery code' });

            const keys = (await db.select().from(userKeysTable)
                .where(eq(userKeysTable.user_id, user.id)))[0];
            if (!keys) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid recovery code' });
            const token = await mintToken(user.id, 'session', ctx.ip);
            return {
                token,
                userId: user.id,
                wrappedDekRc: keys.wrapped_dek_rc,
                wrappedDekRcNonce: keys.wrapped_dek_rc_nonce,
            };
        }),

    // Add (or replace) the optional email+password backup on the signed-in account.
    addBackup: protectedProcedure
        .input(z.object({
            email: z.string().email().max(255),
            authTokenPw: z.string().min(16).max(512),
            wrappedDekPw: z.string().max(2048),
            wrappedDekPwNonce: z.string().max(512),
        }))
        .mutation(async ({ ctx, input }) => {
            const taken = (await db.select({ id: usersTable.id }).from(usersTable)
                .where(eq(usersTable.email, input.email)))[0];
            if (taken && taken.id !== ctx.session.userId) {
                throw new TRPCError({ code: 'CONFLICT', message: 'That email is already in use' });
            }
            await db.update(usersTable)
                .set({ email: input.email, auth_hash: await Bun.password.hash(input.authTokenPw) })
                .where(eq(usersTable.id, ctx.session.userId));
            await db.update(userKeysTable)
                .set({ wrapped_dek_pw: input.wrappedDekPw, wrapped_dek_pw_nonce: input.wrappedDekPwNonce, updated_at: new Date() })
                .where(eq(userKeysTable.user_id, ctx.session.userId));
            return { ok: true };
        }),

    // Sign in with the optional email+password backup.
    login: publicProcedure
        .input(z.object({
            email: z.string().email().max(255),
            authTokenPw: z.string().max(512),
        }))
        .mutation(async ({ ctx, input }) => {
            const user = (await db.select().from(usersTable)
                .where(eq(usersTable.email, input.email)))[0];
            if (!user || !user.auth_hash || !(await Bun.password.verify(input.authTokenPw, user.auth_hash))) {
                throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });
            }
            const keys = (await db.select().from(userKeysTable)
                .where(eq(userKeysTable.user_id, user.id)))[0];
            // Same generic message as a bad password: don't reveal whether the email
            // exists or whether it carries a password backup.
            if (!keys || !keys.wrapped_dek_pw || !keys.wrapped_dek_pw_nonce) {
                throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });
            }
            const token = await mintToken(user.id, 'session', ctx.ip);
            return {
                token,
                userId: user.id,
                wrappedDekPw: keys.wrapped_dek_pw,
                wrappedDekPwNonce: keys.wrapped_dek_pw_nonce,
            };
        }),

    // Whether the signed-in account has an email+password backup (for Settings).
    backupStatus: protectedProcedure.query(async ({ ctx }) => {
        const user = (await db.select({ email: usersTable.email }).from(usersTable)
            .where(eq(usersTable.id, ctx.session.userId)))[0];
        return { email: user?.email ?? null };
    }),

    me: protectedProcedure.query(async ({ ctx }) => {
        const user = (await db.select({ id: usersTable.id, email: usersTable.email, created_at: usersTable.created_at })
            .from(usersTable).where(eq(usersTable.id, ctx.session.userId)))[0];
        return user;
    }),

    logout: protectedProcedure.mutation(async ({ ctx }) => {
        await db.delete(tokensTable).where(eq(tokensTable.id, ctx.session.tokenId));
        return { ok: true };
    }),
});
