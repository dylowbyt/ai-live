import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 3000),
  openaiKey: process.env.OPENAI_API_KEY,
  realtimeModel: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1",
  botName: process.env.BOT_NAME || "Raka",
  maxHistory: Number(process.env.MAX_HISTORY || 12),
  authDir: process.env.AUTH_DIR || "./auth"
};

if (!config.openaiKey) throw new Error("OPENAI_API_KEY is required");
