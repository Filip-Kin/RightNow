import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { authRouter } from './router/auth';
import { entriesRouter } from './router/entries';
import { linkRouter } from './router/link';
import { createContext, router } from './trpc';

const appRouter = router({
    auth: authRouter,
    entries: entriesRouter,
    link: linkRouter,
});
export type AppRouter = typeof appRouter;

const port = Number(process.env.PORT) || 3000;
// Directory of the built Expo web app (populated by the Docker build stage).
const WEB_DIR = process.env.WEB_DIR ?? './web';

const CORS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// expo-sqlite on web (wa-sqlite) uses a worker + SharedArrayBuffer, which the
// browser only allows on a cross-origin-isolated page. These headers enable that.
// The whole web app is served same-origin, so require-corp doesn't block our own
// assets (only would-be cross-origin subresources, of which there are none).
const ISOLATION = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
};

async function serveStatic(pathname: string): Promise<Response> {
    const rel = pathname === '/' ? '/index.html' : pathname;
    let file = Bun.file(WEB_DIR + rel);
    if (!(await file.exists())) {
        // SPA fallback: unknown paths render the client-routed app shell.
        file = Bun.file(WEB_DIR + '/index.html');
        if (!(await file.exists())) {
            return new Response('Not found', { status: 404 });
        }
    }
    return new Response(file, { headers: ISOLATION });
}

Bun.serve({
    port,
    async fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === '/health') {
            return Response.json({ ok: true, service: 'rightnow' });
        }

        // tRPC API under /api (both the web app and the native app call this).
        if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
            if (req.method === 'OPTIONS') {
                return new Response(null, { status: 204, headers: CORS });
            }
            const res = await fetchRequestHandler({
                endpoint: '/api',
                req,
                router: appRouter,
                createContext,
            });
            for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
            return res;
        }

        // Everything else: the static Expo web build.
        return serveStatic(url.pathname);
    },
});

console.log(`RightNow listening on :${port} (web from ${WEB_DIR}, API at /api)`);
