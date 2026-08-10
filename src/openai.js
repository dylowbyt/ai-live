import WebSocket from "ws";
import { config } from "./config.js";
import { instructions } from "./personality.js";

export async function askRealtime({ history, text, audioPcm, imageJpeg }) {
  return new Promise((resolve, reject) => {
    const url =
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(config.realtimeModel)}`;

    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${config.openaiKey}`
      }
    });

    const audio = [];
    let done = false;

    const timer = setTimeout(() => {
      finish(new Error("OpenAI Realtime timeout"));
    }, 120000);

    function finish(err, result) {
      if (done) return;

      done = true;
      clearTimeout(timer);

      try {
        ws.close();
      } catch {}

      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    }

    function send(event) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(event));
      }
    }

    ws.on("open", () => {
      // Realtime GA session configuration
      send({
        type: "session.update",
        session: {
          type: "realtime",

          instructions: instructions(
            config.botName,
            history
          ),

          output_modalities: ["audio"],

          audio: {
            input: {
              format: {
                type: "audio/pcm",
                rate: 24000
              }
            },
            output: {
              format: {
                type: "audio/pcm",
                rate: 24000
              },
              voice: "marin"
            }
          },

          turn_detection: null
        }
      });

      /*
       * =========================
       * AUDIO INPUT
       * =========================
       */

      if (audioPcm && audioPcm.length > 0) {
        // Kirim PCM dalam chunk
        const CHUNK_SIZE = 48000;

        for (
          let i = 0;
          i < audioPcm.length;
          i += CHUNK_SIZE
        ) {
          const chunk = audioPcm.subarray(
            i,
            Math.min(i + CHUNK_SIZE, audioPcm.length)
          );

          send({
            type: "input_audio_buffer.append",
            audio: chunk.toString("base64")
          });
        }

        send({
          type: "input_audio_buffer.commit"
        });

        send({
          type: "response.create",
          response: {
            output_modalities: ["audio"]
          }
        });

        return;
      }

      /*
       * =========================
       * TEXT / IMAGE INPUT
       * =========================
       */

      const content = [];

      if (text && text.trim()) {
        content.push({
          type: "input_text",
          text: text.trim()
        });
      }

      if (imageJpeg && imageJpeg.length > 0) {
        content.push({
          type: "input_image",
          image_url:
            `data:image/jpeg;base64,${imageJpeg.toString("base64")}`
        });
      }

      // Jangan kirim message kosong
      if (content.length === 0) {
        finish(new Error("No text, audio, or image input"));
        return;
      }

      send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content
        }
      });

      send({
        type: "response.create",
        response: {
          output_modalities: ["audio"]
        }
      });
    });

    ws.on("message", raw => {
      let event;

      try {
        event = JSON.parse(raw.toString());
      } catch {
        return;
      }

      /*
       * =========================
       * AUDIO OUTPUT
       * =========================
       */

      if (
        event.type === "response.output_audio.delta" ||
        event.type === "response.audio.delta"
      ) {
        if (event.delta) {
          audio.push(
            Buffer.from(event.delta, "base64")
          );
        }
      }

      /*
       * =========================
       * RESPONSE FINISHED
       * =========================
       */

      if (
        event.type === "response.done" ||
        event.type === "response.completed"
      ) {
        finish(null, {
          audioPcm: Buffer.concat(audio)
        });
      }

      /*
       * =========================
       * API ERROR
       * =========================
       */

      if (event.type === "error") {
        const message =
          event.error?.message ||
          event.error?.code ||
          "OpenAI Realtime API error";

        finish(new Error(message));
      }
    });

    ws.on("error", err => {
      finish(err);
    });

    ws.on("close", (code, reason) => {
      if (!done) {
        finish(
          new Error(
            `OpenAI WebSocket closed: ${code} ${reason?.toString() || ""}`
          )
        );
      }
    });
  });
}
