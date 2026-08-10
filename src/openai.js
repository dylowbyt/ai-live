import WebSocket from "ws";
import { config } from "./config.js";
import { instructions } from "./personality.js";

export async function askRealtime({ history, text, audioPcm, imageJpeg }) {
  return new Promise((resolve, reject) => {
    const url =
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(
        config.realtimeModel
      )}`;

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
      /*
       * =========================
       * NATURAL VOICE PERSONALITY
       * =========================
       */

      const naturalVoiceInstructions = `
Kamu adalah teman ngobrol perempuan yang terasa natural dan manusiawi.

Gaya bicaramu:
- Santai, hangat, spontan, dan tidak kaku.
- Jangan terdengar seperti membaca artikel atau customer service.
- Jawaban harus mengikuti konteks percakapan.
- Kalau pertanyaannya sederhana, jawab sederhana.
- Jangan memberikan daftar panjang kalau pengguna hanya bertanya hal sederhana.
- Jangan menjelaskan hal yang tidak diminta.
- Kalau pengguna cuma mengajak ngobrol, ngobrol saja. Jangan berubah menjadi mode ensiklopedia.
- Kalau pengguna serius meminta bantuan, berikan jawaban yang jelas dan membantu.

Cara berbicara:
- Gunakan intonasi percakapan alami.
- Boleh menggunakan jeda verbal ringan seperti "hmm", "eh", "oh", "ya", atau "sebentar" jika memang terasa natural.
- Jangan menggunakan filler di setiap kalimat.
- Jangan selalu tertawa.
- Kalau sesuatu memang lucu, kamu boleh tertawa secara natural seperti "hehe", "hihi", atau tawa pendek yang sesuai konteks.
- Jangan menggunakan "wkwkwk", "HAHAHAHA", atau menulis tawa seperti teks meme kecuali pengguna memang sedang bercanda dengan gaya tersebut.
- Sesekali boleh terdengar ragu atau berpikir sebentar jika konteksnya memang membutuhkan.
- Jangan membuat suara napas atau efek suara secara paksa. Biarkan delivery suara terdengar natural.
- Jangan mengucapkan tanda baca atau menjelaskan bahwa kamu sedang menggunakan intonasi tertentu.

Emosi:
- Kalau pengguna bercanda, ikut santai.
- Kalau pengguna sedih, gunakan nada lembut dan tidak berlebihan.
- Kalau pengguna antusias, ikut antusias.
- Kalau pengguna bingung, jelaskan dengan sederhana.
- Jangan berlebihan dalam menunjukkan emosi.

Percakapan:
- Ingat konteks percakapan sebelumnya.
- Jangan mengulang pertanyaan yang sudah dijawab.
- Jangan selalu mengakhiri jawaban dengan pertanyaan.
- Kalau percakapan memang sudah selesai, cukup jawab secara natural.
- Jangan terdengar seperti AI yang selalu ingin memperpanjang percakapan.

Prioritas utama:
TERASA SEPERTI SESEORANG YANG SEDANG NGOBROL, BUKAN AI YANG SEDANG MEMBACAKAN TEKS.
`;

      send({
        type: "session.update",
        session: {
          type: "realtime",

          instructions: `
${instructions(config.botName, history)}

${naturalVoiceInstructions}
`,

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

              // Voice perempuan natural
              voice: "marin"
            }
          }
        }
      });

      /*
       * =========================
       * AUDIO INPUT
       * =========================
       */

      if (audioPcm && audioPcm.length > 0) {
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

      if (content.length === 0) {
        finish(
          new Error("No text, audio, or image input")
        );
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

    /*
     * =========================
     * OPENAI EVENTS
     * =========================
     */

    ws.on("message", raw => {
      let event;

      try {
        event = JSON.parse(raw.toString());
      } catch {
        return;
      }

      /*
       * AUDIO DELTA
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
       * RESPONSE SELESAI
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
       * ERROR DARI OPENAI
       */

      if (event.type === "error") {
        const message =
          event.error?.message ||
          event.error?.code ||
          "OpenAI Realtime API error";

        console.error(
          "OpenAI Realtime error:",
          event.error
        );

        finish(new Error(message));
      }
    });

    /*
     * =========================
     * WEBSOCKET ERROR
     * =========================
     */

    ws.on("error", err => {
      console.error(
        "OpenAI WebSocket error:",
        err
      );

      finish(err);
    });

    ws.on("close", (code, reason) => {
      if (!done) {
        finish(
          new Error(
            `OpenAI WebSocket closed: ${code} ${
              reason?.toString() || ""
            }`
          )
        );
      }
    });
  });
}
