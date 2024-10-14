import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../src/index';

const trpc = createTRPCClient<AppRouter>({
    links: [
        httpBatchLink({
            url: `${window.location.origin}/trpc`,
        }),
    ],
});