import { db } from '../db';
import { usersTable } from '../schema/users';
import { publicProcedure, router } from '../trpc';

export const usersRouter = router({
    userList: publicProcedure
        .query(async () => {
            // Retrieve users from a datasource, this is an imaginary database
            const users = await db.select().from(usersTable);

            return users;
        }),
});