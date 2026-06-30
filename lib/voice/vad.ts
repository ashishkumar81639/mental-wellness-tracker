/**
 * Voice Activity Detection (VAD) gate for Assembly AI streaming.
 *
 * State machine that forwards audio frames to Assembly only when the user is
 * actually speaking. Silence is never sent, which cuts billing by 70-90%.
 *
 * The gate runs inside `onaudioprocess` (audio thread), so `process()` is
 * synchronous. Timers (trail hold, silence timeout) are tracked via
 * `performance.now()` rather than `setTimeout` so no async scheduling is
 * needed inside the audio callback.
 */

export interface VadConfig {
  /** RMS threshold to enter `speaking` state. Default 0.015 (~ -36 dBFS). */
  speechStartRms?: number;
  /** RMS threshold to leave `speaking` state (hysteresis). Default 0.010. */
  speechEndRms?: number;
  /** How long to keep forwarding after speech drops below threshold. Default 700ms. */
  trailHoldMs?: number;
  /** Auto-pause if nobody speaks for this long. Default 8000ms. */
  silenceTimeoutMs?: number;
  /** Number of PCM frames to buffer so the first word isn't clipped. Default 3. */
  preRollFrames?: number;
}

export interface VadCallbacks {
  /** Speech ended (trail hold expired). The accumulated transcript is ready. */
  onSpeechEnd: () => void;
  /** Nobody spoke for silenceTimeoutMs. Teardown the session. */
  onSilenceTimeout: () => void;
}

export interface VadGate {
  /**
   * Process one audio frame. Returns PCM buffers to send over WS, or null
   * if this frame is silence. On a silence->speaking transition, returns
   * multiple frames (pre-roll + current).
   */
  process(input: Float32Array): ArrayBuffer[] | null;
  /** Reset to silence state. Call at the start of each turn. */
  reset(): void;
  /** Release and prevent further use. */
  destroy(): void;
}

type VadState = "silence" | "speaking" | "trail";

const DEFAULTS: Required<VadConfig> = {
  speechStartRms: 0.015,
  speechEndRms: 0.010,
  trailHoldMs: 700,
  silenceTimeoutMs: 8000,
  preRollFrames: 3,
};

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

function float32ToPCM(float32: Float32Array): ArrayBuffer {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}

export function createVadGate(
  sampleRate: number,
  frameSize: number,
  callbacks: VadCallbacks,
  config?: VadConfig
): VadGate {
  const cfg = { ...DEFAULTS, ...config };

  let state: VadState = "silence";
  let destroyed = false;

  // Circular pre-roll buffer: stores PCM frames collected during silence so
  // the onset of speech is not clipped when we transition to speaking.
  const preRollMax = cfg.preRollFrames;
  const preRoll: (ArrayBuffer | undefined)[] =
    preRollMax > 0 ? new Array(preRollMax) : [];
  let preRollWrite = 0;
  let preRollCount = 0;

  let trailHoldStart = 0;
  let silenceStart = 0; // set on first silence frame after reset

  function now(): number {
    return Date.now();
  }

  function storePreRoll(pcm: ArrayBuffer): void {
    if (preRollMax === 0) return;
    preRoll[preRollWrite] = pcm;
    preRollWrite = (preRollWrite + 1) % preRollMax;
    if (preRollCount < preRollMax) preRollCount++;
  }

  function flushPreRoll(): ArrayBuffer[] {
    if (preRollMax === 0 || preRollCount === 0) return [];
    const frames: ArrayBuffer[] = [];
    // Read in chronological order (oldest first)
    const start =
      preRollCount < preRollMax ? 0 : preRollWrite;
    for (let i = 0; i < preRollCount; i++) {
      const idx = (start + i) % preRollMax;
      const pcm = preRoll[idx];
      if (pcm) frames.push(pcm);
      preRoll[idx] = undefined;
    }
    preRollCount = 0;
    return frames;
  }

  return {
    process(input: Float32Array): ArrayBuffer[] | null {
      if (destroyed) return null;

      const energy = rms(input);
      const currentPcm = float32ToPCM(input);

      // --- silence state: accumulate pre-roll, watch for speech or timeout ---
      if (state === "silence") {
        if (energy > cfg.speechStartRms) {
          state = "speaking";
          // Flush pre-roll (frames from BEFORE this one), then add the
          // current speech frame that triggered the transition.
          const pre = flushPreRoll();
          pre.push(currentPcm);
          return pre.length > 0 ? pre : null;
        }

        storePreRoll(currentPcm); // buffer silence in case speech starts soon

        // Track how long we've been silent
        if (silenceStart === 0) silenceStart = now();
        if (now() - silenceStart > cfg.silenceTimeoutMs) {
          silenceStart = now(); // prevent re-fire
          callbacks.onSilenceTimeout();
        }
        return null;
      }

      // --- speaking state: forward every frame; exit on silence ---
      if (state === "speaking") {
        if (energy < cfg.speechEndRms) {
          state = "trail";
          trailHoldStart = now();
        }
        return [currentPcm];
      }

      // --- trail state: forward but watch for resume or timeout ---
      // state === "trail"
      if (energy > cfg.speechStartRms) {
        state = "speaking";
        return [currentPcm];
      }
      if (now() - trailHoldStart > cfg.trailHoldMs) {
        state = "silence";
        silenceStart = now();
        callbacks.onSpeechEnd();
      }
      return [currentPcm];
    },

    reset(): void {
      state = "silence";
      silenceStart = 0;
      preRollCount = 0;
    },

    destroy(): void {
      destroyed = true;
      state = "silence";
      preRollCount = 0;
    },
  };
}
