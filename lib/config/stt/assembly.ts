import type { STTProvider, SttConfig } from "../types";

/**
 * Assembly AI real-time STT via temporary WebSocket token (v3).
 * Browser opens wss://streaming.assemblyai.com/v3/ws directly.
 * API key never leaves the server.
 *
 * v3 requires sample_rate as a URL query param alongside the token.
 * Audio is sent as raw Int16Array PCM binary frames (not base64 JSON).
 * Incoming messages use type "Turn" with field "transcript".
 */
export const assemblySTT: STTProvider = {
  name: "assembly",

  async getStreamConfig(): Promise<SttConfig> {
    const apiKey = process.env.ASSEMBLY_API_KEY;
    if (!apiKey) {
      throw new Error("ASSEMBLY_API_KEY not configured");
    }

    // v3: GET request with query param
    const url = new URL("https://streaming.assemblyai.com/v3/token");
    url.searchParams.set("expires_in_seconds", "300");

    const res = await fetch(url.toString(), {
      headers: {
        authorization: apiKey,
      },
    });

    if (!res.ok) {
      console.error(
        `[assembly-stt] token fetch failed: ${res.status}`,
        await res.text().catch(() => "")
      );
      throw new Error(`Assembly AI token request failed: ${res.status}`);
    }

    const data = (await res.json()) as { token: string };
    return {
      type: "ws-token",
      token: data.token,
      wsUrl: "wss://streaming.assemblyai.com/v3/ws",
      sampleRate: 16000,
    };
  },
};
