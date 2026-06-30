# VAD Design - Voice Activity Detection for Yaar

## Problem

Assembly AI bills by audio duration *received over the WebSocket*, not by
connection time. Today the `onaudioprocess` callback in
`lib/voice/use-voice-conversation.ts:404-410` forwards every frame to Assembly
while `phase === "listening"`, including silence and background noise.

A 5-minute voice session where the user speaks for 30 seconds still bills for
5 minutes of audio. We need to gate frames on the client so only speech is
forwarded.

## Goal

Forward audio to Assembly **only when the user is actually speaking**.
Keep latency under 300ms from first-word-start to first frame sent.
Zero dependency on external VAD libraries - Web Audio API only.

---

## Architecture

```
  Mic ──> ScriptProcessor ──> AnalyserNode ──> RMS check ──> Gate ──> WS.send(PCM)
                                    │
                                    └──> always connected, never sends to WS
```

The gate is a state machine with three states: `silence`, `speaking`,
`trail`. It runs inside `onaudioprocess` (the audio thread), so it must be
allocation-free and synchronous.

### Where it lives

One new file: `lib/voice/vad.ts`.

The hook `use-voice-conversation.ts` imports it and wires it into the
existing `onaudioprocess` callback. No other files change.

---

## The VAD state machine

```
                 RMS > SPEECH_START
  silence ─────────────────────────> speaking
     ^                                   │
     │                                   │ RMS < SPEECH_END
     │                                   v
     │                              trail (hold for N ms)
     │                                   │
     │              ┌────────────────────┤
     │              │ RMS > SPEECH_START │ timeout (N ms)
     │              v                    │
     │           speaking                v
     └────────────────────────────── silence
```

### States

| State | Forward to WS? | Meaning |
|-------|:-:|---------|
| `silence` | no | mic is open but nobody is talking |
| `speaking` | yes | user is talking, send every frame |
| `trail` | yes | user *might* have paused mid-sentence, hold audio briefly in case they resume |

### Transitions

1. `silence -> speaking`: RMS exceeds `SPEECH_START` threshold.
   Immediately flush any buffered pre-roll (see below) and start forwarding.
2. `speaking -> trail`: RMS drops below `SPEECH_END` threshold.
   Start a hold timer. Keep forwarding audio during the hold.
3. `trail -> speaking`: RMS exceeds `SPEECH_START` again.
   Cancel the hold timer, back to speaking.
4. `trail -> silence`: hold timer expires.
   Emit a synthetic `end_of_turn` signal so the hook can fire `runTurn`.

### Constants

```ts
const SPEECH_START_RMS = 0.015;  // ~ -36 dBFS. Tunable.
const SPEECH_END_RMS   = 0.010;  // Hysteresis: lower than start.
const TRAIL_HOLD_MS    = 700;   // How long to hold after speech ends.
const SILENCE_TIMEOUT_MS = 8000; // Auto-pause if nobody speaks for 8s.
const PRE_ROLL_FRAMES   = 3;    // Buffer last 3 frames (~370ms at 4096/16k).
```

Hysteresis (`SPEECH_END` < `SPEECH_START`) prevents rapid toggling at the
boundary. The values above are starting points - see Tuning below.

### Pre-roll buffer

When the gate transitions `silence -> speaking`, the first few words are
already in the buffer that was *not* sent. To avoid clipping the start of
speech, keep a circular buffer of the last `PRE_ROLL_FRAMES` PCM frames.
On `silence -> speaking`, flush those frames to the WS *before* the current
frame.

At 4096 samples / 16kHz, one frame = 256ms. 3 frames = ~750ms of pre-roll,
which covers the gap between the RMS crossing threshold and the actual word
start.

---

## API

