# RightNow: one image serving the static Expo web app at / and the tRPC API at /api.
# Build context is the repo root (Coolify base directory /) because the web export
# needs the app/ workspace.

# Stage 1: build the Expo web export.
# Metro resolves its transformer assuming a hoisted (npm-style) node_modules;
# bun's default isolated layout (.bun/) breaks that, so install hoisted here.
FROM oven/bun:1.3.13 AS web
WORKDIR /repo
COPY . .
RUN bun install --linker hoisted
RUN cd app && bunx --bun expo export --platform web --output-dir dist

# Stage 2: the server, with the web build embedded.
FROM oven/bun:1.3.13
WORKDIR /app

# curl is needed for the platform health check (Coolify execs curl/wget in-container).
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Install server deps standalone (no workspace root here -> installs from server/package.json).
COPY server/package.json ./
RUN bun install

COPY server/ .
COPY --from=web /repo/app/dist ./web

ENV NODE_ENV=production
ENV PORT=3000
ENV WEB_DIR=./web
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=10 \
  CMD curl -fsS http://127.0.0.1:3000/health || exit 1

# Apply migrations, then serve web + API.
CMD ["sh", "-c", "bun run migrate && bun run src/index.ts"]
