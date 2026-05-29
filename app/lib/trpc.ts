// Typed tRPC client. AppRouter is imported from the backend workspace package
// (rightnow-api), so the client's input/output types are inferred end-to-end and
// can never drift from the server. The session token and base URL are injected
// dynamically (headers are re-read per request; changing the URL rebuilds).
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "rightnow-api";

const DEFAULT_BASE_URL = "https://rightnow.filipkin.com";

let baseUrl = DEFAULT_BASE_URL;
let authToken: string | null = null;

function build() {
    return createTRPCClient<AppRouter>({
        links: [
            httpBatchLink({
                url: baseUrl,
                headers: () => (authToken ? { authorization: `Bearer ${authToken}` } : {}),
            }),
        ],
    });
}

let client = build();

export function setAuthToken(token: string | null) {
    authToken = token;
}

export function setBaseUrl(url: string) {
    baseUrl = url.replace(/\/+$/, "") || DEFAULT_BASE_URL;
    client = build();
}

// Proxy so a rebuilt client (after setBaseUrl) is always used by callers.
export const trpc = new Proxy({} as ReturnType<typeof build>, {
    get: (_t, prop) => (client as any)[prop],
});
