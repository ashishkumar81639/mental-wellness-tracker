import type { TTSProvider } from "../types";
import { splitForSpeech } from "@/lib/voice/speech-text";

/**
 * Sarvam TTS - warm Indian voice, good Hindi/English code-mixed quality.
 * Currently uses the male "shubh" speaker on bulbul:v3.
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
        // bulbul:v3 is the warmest/least synthetic model and hosts the "shubh"
        // male voice. Note: v3 rejects `pitch`/`loudness` — do not add them.
        model: "bulbul:v3",
        // Sarvam caps each input string at 500 chars; longer replies are split
        // here and Sarvam concatenates the clips into a single audio response.
        inputs: splitForSpeech(text, 500),
        target_language_code: language === "hi" ? "hi-IN" : "en-IN",
        speaker: "shubh",
        // Slightly slower than 1.0 reads as more empathetic, less clipped.
        pace: 0.9,
        // Normalizes numbers, abbreviations and code-mixed Hindi/English so the
        // delivery sounds natural rather than spelled-out.
        enable_preprocessing: true,
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
