// Layanan pengirim WhatsApp pribadi. Baileys (WebSocket murni, tanpa browser).
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
      jedaSambung = RECONNECT_MIN_MS;
      console.log("[wa] siap mengirim sebagai", s.user?.id);
    }

    if (connection === "close") {
      const kode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output
        ?.statusCode;
      const keluar = kode === DisconnectReason.loggedOut;
      console.log(`[wa] terputus (kode: ${kode}, logout: ${keluar})`);

      if (keluar) {
        // sesi dibatalkan dari HP — hanya scan QR baru yang bisa memulihkan
        status = "need_qr";
        void sambung();
      } else {
        status = "disconnected";
        setTimeout(() => void sambung(), jedaSambung);
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
