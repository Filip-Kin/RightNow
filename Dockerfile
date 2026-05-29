# RightNow E2EE API (Bun + tRPC + Drizzle/Postgres).
# The Expo app under app/ is excluded via .dockerignore; this image is the backend only.
FROM oven/bun:1.3.13

WORKDIR /app

# Install deps first for layer caching. Keep dev deps: drizzle-kit runs migrations on boot.
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Apply any pending migrations, then start the API. bunx --bun forces the Bun
# runtime so drizzle-kit never touches a system node.
CMD ["sh", "-c", "bun run migrate && bun run src/index.ts"]
