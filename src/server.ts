// Layanan pengirim WhatsApp pribadi.
import express, { type NextFunction, type Request, type Response } from "express";
import * as qrcode from "qrcode-terminal";
import { Client, LocalAuth } from "whatsapp-web.js";

type Status = "starting" | "need_qr" | "ready" | "disconnected";

const PORT = Number(process.env.PORT) || 3900;
const API_KEY = process.env.API_KEY || "";

let status: Status = "starting";
let lastQr: string | null = null;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  },
});

client.on("qr", (qr: string) => {
  lastQr = qr;
  status = "need_qr";
  qrcode.generate(qr, { small: true });
  console.log("[wa] Scan QR: WhatsApp HP > Perangkat Tertaut > Tautkan perangkat");
});
client.on("ready", () => {
  status = "ready";
  lastQr = null;
  console.log("[wa] siap mengirim");
});
client.on("disconnected", (reason) => {
  status = "disconnected";
  console.log("[wa] terputus:", reason);
});
void client.initialize();

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
  if (status !== "ready") {
    res.status(503).json({ error: `Belum siap. Status: ${status}` });
    return;
  }
  try {
    const sent = await client.sendMessage(chatId, message);
    res.json({ ok: true, id: sent?.id?._serialized ?? null });
  } catch (e) {
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
});

app.listen(PORT, () => console.log(`[personal-bot-whatsapp] jalan di http://localhost:${PORT}`));
