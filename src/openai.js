import WebSocket from "ws";
import { config } from "./config.js";
import { instructions } from "./personality.js";

export async function askRealtime({ history, text, audioPcm, imageJpeg }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(config.realtimeModel)}`,
      { headers: { Authorization: `Bearer ${config.openaiKey}`, "OpenAI-Beta": "realtime=v1" } }
    );

    const audio = [];
    let done = false;
    const timer = setTimeout(() => finish(new Error("OpenAI timeout")), 120000);

    function finish(err, result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      err ? reject(err) : resolve(result);
    }

    function send(e) { ws.send(JSON.stringify(e)); }

    ws.on("open", () => {
      send({
        type: "session.update",
        session: {
          type: "realtime",
          instructions: instructions(config.botName, history),
          output_modalities: ["audio"],
          audio: {
            input: { format: { type: "audio/pcm", rate: 24000 } },
            output: { format: { type: "audio/pcm", rate: 24000 }, voice: "marin" }
          },
          turn_detection: null
        }
      });

      if (audioPcm) {
        for (let i = 0; i < audioPcm.length; i += 48000) {
          send({ type: "input_audio_buffer.append", audio: audioPcm.subarray(i, i+48000).toString("base64") });
        }
        send({ type: "input_audio_buffer.commit" });
        send({ type: "response.create", response: { output_modalities: ["audio"] } });
        return;
      }

      const content = [];
      if (text) content.push({ type: "input_text", text });
      if (imageJpeg) content.push({
        type: "input_image",
        image_url: `data:image/jpeg;base64,${imageJpeg.toString("base64")}`
      });

      send({
        type: "conversation.item.create",
        item: { type: "message", role: "user", content }
      });
      send({ type: "response.create", response: { output_modalities: ["audio"] } });
    });

    ws.on("message", raw => {
      let e;
      try { e = JSON.parse(raw.toString()); } catch { return; }

      if (e.type === "response.output_audio.delta" || e.type === "response.audio.delta") {
        if (e.delta) audio.push(Buffer.from(e.delta, "base64"));
      }
      if (e.type === "response.done" || e.type === "response.completed") {
        finish(null, { audioPcm: Buffer.concat(audio) });
      }
      if (e.type === "error") finish(new Error(e.error?.message || "Realtime API error"));
    });

    ws.on("error", err => finish(err));
  });
}