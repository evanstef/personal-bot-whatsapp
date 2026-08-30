# personal-bot-whatsapp

Layanan pengirim WhatsApp pribadi lewat HTTP, pakai `whatsapp-web.js` (TypeScript, Bun).
Bot "bodoh" — hanya mengirim. Dipanggil aplikasi lain (mis. job-match-agent).

## Jalankan
```sh
bun install
cp .env.example .env      # isi API_KEY dengan string acak
bun run dev               # scan QR yang muncul, sekali saja
# produksi: bun run start
```

## Endpoint
| Metode | Path    | Guna |
|--------|---------|------|
| GET    | /status | starting / need_qr / ready / disconnected |
| GET    | /qr     | QR mentah |
| POST   | /send   | `{ "chatId": "628xx@c.us", "message": "..." }` — header `X-API-KEY` |

## Catatan
- Bun menjalankan TS langsung — tidak ada langkah build. `bun run typecheck` buat cek tipe.
- Login = scan QR sekali; sesi di `.wwebjs_auth/` (jangan di-commit).
- Kirim ke nomor sendiri masuk chat "Pesan ke Diri Sendiri" (mungkin tanpa notif push).
- Jaga tetap kirim-saja — jangan tambah balasan LLM.

## Produksi (pm2)
Biar bot hidup terus + restart sendiri kalau mati/macet:
```sh
pm2 start ecosystem.config.cjs   # jalankan (butuh sudah scan QR sekali)
pm2 save                         # ingat daftar proses
pm2 startup                      # ikuti perintah sudo yang muncul -> hidup lagi tiap reboot
pm2 logs wa-bot                  # lihat log
pm2 restart wa-bot               # restart manual
```
Bot punya **watchdog**: kalau macet `starting`/`disconnected` > 3 menit, dia keluar
sendiri biar pm2 me-restart (reconnect dari sesi). `need_qr` TIDAK di-restart otomatis —
itu berarti sesi hilang dan **perlu scan QR ulang** (cek `pm2 logs`).
