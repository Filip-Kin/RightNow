# RightNow E2EE API (Bun + tRPC + Drizzle/Postgres).
# Built from the server/ workspace as a standalone package: Coolify's base
# directory is /server, so this build context contains only the backend (no
# monorepo root, no app/), and bun installs server deps straight from package.json.
FROM oven/bun:1.3.13

WORKDIR /app

# Install deps first for layer caching. Keep dev deps: drizzle-kit runs migrations on boot.
COPY package.json ./
RUN bun install

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Apply any pending migrations, then start the API. bunx --bun forces the Bun
# runtime so drizzle-kit never touches a system node.
CMD ["sh", "-c", "bun run migrate && bun run src/index.ts"]
