import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  makeCacheableSignalKeyStore
} from "@whiskeysockets/baileys";
import P from "pino";
import QRCode from "qrcode";
import { Boom } from "@hapi/boom";
import { config } from "./config.js";
import { context, addMessage } from "./store.js";
import { toPcm24k, pcmToOgg, imageToJpeg } from "./media.js";
import { askRealtime } from "./openai.js";

let sock = null;
let latestQrDataUrl = null;
let status = "starting";
let connectingPromise = null;

export function getWaStatus() {
  return { status, hasQr: Boolean(latestQrDataUrl) };
}

export async function getQrDataUrl() {
  return latestQrDataUrl;
}

export async function startWhatsApp() {
  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    const { state, saveCreds } = await useMultiFileAuthState(config.authDir);

    sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, P({ level: "silent" }))
      },
      logger: P({ level: "silent" }),
      printQRInTerminal: false,
      browser: ["Railway AI Bot", "Chrome", "1.0.0"],
      generateHighQualityLinkPreview: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        latestQrDataUrl = await QRCode.toDataURL(qr);
        status = "qr";
        console.log("New WhatsApp QR generated.");
      }

      if (connection === "open") {
        status = "connected";
        latestQrDataUrl = null;
        console.log("WhatsApp connected.");
      }

      if (connection === "close") {
        status = "disconnected";
        const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
        if (code !== DisconnectReason.loggedOut) {
          connectingPromise = null;
          setTimeout(startWhatsApp, 3000);
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;
        try { await handleMessage(msg); }
        catch (e) { console.error("message error:", e); }
      }
    });
  })();

  return connectingPromise;
}

async function handleMessage(msg) {
  const remoteJid = msg.key.remoteJid;
  if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") return;

  const m = msg.message;
  const text = m.conversation || m.extendedTextMessage?.text || null;
  let inputText = text;
  let audioPcm = null;
  let imageJpeg = null;
  let memoryText = text || "";

  if (m.audioMessage) {
    const buffer = await downloadMediaMessage(msg, "buffer", {});
    audioPcm = await toPcm24k(buffer);
    memoryText = "[voice note]";
  } else if (m.imageMessage) {
    const buffer = await downloadMediaMessage(msg, "buffer", {});
    imageJpeg = await imageToJpeg(buffer);
    inputText = m.imageMessage.caption || "[User sent an image]";
    memoryText = m.imageMessage.caption ? `[image] ${m.imageMessage.caption}` : "[image]";
  } else if (m.stickerMessage) {
    const buffer = await downloadMediaMessage(msg, "buffer", {});
    imageJpeg = await imageToJpeg(buffer);
    inputText = "[User sent a sticker. Interpret it in conversation context.]";
    memoryText = "[sticker]";
  } else if (!text) {
    return;
  }

  addMessage(remoteJid, "User", memoryText);

  const result = await askRealtime({
    history: context(remoteJid, config.maxHistory),
    text: inputText,
    audioPcm,
    imageJpeg
  });

  if (!result.audioPcm?.length) return;

  const ogg = await pcmToOgg(result.audioPcm);
  await sock.sendMessage(remoteJid, {
    audio: ogg,
    mimetype: "audio/ogg; codecs=opus",
    ptt: true
  });

  addMessage(remoteJid, "Assistant", "[voice reply]");
}
