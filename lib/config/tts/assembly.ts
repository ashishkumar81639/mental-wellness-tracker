import type { TTSProvider } from "../types";

/**
 * Assembly AI text-to-speech.
 * Returns raw audio/mpeg bytes.
 */
export const assemblyTTS: TTSProvider = {
  name: "assembly",

  async synthesize({ text, language }) {
    const apiKey = process.env.ASSEMBLY_API_KEY;
    if (!apiKey) {
      throw new Error("ASSEMBLY_API_KEY not configured");
    }

    return fetch("https://api.assemblyai.com/v2/tts", {
      method: "POST",
      headers: {
        authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        // Assembly AI supports en-US, en-GB, hi-IN etc.
        language_code: language === "hi" ? "hi" : "en_us",
      }),
    });
  },
};
