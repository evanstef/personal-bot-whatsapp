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
