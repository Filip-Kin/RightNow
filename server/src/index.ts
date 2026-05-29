import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { authRouter } from './router/auth';
import { entriesRouter } from './router/entries';
import { createContext, router } from './trpc';

const appRouter = router({
    auth: authRouter,
    entries: entriesRouter,
});
export type AppRouter = typeof appRouter;

const server = createHTTPServer({
    router: appRouter,
    createContext,
    middleware: (req, res, next) => {
        // CORS for the web build. Native clients ignore this.
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        // Health check for Coolify. tRPC procedure paths look like /auth.login,
        // so /health and / never collide with them.
        if (req.url === '/health' || req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, service: 'rightnow' }));
            return;
        }
        next();
    },
});

const port = Number(process.env.PORT) || 3000;
server.listen(port);
console.log(`RightNow API listening on :${port}`);
