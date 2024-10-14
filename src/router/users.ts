import { z } from 'zod';
import { db } from '../db';
import { usersTable } from '../schema/users';
import { publicProcedure, router } from '../trpc';
import { eq } from 'drizzle-orm';
import { tokensTable } from '../schema/tokens';
import { randomBytes } from 'node:crypto';

export const usersRouter = router({
    create: publicProcedure
        .input(z.object({
            name: z.string().max(255),
            email: z.string().email().max(255),
            password: z.string().min(6),
            dateofbirth: z.date().optional(),
        }))
        .mutation(async ({ input }) => {
            const hashedPassword = await Bun.password.hash(input.password);
            await db.insert(usersTable).values({
                name: input.name,
                email: input.email,
                password: hashedPassword,
                dateofbirth: input.dateofbirth?.toISOString(),
            }).execute();
        }),

    login: publicProcedure
        .input(z.object({
            email: z.string().email().max(255),
            password: z.string().min(6),
        }))
        .mutation(async ({ input }) => {
            const user = (await db.select().from(usersTable).where(eq(usersTable.email, input.email)))[0];
            if (!user) {
                throw new Error('User not found');
            }

            if (!await Bun.password.verify(user.password, input.password)) {
                throw new Error('Invalid password');
            }

            const token = randomBytes(32).toString('hex');

            return await db.insert(tokensTable).values({
                user_id: user.id,
                token,
                expires_at: new Date((new Date()).getTime() + (7 * 24 * 60 * 60 * 1000)),
                ip_address: ""
            }).returning();
        }),
});
