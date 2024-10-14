import { usersRouter } from './router/users';
import { router } from './trpc';
import { createHTTPServer } from '@trpc/server/adapters/standalone';

const appRouter = router({
    usersRouter
});
export type AppRouter = typeof appRouter;

const server = createHTTPServer({
    router: appRouter,
});

server.listen(process.env.PORT || 3000);
