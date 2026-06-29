import type { TTSProvider } from "../types";

/**
 * Sarvam TTS - best Hindi quality with warm Indian voice (Anushka).
 * Sarvam returns JSON with base64-encoded WAV audio in an "audios" array.
 * We decode it and return as binary audio/wav stream.
 */
export const sarvamTTS: TTSProvider = {
  name: "sarvam",

  async synthesize({ text, language }) {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      throw new Error("SARVAM_API_KEY not configured");
    }

    const upstream = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: [text],
        target_language_code: language === "hi" ? "hi-IN" : "en-IN",
        speaker: "anushka",
        pace: 1.0,
        loudness: 1.0,
      }),
    });

    if (!upstream.ok) {
      // Pass through the upstream error so the route handler can log and return 503
      return new Response(upstream.body, {
        status: upstream.status,
        headers: upstream.headers,
      });
    }

    const data = (await upstream.json()) as {
      audios?: string[];
    };

    if (!data.audios || data.audios.length === 0) {
      return new Response(null, { status: 502, statusText: "Empty audio from TTS" });
    }

    const wavBuffer = Buffer.from(data.audios[0], "base64");

    return new Response(wavBuffer, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(wavBuffer.length),
      },
    });
  },
};
