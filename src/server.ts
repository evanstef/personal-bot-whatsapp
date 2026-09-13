// Layanan pengirim WhatsApp pribadi. Baileys (WebSocket murni, tanpa browser).
import fs from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import qrcode from "qrcode-terminal";
import pino from "pino";
import type { WASocket } from "@whiskeysockets/baileys";

type Status = "starting" | "need_qr" | "ready" | "disconnected";

const PORT = Number(process.env.PORT) || 3900;
const API_KEY = process.env.API_KEY || "";
const AUTH_DIR = process.env.AUTH_DIR || "./.baileys_auth";

const RECONNECT_MIN_MS = 3_000;
const RECONNECT_MAX_MS = 60_000;

let status: Status = "starting";
let lastQr: string | null = null;
let sock: WASocket | null = null;
let jedaSambung = RECONNECT_MIN_MS;
let antre: NodeJS.Timeout | null = null;
let pernahTersambung = false;

/** Buang sesi Signal per-perangkat, sisakan identitas & kunci akun.
 *
 * Sesi bisa melenceng dari lawan bicaranya setiap kali koneksi terputus: kunci
 * di satu sisi maju, sisi lain tidak. Akibatnya pesan terkirim tapi TIDAK BISA
 * DIBACA — penerima melihat "Menunggu pesan ini", sementara di sisi kita semua
 * tampak sukses. Gagal total tanpa satu pun error yang bisa ditangkap.
 *
 * Menghapusnya memaksa Baileys berunding ulang saat kiriman berikutnya. Murah:
 * berkasnya dibuat malas, jadi selama tidak ada yang dikirim, tidak ada biaya.
 *
 * ⚠️ HANYA session-*.json. creds.json = identitas perangkat (hilang = scan QR
 * ulang); pre-key / app-state / sender-key juga jangan disentuh.
 */
function buangSesi(): number {
  let jumlah = 0;
  try {
    for (const nama of fs.readdirSync(AUTH_DIR)) {
      if (nama.startsWith("session-") && nama.endsWith(".json")) {
        fs.rmSync(path.join(AUTH_DIR, nama), { force: true });
        jumlah++;
      }
    }
  } catch {
    // folder belum ada (belum pernah tertaut) — tidak apa-apa
  }
  return jumlah;
}

/** Hanya boleh ada SATU socket hidup. Tanpa penjaga ini tiap penutupan memicu
 *  socket baru sementara yang lama tetap jalan — puluhan socket menerbitkan QR
 *  masing-masing, dan QR yang di-scan orang milik socket yang sudah mati. */
function jadwalkanSambung(ms: number): void {
  if (antre) return;
  antre = setTimeout(() => {
    antre = null;
    void sambung();
  }, ms);
}

const logger = pino({ level: "silent" });

/** Pemanggil memakai gaya whatsapp-web.js (628xxx@c.us); Baileys mau @s.whatsapp.net. */
export function keJid(tujuan: string): string {
  const bersih = tujuan.trim();
  if (bersih.endsWith("@g.us") || bersih.endsWith("@s.whatsapp.net")) return bersih;
  const angka = bersih.split("@")[0].replace(/\D/g, "");
  return `${angka}@s.whatsapp.net`;
}

async function sambung(): Promise<void> {
  // Baileys paket CJS: `import` statis bikin makeWASocket undefined di Node.
  // Impor dinamis + destrukturisasi `default` — satu-satunya bentuk yang jalan.
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    Browsers,
  } = await import("@whiskeysockets/baileys");

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  let version: [number, number, number] | undefined;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    version = undefined; // pakai versi bawaan paket
  }

  const s = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.ubuntu("Job Match Bot"),
    syncFullHistory: false,
    markOnlineOnConnect: false,
    // umur QR sebelum socket ditutup; bawaannya 60 dtk, terlalu mepet untuk
    // alur "buka terminal, ambil HP, cari menu Perangkat Tertaut"
    qrTimeout: 180_000,
  });
  sock = s;

  s.ev.on("creds.update", saveCreds);

  s.ev.on("connection.update", (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      lastQr = qr;
      status = "need_qr";
      qrcode.generate(qr, { small: true });
      console.log("[wa] Scan QR: WhatsApp HP > Perangkat Tertaut > Tautkan perangkat");
    }

    if (connection === "open") {
      status = "ready";
      lastQr = null;
      pernahTersambung = true;
      jedaSambung = RECONNECT_MIN_MS;

      // Sesi lama dibuang tiap koneksi terbuka — putus-sambung itu justru pemicu
      // melencengnya kunci, dan ini satu-satunya titik yang pasti terlewati.
      const dibuang = buangSesi();
      console.log(`[wa] siap mengirim sebagai ${s.user?.id} (${dibuang} sesi lama dibuang)`);
    }

    if (connection === "close") {
      const kode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output
        ?.statusCode;
      const keluar = kode === DisconnectReason.loggedOut;

      // socket lama WAJIB ditutup sebelum yang baru dibuat
      try {
        s.end(undefined);
      } catch {
        // sudah tertutup sendiri; tidak apa-apa
      }
      if (sock === s) sock = null;

      if (keluar && !pernahTersambung) {
        // Belum pernah tertaut: 401 di sini berarti QR kedaluwarsa, BUKAN logout.
        // Sambung ulang santai untuk menerbitkan QR baru.
        console.log("[wa] QR kedaluwarsa, menerbitkan yang baru");
        status = "need_qr";
        lastQr = null;
        jadwalkanSambung(3_000);
      } else if (keluar) {
        // Pernah tertaut lalu ditolak = sesi benar-benar dibatalkan dari HP.
        console.log("[wa] sesi dibatalkan dari HP — perlu tautkan ulang");
        status = "need_qr";
        jadwalkanSambung(5_000);
      } else {
        console.log(`[wa] terputus (kode: ${kode}), menyambung ulang`);
        status = "disconnected";
        jadwalkanSambung(jedaSambung);
        // backoff meredam loop putus-sambung saat jaringan bermasalah
        jedaSambung = Math.min(jedaSambung * 2, RECONNECT_MAX_MS);
      }
    }
  });
}

void sambung();

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

const app = express();
app.use(express.json());

// Kunci endpoint tulis. Kalau API_KEY kosong (dev), tidak dikunci.
function auth(req: Request, res: Response, next: NextFunction): void {
  if (!API_KEY) {
    next();
    return;
  }
  if (req.get("X-API-KEY") !== API_KEY) {
    res.status(401).json({ error: "API key salah" });
    return;
  }
  next();
}

app.get("/status", (_req: Request, res: Response): void => {
  res.json({ status });
});

app.get("/qr", (_req: Request, res: Response): void => {
  if (!lastQr) {
    res.status(404).json({ error: `Tidak ada QR. Status: ${status}` });
    return;
  }
  res.json({ qr: lastQr });
});

app.post("/send", auth, async (req: Request, res: Response): Promise<void> => {
  const { chatId, message } = req.body ?? {};
  if (!chatId || !message) {
    res.status(400).json({ error: "chatId & message wajib diisi" });
    return;
  }
  if (status !== "ready" || !sock) {
    res.status(503).json({ error: `Belum siap. Status: ${status}` });
    return;
  }
  try {
    const sent = await sock.sendMessage(keJid(chatId), { text: message });
    res.json({ ok: true, id: sent?.key?.id ?? null });
  } catch (e) {
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
});

app.listen(PORT, () => console.log(`[personal-bot-whatsapp] jalan di http://localhost:${PORT}`));
