// Voice provider interfaces. One interface per capability (STT, TTS).
// Adding a new provider = implement the interface + register it in register.ts.

export interface STTProvider {
  readonly name: string;
  /** Returns streaming config. Assembly AI: WS token. Sarvam: relay endpoint. */
  getStreamConfig(): Promise<SttConfig>;
}

export type SttConfig =
  | { type: "ws-token"; token: string; wsUrl: string; sampleRate: number }
  | { type: "relay"; endpoint: string; headers: Record<string, string> };

export interface TTSProvider {
  readonly name: string;
  synthesize(params: {
    text: string;
    language: "en" | "hi";
  }): Promise<Response>;
}

export interface ProviderConfig {
  stt: string;
  tts: string;
}
