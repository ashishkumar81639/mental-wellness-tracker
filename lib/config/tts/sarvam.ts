import type { TTSProvider, VoiceTone } from "../types";
import { splitForSpeech } from "@/lib/voice/speech-text";

/**
 * Maps an emotional tone to a speaking pace. bulbul:v3 only exposes `pace`
 * (no pitch/loudness), so speed is the lever: sombre tones slow down, upbeat
 * tones speed up slightly. Range kept tight (0.8–1.05) so it stays natural.
 */
const TONE_PACE: Record<VoiceTone, number> = {
  sad: 0.8,
  gentle: 0.85,
  calm: 0.85,
  serious: 0.88,
  warm: 0.9,
  encouraging: 0.95,
  cheerful: 1.05,
};
const DEFAULT_PACE = 0.9;

/**
 * Sarvam TTS - warm Indian voice, good Hindi/English code-mixed quality.
 * Currently uses the "simran" speaker on bulbul:v3.
 * Sarvam returns JSON with base64-encoded WAV audio in an "audios" array.
 * We decode it and return as binary audio/wav stream.
 */
export const sarvamTTS: TTSProvider = {
  name: "sarvam",

  async synthesize({ text, language, tone }) {
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
        // bulbul:v3 is the warmest/least synthetic model and hosts the "simran"
        // voice. Note: v3 rejects `pitch`/`loudness` — do not add them.
        model: "bulbul:v3",
        // Sarvam caps each input string at 500 chars; longer replies are split
        // here and Sarvam concatenates the clips into a single audio response.
        inputs: splitForSpeech(text, 500),
        target_language_code: language === "hi" ? "hi-IN" : "en-IN",
        speaker: "simran",
        // Pace carries the emotion (v3's only prosody lever). Default is a touch
        // slower than 1.0, which reads as more empathetic and less clipped.
        pace: tone ? TONE_PACE[tone] : DEFAULT_PACE,
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
