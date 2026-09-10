FROM oven/bun:1-debian

WORKDIR /app

# Chromium bawaan puppeteer butuh pustaka sistem ini di image slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libatspi2.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 \
    libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 \
    libxext6 libxfixes3 libxkbcommon0 libxrandr2 xdg-utils \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# whatsapp-web.js memakai puppeteer BERSARANG miliknya (24.x), bukan yang di
# package.json (23.x) — versi Chrome-nya beda. Versi dibaca dari paket itu supaya
# tidak di-hardcode; salah versi = bot mati saat start, bukan gagal saat build.
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer
RUN VERSI=$(bun -e "console.log(require('/app/node_modules/whatsapp-web.js/node_modules/puppeteer/node_modules/puppeteer-core/lib/cjs/puppeteer/revisions.js').PUPPETEER_REVISIONS.chrome)") \
    && echo "Chrome yang diminta whatsapp-web.js: $VERSI" \
    && bunx puppeteer browsers install "chrome@$VERSI"

COPY . .

ENV NODE_ENV=production PORT=3900
EXPOSE 3900

CMD ["bun", "src/server.ts"]
