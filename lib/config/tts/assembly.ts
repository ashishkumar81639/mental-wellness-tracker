import type { TTSProvider } from "../types";

/**
 * Assembly AI standalone TTS.
 * DEPRECATED: The v2 TTS endpoint is no longer available.
 * Assembly AI now bundles TTS into their Voice Agent API (wss://agents.assemblyai.com/v1/ws,
 * $4.50/hr all-inclusive). For standalone TTS, use Sarvam or a dedicated TTS provider.
 * sprint: Assembly AI TTS v2 endpoint removed. Use Sarvam TTS or evaluate ElevenLabs.
 */
export const assemblyTTS: TTSProvider = {
  name: "assembly",

  async synthesize() {
    throw new Error(
      "Assembly AI standalone TTS is not available. Set TTS_PROVIDER=sarvam in .env or configure a dedicated TTS provider."
    );
  },
};
