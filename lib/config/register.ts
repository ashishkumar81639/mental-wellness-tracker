// Boot file: registers all voice providers into the global registries.
// Import this once at module load time (called from api routes).
// Adding a new provider: add one import + one register call here.

import { registerSTT, registerTTS } from "./registry";
import { assemblySTT } from "./stt/assembly";
import { sarvamSTT } from "./stt/sarvam";
import { assemblyTTS } from "./tts/assembly";
import { sarvamTTS } from "./tts/sarvam";

let registered = false;

export function ensureRegistered(): void {
  if (registered) return;
  registerSTT("assembly", assemblySTT);
  registerSTT("sarvam", sarvamSTT);
  registerTTS("assembly", assemblyTTS);
  registerTTS("sarvam", sarvamTTS);
  registered = true;
}
