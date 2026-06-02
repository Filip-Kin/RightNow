import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { authRouter } from './router/auth';
import { entriesRouter } from './router/entries';
import { linkRouter } from './router/link';
import { createContext, router } from './trpc';
import { PRIVACY_HTML } from './privacy';
import { DELETE_ACCOUNT_HTML } from './deletePage';

const appRouter = router({
    auth: authRouter,
    entries: entriesRouter,
    link: linkRouter,
});
export type AppRouter = typeof appRouter;

const port = Number(process.env.PORT) || 3000;
// Directory of the built Expo web app (populated by the Docker build stage).
const WEB_DIR = process.env.WEB_DIR ?? './web';

// Browser origins allowed to call the API (comma-separated env override). The
// native app sends no Origin and is unaffected by CORS, so locking this down
// only restricts other websites from calling the API in a victim's browser.
const ALLOWED_ORIGINS = (process.env.WEB_ORIGIN ?? 'https://rightnow.filipkin.com')
    .split(',').map((s) => s.trim()).filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
    const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allow,
        'Vary': 'Origin',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

// Coarse in-memory per-IP rate limiter for the credential endpoints, to blunt
// brute-forcing recovery codes / passwords and account-creation floods. Generous
// for humans, brutal for scripts. Normal data sync (entries.*) and the link poll
// are not limited here. Single-instance, resets on restart - fine for this scale.
const AUTH_RE = /auth\.(login|signInWithCode|register|addBackup)/;
const rl = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const e = rl.get(ip);
    if (!e || e.resetAt <= now) { rl.set(ip, { count: 1, resetAt: now + windowMs }); return false; }
    if (e.count >= limit) return true;
    e.count++;
    return false;
}
function clientIp(req: Request): string {
    return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

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

        // Static, no-JS privacy policy (the URL given to the Play Console). Served
        // server-side so a bare hit returns readable text, not the SPA shell. The
        // in-app SPA route /privacy still handles client-side navigation.
        if (url.pathname === '/privacy' || url.pathname === '/privacy.html') {
            return new Response(PRIVACY_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
        if (url.pathname === '/delete-account' || url.pathname === '/delete-account.html') {
            return new Response(DELETE_ACCOUNT_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        // tRPC API under /api (both the web app and the native app call this).
        if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
            const cors = corsHeaders(req.headers.get('origin'));
            if (req.method === 'OPTIONS') {
                return new Response(null, { status: 204, headers: cors });
            }
            // tRPC puts the procedure path in the URL (e.g. /api/auth.login, or a
            // comma-joined list when batched), so we can throttle just the credential
            // endpoints at the HTTP layer.
            if (AUTH_RE.test(url.pathname + url.search) && rateLimited(`auth:${clientIp(req)}`, 20, 60_000)) {
                return new Response(JSON.stringify({ error: 'Too many attempts, try again shortly.' }),
                    { status: 429, headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': '60' } });
            }
            const res = await fetchRequestHandler({
                endpoint: '/api',
                req,
                router: appRouter,
                createContext,
            });
            for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
            return res;
        }

        // Everything else: the static Expo web build.
        return serveStatic(url.pathname);
    },
});

console.log(`RightNow listening on :${port} (web from ${WEB_DIR}, API at /api)`);
