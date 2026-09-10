# bun cuma untuk memasang dependensi (lockfile-nya bun.lock)
FROM oven/bun:1-debian AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Dijalankan dengan Node, BUKAN bun: shim ws milik bun tidak mengimplementasikan
# event 'upgrade'/'unexpected-response' yang dipasang Baileys — kalau handshake
# bermasalah, bot menggantung diam tanpa memicu reconnect.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production PORT=3900 AUTH_DIR=/app/.baileys_auth
EXPOSE 3900

CMD ["npx", "tsx", "src/server.ts"]
