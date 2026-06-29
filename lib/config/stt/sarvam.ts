import type { STTProvider, SttConfig } from "../types";

/**
 * Sarvam STT via server relay.
 * Browser sends audio to our /api/talk/stt-stream endpoint,
 * which relays to Sarvam and streams back the transcript.
 *
 * sprint: Sarvam STT is HTTP POST (blocking). Upgrade to Sarvam streaming
 * WebSocket when their real-time API becomes available.
 */
export const sarvamSTT: STTProvider = {
  name: "sarvam",

  async getStreamConfig(): Promise<SttConfig> {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      throw new Error("SARVAM_API_KEY not configured");
    }

    return {
      type: "relay",
      endpoint: "/api/talk/stt-stream",
      headers: {
        "Content-Type": "audio/wav",
      },
    };
  },
};
