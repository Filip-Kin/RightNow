import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { db } from '../db';
import { usersTable } from '../schema/users';
import { userKeysTable } from '../schema/user-keys';
import { tokensTable } from '../schema/tokens';
import { authedProcedure, protectedProcedure, publicProcedure, router } from '../trpc';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RECOVERY_TTL_MS = 15 * 60 * 1000;

// All of these are opaque base64/hex strings produced by the client's crypto.
// The server stores them as-is and can never turn them back into plaintext.
const wrappedDek = {
    wrappedDekPw: z.string().max(2048),
    wrappedDekPwNonce: z.string().max(512),
    wrappedDekRc: z.string().max(2048),
    wrappedDekRcNonce: z.string().max(512),
};

export async function mintToken(userId: string, kind: 'session' | 'recovery', ip: string) {
    const token = randomBytes(32).toString('hex');
    const ttl = kind === 'recovery' ? RECOVERY_TTL_MS : SESSION_TTL_MS;
    await db.insert(tokensTable).values({
        user_id: userId,
        token,
        kind,
        ip_address: ip,
        expires_at: new Date(Date.now() + ttl),
    });
    return token;
}

export const authRouter = router({
    register: publicProcedure
        .input(z.object({
            email: z.string().email().max(255),
            authTokenPw: z.string().min(16).max(512),
            authTokenRc: z.string().min(16).max(512),
            ...wrappedDek,
        }))
        .mutation(async ({ input }) => {
            const existing = (await db.select({ id: usersTable.id }).from(usersTable)
                .where(eq(usersTable.email, input.email)))[0];
            if (existing) {
                throw new TRPCError({ code: 'CONFLICT', message: 'Email already registered' });
            }

            const [user] = await db.insert(usersTable).values({
                email: input.email,
                auth_hash: await Bun.password.hash(input.authTokenPw),
                recovery_hash: await Bun.password.hash(input.authTokenRc),
            }).returning({ id: usersTable.id });

            await db.insert(userKeysTable).values({
                user_id: user.id,
                wrapped_dek_pw: input.wrappedDekPw,
                wrapped_dek_pw_nonce: input.wrappedDekPwNonce,
                wrapped_dek_rc: input.wrappedDekRc,
                wrapped_dek_rc_nonce: input.wrappedDekRcNonce,
            });

            const token = await mintToken(user.id, 'session', '');
            return { token, userId: user.id };
        }),

    login: publicProcedure
        .input(z.object({
            email: z.string().email().max(255),
            authTokenPw: z.string().max(512),
        }))
        .mutation(async ({ input }) => {
            const user = (await db.select().from(usersTable)
                .where(eq(usersTable.email, input.email)))[0];
            if (!user || !(await Bun.password.verify(input.authTokenPw, user.auth_hash))) {
                throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });
            }

            const keys = (await db.select().from(userKeysTable)
                .where(eq(userKeysTable.user_id, user.id)))[0];
            const token = await mintToken(user.id, 'session', '');
            return {
                token,
                userId: user.id,
                wrappedDekPw: keys.wrapped_dek_pw,
                wrappedDekPwNonce: keys.wrapped_dek_pw_nonce,
            };
        }),

    // Forgot-password entry point: prove ownership with the recovery code, get
    // back the recovery-wrapped DEK plus a short-lived token to call resetPassword.
    recover: publicProcedure
        .input(z.object({
            email: z.string().email().max(255),
            authTokenRc: z.string().max(512),
        }))
        .mutation(async ({ input }) => {
            const user = (await db.select().from(usersTable)
                .where(eq(usersTable.email, input.email)))[0];
            if (!user || !(await Bun.password.verify(input.authTokenRc, user.recovery_hash))) {
                throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid recovery code' });
            }

            const keys = (await db.select().from(userKeysTable)
                .where(eq(userKeysTable.user_id, user.id)))[0];
            const recoveryToken = await mintToken(user.id, 'recovery', '');
            return {
                recoveryToken,
                userId: user.id,
                wrappedDekRc: keys.wrapped_dek_rc,
                wrappedDekRcNonce: keys.wrapped_dek_rc_nonce,
            };
        }),

    // Re-wrap the (already-known-client-side) DEK under a new password. Entry
    // ciphertext is never touched. Callable with a session OR a recovery token;
    // the supplied token is consumed afterward.
    resetPassword: authedProcedure
        .input(z.object({
            authTokenPw: z.string().min(16).max(512),
            wrappedDekPw: z.string().max(2048),
            wrappedDekPwNonce: z.string().max(512),
        }))
        .mutation(async ({ ctx, input }) => {
            await db.update(usersTable)
                .set({ auth_hash: await Bun.password.hash(input.authTokenPw) })
                .where(eq(usersTable.id, ctx.session.userId));

            await db.update(userKeysTable)
                .set({
                    wrapped_dek_pw: input.wrappedDekPw,
                    wrapped_dek_pw_nonce: input.wrappedDekPwNonce,
                    updated_at: new Date(),
                })
                .where(eq(userKeysTable.user_id, ctx.session.userId));

            await db.delete(tokensTable).where(eq(tokensTable.id, ctx.session.tokenId));
            return { ok: true };
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
