import type { STTProvider, TTSProvider, ProviderConfig } from "./types";

const sttProviders = new Map<string, STTProvider>();
const ttsProviders = new Map<string, TTSProvider>();

export function registerSTT(name: string, provider: STTProvider): void {
  sttProviders.set(name, provider);
}

export function registerTTS(name: string, provider: TTSProvider): void {
  ttsProviders.set(name, provider);
}

export function getSTT(config: ProviderConfig): STTProvider {
  const provider = sttProviders.get(config.stt);
  if (!provider) throw new Error(`Unknown STT provider: ${config.stt}`);
  return provider;
}

export function getTTS(config: ProviderConfig): TTSProvider {
  const provider = ttsProviders.get(config.tts);
  if (!provider) throw new Error(`Unknown TTS provider: ${config.tts}`);
  return provider;
}

export function providerConfig(): ProviderConfig {
  return {
    stt: process.env.STT_PROVIDER || "assembly",
    tts: process.env.TTS_PROVIDER || "assembly",
  };
}

/** True if at least one voice provider has a key configured. */
export function voiceConfigured(): boolean {
  return !!(process.env.ASSEMBLY_API_KEY || process.env.SARVAM_API_KEY);
}
