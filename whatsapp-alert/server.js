// WhatsApp alert sender – pakai WhatsApp Web session (whatsapp-web.js).
// Login sekali via scan QR di terminal, session disimpan di .wwebjs_auth/
// lalu backend NOC kirim alert dengan POST /send { to, message }.
//
// ENV (opsional):
//   WA_WEB_PORT     port HTTP (default 3100)
//   WA_WEB_SECRET   kalau diisi, request wajib punya header X-Alert-Secret sama
//   WA_COUNTRY_CODE kode negara default untuk nomor lokal (default 62)

import "dotenv/config";
import express from "express";
import qrcode from "qrcode-terminal";
import pkg from "whatsapp-web.js";

const { Client, LocalAuth, MessageMedia } = pkg;

const PORT = parseInt(process.env.WA_WEB_PORT || "3100", 10);
const SECRET = process.env.WA_WEB_SECRET || "";
const CC = (process.env.WA_COUNTRY_CODE || "62").replace(/\D/g, "");

let ready = false;
let lastQr = null;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: ".wwebjs_auth" }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  lastQr = qr;
  ready = false;
  console.log("\n[WA] Scan QR ini pakai WhatsApp (Perangkat Tertaut):\n");
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => console.log("[WA] authenticated"));
client.on("auth_failure", (m) => console.error("[WA] auth failure:", m));
client.on("ready", () => {
  ready = true;
  lastQr = null;
  console.log("[WA] client siap, alert bisa dikirim.");
});
client.on("disconnected", (r) => {
  ready = false;
  console.error("[WA] disconnected:", r);
});

client.initialize();

// Ubah nomor jadi format chatId WA: 62812xxxx@c.us
function toChatId(raw) {
  let n = String(raw || "").replace(/[^\d]/g, "");
  if (!n) return null;
  if (n.startsWith("0")) n = CC + n.slice(1);
  if (n.startsWith("8")) n = CC + n;
  return n + "@c.us";
}

const app = express();
app.use(express.json({ limit: "25mb" }));

app.use((req, res, next) => {
  if (!SECRET) return next();
  if (req.get("X-Alert-Secret") === SECRET) return next();
  return res.status(401).json({ ok: false, error: "unauthorized" });
});

app.get("/status", (req, res) => {
  res.json({ ok: true, ready, waitingForQr: !!lastQr });
});

app.post("/send", async (req, res) => {
  const { to, message } = req.body || {};
  if (!to || !message)
    return res.status(400).json({ ok: false, error: "to & message wajib" });
  if (!ready)
    return res.status(503).json({ ok: false, error: "WA client belum siap" });

  const chatId = toChatId(to);
  if (!chatId)
    return res.status(400).json({ ok: false, error: "nomor tidak valid" });

  try {
    const numberId = await client.getNumberId(chatId.replace("@c.us", ""));
    if (!numberId)
      return res
        .status(422)
        .json({ ok: false, error: `nomor ${to} tidak terdaftar di WhatsApp` });
    const sent = await client.sendMessage(numberId._serialized, message);
    res.json({ ok: true, id: sent?.id?._serialized || null });
  } catch (e) {
    console.error("[WA] gagal kirim:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Kirim file (mis. PDF rekap NOC). Body: { to, filename, mimetype?, caption?, data_base64 }
app.post("/send-file", async (req, res) => {
  const { to, filename, caption, data_base64 } = req.body || {};
  const mimetype = req.body?.mimetype || "application/pdf";
  if (!to || !filename || !data_base64)
    return res
      .status(400)
      .json({ ok: false, error: "to, filename & data_base64 wajib" });
  if (!ready)
    return res.status(503).json({ ok: false, error: "WA client belum siap" });

  const chatId = toChatId(to);
  if (!chatId)
    return res.status(400).json({ ok: false, error: "nomor tidak valid" });

  try {
    const numberId = await client.getNumberId(chatId.replace("@c.us", ""));
    if (!numberId)
      return res
        .status(422)
        .json({ ok: false, error: `nomor ${to} tidak terdaftar di WhatsApp` });
    const media = new MessageMedia(mimetype, data_base64, filename);
    const sent = await client.sendMessage(numberId._serialized, media, {
      caption: caption || undefined,
      sendMediaAsDocument: true,
    });
    res.json({ ok: true, id: sent?.id?._serialized || null });
  } catch (e) {
    console.error("[WA] gagal kirim file:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.listen(PORT, "127.0.0.1", () =>
  console.log(`[WA] HTTP listen di http://127.0.0.1:${PORT}`)
);