```ts
// lib/voice/vad.ts

export interface VadConfig {
  speechStartRms?: number;
  speechEndRms?: number;
  trailHoldMs?: number;
  silenceTimeoutMs?: number;
  preRollFrames?: number;
}

export interface VadCallbacks {
  /** Called when speech ends (trail hold expires). The accumulated transcript
   *  is ready for the LLM. This replaces Assembly's `end_of_turn`. */
  onSpeechEnd: () => void;
  /** Called when no speech detected for silenceTimeoutMs. Auto-pause. */
  onSilenceTimeout: () => void;
}

export interface VadGate {
  /** Process one audio frame. Returns the PCM to send (may be empty).
   *  Called from onaudioprocess - must be synchronous, no allocations. */
  process(input: Float32Array): ArrayBuffer | null;
  /** Reset to silence state (e.g. after a turn completes). */
  reset(): void;
  /** Release resources. */
  destroy(): void;
}

export function createVadGate(
  sampleRate: number,
  frameSize: number,
  callbacks: VadCallbacks,
  config?: VadConfig
): VadGate;
```

### Why `onSpeechEnd` replaces Assembly's `end_of_turn`

Assembly v3 has its own `end_of_turn` detection, but it only fires *after*
receiving enough silence - silence we are now *not sending*. So we must
emit our own turn boundary. The VAD gate fires `onSpeechEnd` when the trail
hold expires, which is exactly when Assembly would have fired it.

---

## Integration into `use-voice-conversation.ts`

### 1. Create the gate when the WS opens

In `openSession` (line ~399), after creating the `ScriptProcessor`:

```ts
const vadGate = createVadGate(
  cfg.sampleRate,
  4096,
  {
    onSpeechEnd: () => {
      const transcript = transcriptRef.current.trim();
      if (transcript && phaseRef.current === "listening") {
        void runTurn(transcript);
      }
    },
    onSilenceTimeout: () => {
      setPhase("idle");  // or a new "paused" phase
      teardown();
    },
  },
);
vadGateRef.current = vadGate;
```

### 2. Replace the `onaudioprocess` body

Current (line 404-410):
```ts
processor.onaudioprocess = (e) => {
  if (phaseRef.current !== "listening") return;
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(floatTo16BitPCM(e.inputBuffer.getChannelData(0)));
};
```

New:
```ts
processor.onaudioprocess = (e) => {
  if (phaseRef.current !== "listening") return;
  if (ws.readyState !== WebSocket.OPEN) return;
  const pcm = vadGate.process(e.inputBuffer.getChannelData(0));
  if (pcm) ws.send(pcm);
};
```

The gate returns `null` when in silence state (nothing to send), or the
PCM buffer when speaking/trailing (possibly including pre-roll frames).

### 3. Reset the gate on turn completion

In `runTurn`, when transitioning back to `listening` (line ~360):

```ts
vadGateRef.current?.reset();
setPhase("listening");
```

### 4. Destroy the gate in teardown

In `teardown` (line ~159):

```ts
vadGateRef.current?.destroy();
vadGateRef.current = null;
```

### 5. Add the ref

```ts
const vadGateRef = useRef<VadGate | null>(null);
```

### 6. Remove the Assembly `end_of_turn` path

In `ws.onmessage` (line 441-443), the `end_of_turn` branch becomes a no-op
or can be removed entirely since `onSpeechEnd` now drives `runTurn`. Keep it
as a fallback for one cycle, but the VAD path should fire first.

---

## RMS calculation

The energy metric is RMS (root mean square) of the frame. This is cheap,
synchronous, and sufficient for a single-speaker close-mic scenario.

```ts
function computeRms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}
```

No `AnalyserNode` needed. The raw `Float32Array` from
`getChannelData(0)` is already in the format we want.

### Why not `AnalyserNode.getByteTimeDomainData`?

It works, but it allocates a `Uint8Array` per frame and does a byte
conversion. Computing RMS directly from the `Float32Array` is zero-allocation
and faster. The `ScriptProcessor` already gives us the `Float32Array` for
free.

---

## Tuning

The thresholds are the single most important thing to get right. Bad
thresholds = clipped speech or never-ending billing.

### How to tune

