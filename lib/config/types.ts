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

/**
 * Emotional tone for spoken delivery. The companion tags each reply with one of
 * these; providers map it to whatever expressive controls they support (Sarvam
 * bulbul:v3 only has pace, so it maps tone -> speaking speed).
 */
export type VoiceTone =
  | "warm"
  | "gentle"
  | "calm"
  | "encouraging"
  | "cheerful"
  | "serious"
  | "sad";

export const VOICE_TONES: readonly VoiceTone[] = [
  "warm",
  "gentle",
  "calm",
  "encouraging",
  "cheerful",
  "serious",
  "sad",
];

export interface TTSProvider {
  readonly name: string;
  synthesize(params: {
    text: string;
    language: "en" | "hi";
    tone?: VoiceTone;
  }): Promise<Response>;
}

export interface ProviderConfig {
  stt: string;
  tts: string;
}
