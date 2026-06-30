import type { TTSProvider, VoiceTone } from "../types";

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
 * Uses the streaming endpoint which returns raw binary MP3 audio directly
 * (no base64, no JSON, no WAV concatenation). The response stream is piped
 * straight through to the client, so audio bytes start arriving as soon as
 * Sarvam generates them.
 *
 * Endpoint: POST /text-to-speech/stream
 * Max text: 3500 chars per request (vs 500 on the non-streaming endpoint).
 */
export const sarvamTTS: TTSProvider = {
  name: "sarvam",

  async synthesize({ text, language, tone }) {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      throw new Error("SARVAM_API_KEY not configured");
    }

    const upstream = await fetch("https://api.sarvam.ai/text-to-speech/stream", {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "bulbul:v3",
        text,
        target_language_code: language === "hi" ? "hi-IN" : "en-IN",
        speaker: "simran",
        pace: tone ? TONE_PACE[tone] : DEFAULT_PACE,
        enable_preprocessing: true,
        output_audio_codec: "mp3",
        output_audio_bitrate: "64k",
      }),
    });

    if (!upstream.ok) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: upstream.headers,
      });
    }

    // Pipe the binary audio stream straight through. The TTS route will
    // forward this to the client without buffering — audio arrives as chunks.
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=300",
      },
    });
  },
};
