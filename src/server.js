import express from "express";
import { config } from "./config.js";
import { startWhatsApp, getQrDataUrl, getWaStatus } from "./whatsapp.js";

const app = express();

app.get("/", (_req, res) => {
  const s = getWaStatus();
  res.send(`
    <html><body style="font-family:Arial;max-width:700px;margin:40px auto">
      <h1>WhatsApp AI Bot</h1>
      <p>Status: <b>${s.status}</b></p>
      <p><a href="/qr">Open QR page</a></p>
    </body></html>
  `);
});

app.get("/status", (_req, res) => res.json(getWaStatus()));

app.get("/qr", async (_req, res) => {
  const qr = await getQrDataUrl();
  const s = getWaStatus();

  if (s.status === "connected") {
    return res.send(`
      <html><body style="font-family:Arial;text-align:center;margin:50px">
        <h2>🟢 WhatsApp Connected</h2>
        <p>Bot sudah terhubung.</p>
        <p><a href="/qr">Refresh</a></p>
      </body></html>
    `);
  }

  if (!qr) {
    return res.send(`
      <html><body style="font-family:Arial;text-align:center;margin:50px">
        <h2>⏳ Menunggu QR...</h2>
        <p>Refresh halaman dalam beberapa detik.</p>
        <meta http-equiv="refresh" content="3">
      </body></html>
    `);
  }

  res.send(`
    <html><body style="font-family:Arial;text-align:center;margin:30px">
      <h2>📱 Scan QR WhatsApp</h2>
      <p>WhatsApp → Linked Devices → Link a device</p>
      <img src="${qr}" style="width:360px;max-width:90%;image-rendering:auto">
      <p>Status: ${s.status}</p>
      <meta http-equiv="refresh" content="8">
    </body></html>
  `);
});

app.listen(config.port, async () => {
  console.log(`Web server on :${config.port}`);
  await startWhatsApp();
});
