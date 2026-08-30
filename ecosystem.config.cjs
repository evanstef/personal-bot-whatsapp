// Konfigurasi pm2. Jalankan dari folder ini:  pm2 start ecosystem.config.js
// Butuh `bun` ada di PATH. Port dibaca bot dari .env (bun auto-load .env).
module.exports = {
  apps: [
    {
      name: "wa-bot",
      script: "src/server.ts",
      interpreter: "bun",
      autorestart: true,
      max_restarts: 100,
      restart_delay: 5000, // jeda antar-restart, cegah loop kilat
      max_memory_restart: "500M",
      kill_timeout: 10000, // beri waktu tutup Chromium sebelum SIGKILL
    },
  ],
};