1. Log RMS values for 30 seconds of silence + 30 seconds of speech.
2. Find the silence ceiling and the speech floor.
3. Set `SPEECH_START` between them, closer to the speech floor.
4. Set `SPEECH_END` ~30% below `SPEECH_START` (hysteresis).

### Environmental factors

- Laptop mics vary wildly. Default thresholds assume a decent built-in mic
  at normal speaking distance (30-50cm).
- `noiseSuppression: true` is already on (line 472) - this helps a lot.
- If the user is in a noisy environment, raise `SPEECH_START`.
- If the user speaks softly, lower it.

### Expose thresholds as props

```ts
interface UseVoiceConversationArgs {
  // ...existing
  vadConfig?: VadConfig;
}
```

This lets the talk page pass tuned values without editing the hook.

---

## Edge cases

### 1. User starts speaking, pauses mid-sentence, resumes

The `trail` state handles this. During the 700ms hold, audio is still
forwarded. If the user resumes, we go back to `speaking` with no gap. If
they don't, `onSpeechEnd` fires and the partial transcript is sent to the
LLM as one turn.

### 2. Background noise triggers false starts

The hysteresis (`SPEECH_END` < `SPEECH_START`) and the 700ms trail hold
filter out brief noise bursts. A noise burst shorter than the hold window
that doesn't cross `SPEECH_START` again just gets sent as a small audio
clip - Assembly will return an empty or near-empty transcript for it, which
the hook already ignores (`if (msg.transcript.trim())` at line 441).

### 3. User walks away

`onSilenceTimeout` fires after `SILENCE_TIMEOUT_MS` (8s) of continuous
silence. The hook tears down the session. The user taps the mic again to
resume.

### 4. First word clipped

The pre-roll buffer catches this. Three frames (~750ms) is generous. If
clipping persists, increase `PRE_ROLL_FRAMES`.

### 5. Echo from TTS

Already handled by the existing `phaseRef` gate (line 407: only forwards
during `listening`). VAD adds a second layer: even if a frame leaks during
`speaking` phase, it won't be sent because the phase check runs first.

---

## Billing impact estimate

| Scenario | Today | With VAD |
|----------|------:|---------:|
| 5-min session, 30s speech | 5 min billed | ~1 min billed (30s speech + 700ms trails + pre-roll) |
| 10-min session, 2 min speech | 10 min billed | ~2.5 min billed |
| User walks away, mic open 5 min | 5 min billed | 8s billed (auto-pause) |

Expected billing reduction: **70-90%** for typical sessions.

---

## Testing

### Unit tests (`tests/vad.test.ts`)

The VAD gate is a pure state machine. Test with synthetic frames:

1. Silence frames -> gate stays in `silence`, returns `null`.
2. Speech frames -> gate transitions to `speaking`, returns PCM.
3. Speech then silence -> gate enters `trail`, still returns PCM.
4. Trail timeout -> `onSpeechEnd` called once.
5. Speech during trail -> back to `speaking`, no `onSpeechEnd`.
6. Pre-roll: first speech frame returns 4 frames (3 pre-roll + 1 current).
7. Silence timeout -> `onSilenceTimeout` called.

Generate synthetic frames by filling a `Float32Array` with a sine wave at
a known amplitude (0.02 for "speech", 0.001 for "silence").

### Manual smoke test

1. Start voice session.
2. Watch the server logs: `[stt-token]` fires once, but WS frames only
   arrive when speaking.
3. Speak for 5 seconds, go silent for 10 seconds, speak again.
4. Verify: two turns in the transcript, no billing for the 10s gap.
5. Walk away for 8 seconds. Verify: session auto-pauses.

---

## File checklist

- [ ] `lib/voice/vad.ts` - the gate (state machine + RMS + pre-roll)
- [ ] `lib/voice/use-voice-conversation.ts` - wire gate into `onaudioprocess`,
      add `vadGateRef`, reset on turn end, destroy on teardown
- [ ] `tests/vad.test.ts` - unit tests for the state machine
- [ ] Optional: expose `vadConfig` prop on `UseVoiceConversationArgs`

No new dependencies. No server changes. No schema changes.
