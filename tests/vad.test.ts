import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createVadGate, type VadGate } from "@/lib/voice/vad";

function makeFrame(samples: number, amplitude: number): Float32Array {
  const frame = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    frame[i] = amplitude * Math.sin((2 * Math.PI * 440 * i) / 16000);
  }
  return frame;
}

function makeSilence(samples: number): Float32Array {
  return new Float32Array(samples).fill(0.001);
}

function makeSpeech(samples: number): Float32Array {
  // amplitude 0.04 -> RMS ~0.028, well above default 0.015 start threshold
  return makeFrame(samples, 0.04);
}

function makeQuiet(samples: number): Float32Array {
  // amplitude 0.006 -> RMS ~0.0042, below default 0.010 end threshold
  return makeFrame(samples, 0.006);
}

describe("createVadGate", () => {
  let gate: VadGate;
  const onSpeechEnd = vi.fn<() => void>();
  const onSilenceTimeout = vi.fn<() => void>();

  beforeEach(() => {
    vi.useFakeTimers();
    onSpeechEnd.mockClear();
    onSilenceTimeout.mockClear();
    gate = createVadGate(16000, 4096, { onSpeechEnd, onSilenceTimeout });
  });

  afterEach(() => {
    gate.destroy();
    vi.useRealTimers();
  });

  it("returns null for silence frames", () => {
    const pcm = gate.process(makeSilence(4096));
    expect(pcm).toBeNull();
  });

  it("returns PCM for speech frames", () => {
    const pcm = gate.process(makeSpeech(4096));
    expect(pcm).not.toBeNull();
    expect(pcm!.length).toBe(1);
    expect(pcm![0]).toBeInstanceOf(ArrayBuffer);
    expect(pcm![0].byteLength).toBe(4096 * 2); // Int16
  });

  it("transitions silence -> speaking on loud frame, includes pre-roll", () => {
    // Fill pre-roll buffer with 3 silence frames
    for (let i = 0; i < 3; i++) {
      expect(gate.process(makeSilence(4096))).toBeNull();
    }
    // 4th frame is speech - should flush pre-roll (3 silence + 1 speech = 4 frames)
    const pcms = gate.process(makeSpeech(4096));
    expect(pcms).not.toBeNull();
    expect(pcms!.length).toBe(4); // 3 pre-roll + 1 current
    for (const pcm of pcms!) {
      expect(pcm.byteLength).toBe(4096 * 2);
    }
  });

  it("stays in speaking while loud frames continue", () => {
    gate.process(makeSpeech(4096)); // silence -> speaking
    // More speech frames - each returns exactly 1 frame
    for (let i = 0; i < 5; i++) {
      const pcms = gate.process(makeSpeech(4096));
      expect(pcms).not.toBeNull();
      expect(pcms!.length).toBe(1);
    }
  });

  it("enters trail on quiet frame, still forwards audio", () => {
    gate.process(makeSpeech(4096)); // silence -> speaking
    // Quiet frame below SPEECH_END threshold -> trail
    const pcms = gate.process(makeQuiet(4096));
    expect(pcms).not.toBeNull();
    expect(pcms!.length).toBe(1);
  });

  it("returns to speaking from trail if loud frame arrives before hold expires", () => {
    gate.process(makeSpeech(4096)); // silence -> speaking
    gate.process(makeQuiet(4096));  // speaking -> trail

    vi.advanceTimersByTime(300); // within 700ms hold

    // Loud frame before hold expires -> back to speaking
    const pcms = gate.process(makeSpeech(4096));
    expect(pcms).not.toBeNull();
    expect(pcms!.length).toBe(1);
    expect(onSpeechEnd).not.toHaveBeenCalled();
  });

  it("fires onSpeechEnd when trail hold expires", () => {
    gate.process(makeSpeech(4096)); // silence -> speaking
    gate.process(makeQuiet(4096));  // speaking -> trail

    vi.advanceTimersByTime(701); // past 700ms hold

    const pcms = gate.process(makeQuiet(4096));
    expect(pcms).not.toBeNull();
    expect(pcms!.length).toBe(1); // still forwards this frame
    expect(onSpeechEnd).toHaveBeenCalledOnce();
  });

  it("returns to silence after trail hold expires and onSpeechEnd fires", () => {
    gate.process(makeSpeech(4096)); // silence -> speaking
    gate.process(makeQuiet(4096));  // speaking -> trail

    vi.advanceTimersByTime(701);
    gate.process(makeQuiet(4096));  // trail -> silence, fires onSpeechEnd
    expect(onSpeechEnd).toHaveBeenCalledOnce();

    // Next quiet frame -> silence state, returns null
    const pcms = gate.process(makeQuiet(4096));
    expect(pcms).toBeNull();
  });

  it("reset returns to silence state", () => {
    gate.process(makeSpeech(4096)); // speaking
    gate.reset();
    // After reset, should be in silence
    expect(gate.process(makeQuiet(4096))).toBeNull();
  });

  it("reset clears pre-roll buffer", () => {
    // Fill pre-roll with silence
    for (let i = 0; i < 3; i++) {
      gate.process(makeSilence(4096));
    }
    gate.reset();
    // Fresh start - new speech should only have current frame (no stale pre-roll)
    const pcms = gate.process(makeSpeech(4096));
    expect(pcms!.length).toBe(1); // only current frame, pre-roll was cleared
  });

  it("onSilenceTimeout fires once after silenceTimeoutMs of continuous silence", () => {
    vi.advanceTimersByTime(1); // kick Date.now() above 0
    expect(gate.process(makeSilence(4096))).toBeNull(); // sets silenceStart
    expect(onSilenceTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(8001); // total ~8002 > 8000 threshold
    expect(gate.process(makeSilence(4096))).toBeNull();
    expect(onSilenceTimeout).toHaveBeenCalledOnce();
  });

  it("onSilenceTimeout does not fire after destroy", () => {
    vi.advanceTimersByTime(1);
    gate.process(makeSilence(4096));
    vi.advanceTimersByTime(8001);
    gate.process(makeSilence(4096));
    expect(onSilenceTimeout).toHaveBeenCalledOnce();

    gate.destroy();
    vi.advanceTimersByTime(8001);
    gate.process(makeSilence(4096));
    expect(onSilenceTimeout).toHaveBeenCalledOnce(); // still 1
  });

  it("speech resets silence timer", () => {
    vi.advanceTimersByTime(4000);
    gate.process(makeSilence(4096));
    expect(onSilenceTimeout).not.toHaveBeenCalled();

    // User speaks briefly
    gate.process(makeSpeech(4096));
    gate.process(makeQuiet(4096));
    vi.advanceTimersByTime(701);
    gate.process(makeQuiet(4096)); // fires onSpeechEnd, back to silence
    expect(onSpeechEnd).toHaveBeenCalledOnce();

    // Silence timer restarted from trail->silence transition
    vi.advanceTimersByTime(4000);
    gate.process(makeSilence(4096));
    expect(onSilenceTimeout).not.toHaveBeenCalled();
  });

  it("destroy prevents further processing", () => {
    gate.process(makeSpeech(4096));
    gate.destroy();
    expect(gate.process(makeSpeech(4096))).toBeNull();
    expect(gate.process(makeSilence(4096))).toBeNull();
  });

  it("respects custom thresholds", () => {
    gate.destroy();
    gate = createVadGate(
      16000,
      4096,
      { onSpeechEnd, onSilenceTimeout },
      { speechStartRms: 0.05, speechEndRms: 0.03 }
    );

    // Default speech amplitude (0.04) should be below custom 0.05 start
    const pcms = gate.process(makeSpeech(4096));
    // RMS of 0.04 amplitude sine is ~0.028, below 0.05 start -> still silence
    expect(pcms).toBeNull();

    // Louder frame above 0.05 -> speaking
    const loud = makeFrame(4096, 0.08); // RMS ~0.057
    expect(gate.process(loud)).not.toBeNull();
  });

  it("preRollFrames=0 skips pre-roll", () => {
    gate.destroy();
    gate = createVadGate(
      16000,
      4096,
      { onSpeechEnd, onSilenceTimeout },
      { preRollFrames: 0 }
    );

    for (let i = 0; i < 5; i++) {
      gate.process(makeSilence(4096));
    }
    const pcms = gate.process(makeSpeech(4096));
    expect(pcms).not.toBeNull();
    expect(pcms!.length).toBe(1); // only current frame, no pre-roll
  });
});
