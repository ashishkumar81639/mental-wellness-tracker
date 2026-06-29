# Review: Talk to Yaar - Voice Pipeline

## Overview

Voice recording produces no transcript and no message sent.
Three root-cause bugs prevent this from working, all in the WebSocket protocol layer connecting to Assembly AI v3.

---

## Bug 1 (CRITICAL): Wrong message type parsing

**File:** `app/chat/page.tsx`, line 170-173

Assembly AI v3 returns `type: "Turn"`, not `type: "transcript"`.
The transcript field is `transcript`, not `text`.
The current code never matches any incoming message.

```typescript
// WRONG - never matches v3 messages
if (msg.type === "transcript") {
  const text = msg.text || "";
```

Actual v3 message shape:

```json
{
  "type": "Turn",
  "turn_order": 0,
  "end_of_turn": true,
  "transcript": "Hello world"
}
```

Should use `msg.type === "Turn"` and `msg.transcript`.

---

## Bug 2 (CRITICAL): Missing `sample_rate` in WebSocket URL

**File:** `app/chat/page.tsx`, line 129

v3 requires `sample_rate` as a query parameter on the WebSocket URL.
The current URL only carries the token.
Assembly AI docs show all v3 connections include it:

```
wss://streaming.assemblyai.com/v3/ws?token=...&sample_rate=16000
```

Without it the server has no sample rate context and audio frames are misparsed.
The `configure` message format is a v2-ism; v3 takes sample_rate from the URL.

**Fix in `lib/config/stt/assembly.ts`:** Include `sample_rate` in the token URL, or return it alongside the WS URL so the client can append it.

---

## Bug 3 (CRITICAL): Audio sent as JSON, v3 expects binary frames

**File:** `app/chat/page.tsx`, lines 151-159

v2 used JSON `{ type: "audio_data", data: "<base64>" }`.
v3 expects raw Int16Array PCM bytes sent as **binary** WebSocket frames.
The current code base64-encodes and wraps in JSON, which v3 ignores.

```typescript
// WRONG for v3 - JSON audio_data is v2-only
ws.send(JSON.stringify({ type: "audio_data", data: base64 }));
```

**Fix:** Send the Int16Array directly as a binary frame:

```typescript
ws.send(pcm16.buffer);
```

The `ScriptProcessorNode` already produces the correct 16-bit signed PCM.
Remove the base64 encoding entirely.

---

## Bug 4 (MEDIUM): Missing `Terminate` message on stop

**File:** `app/chat/page.tsx`, function `cleanupRecording`, lines 222-223

Assembly AI bills per session duration, not per audio sent.
Without sending `{ "type": "Terminate" }` before closing the socket, Assembly AI may:
- Not flush the final `Turn` with `end_of_turn: true`
- Keep the session open (billed up to 3-hour auto-close)

**Fix:** Before `ws.close()` in `cleanupRecording()`, send:

```typescript
if (ws.readyState === WebSocket.OPEN) {
  ws.send(JSON.stringify({ type: "Terminate" }));
}
```

---

## Bug 5 (LOW): `partialTranscript` stale in `stopRecording` closure

**File:** `app/chat/page.tsx`, line 201

`stopRecording` captures `partialTranscript` via `useCallback([partialTranscript])`.
This is technically correct because React creates a new callback each time the value changes.
However, the timing is fragile: a very fast click-and-release could capture the value before the last WS `onmessage` handler's `setPartialTranscript` has flushed.

**Fix:** Use a ref to track the latest transcript value, updating it inside the WS `onmessage` handler alongside `setPartialTranscript`. Read the ref in `stopRecording` instead of the state variable.

---

## Bug 6 (LOW): TTS sends full accumulated text instead of last sentence

**File:** `app/chat/page.tsx`, line 253

Earlier code extracted the last sentence:

```typescript
const lastSentence = text.split(/[.!?]\s/).pop() || text;
```

The current code sends the full `text.slice(0, 500)`, which can be several sentences.
This makes TTS playback long and unnatural for streaming.

**Fix:** Restore last-sentence extraction, or better, split on sentence boundaries and send the most recent complete sentence.

---

## Bug 7 (LOW): No logging on WS message receipt

**File:** `app/chat/page.tsx`, lines 167-177

The `ws.onmessage` handler silently catches all JSON parse errors.
When the message type doesn't match, there is no fallback log.
This made debugging impossible without knowing the actual message shape.
Add a `console.debug` for unknown message types during development:

```typescript
ws.onmessage = (event) => {
  try {
    const msg = JSON.parse(event.data);
    console.debug("[ws] message type:", msg.type); // dev only
    if (msg.type === "Turn") { ... }
  } catch { /* skip non-JSON */ }
};
```

---

## Fix priority

| Priority | Bug | Impact |
|----------|-----|--------|
| 1 | Bug 1: Wrong message type (`Turn` vs `transcript`) | No transcript capture at all |
| 2 | Bug 2: Missing sample_rate in WS URL | Audio misparsed server-side |
| 3 | Bug 3: JSON audio_data → binary frames (v3) | Audio not received by Assembly AI |
| 4 | Bug 4: Missing Terminate message | Transcripts may not flush; billing leak |
| 5 | Bug 5: Stale closure in stopRecording | Edge case: fast click may miss last word |
| 6 | Bug 6: TTS sends too much text | Audio feels long and unnatural |
| 7 | Bug 7: No WS message logging | Can't debug protocol issues |

**Fix bugs 1-4 to make it work. Bugs 5-7 are polish.**

---

## Post-fix findings (2026-06-29, 21:16)

### Bug 8 (FIXED): Duplicate transcript rendering

`stopRecording` called `setPartialTranscript(transcript)` to keep the voice bubble visible,
then called `submitMessage()` which added the same text as a real user message to `messages[]`.
Both rendered simultaneously for a brief moment, creating a duplicate appearance.

**Fix:** Clear `setPartialTranscript("")` BEFORE calling `submitMessage()`. Only the real
user message renders.

### Bug 9 (FIXED): TTS fired mid-stream with incomplete text

TTS was triggered after ~150 characters of streaming, sending partial/incomplete sentences.
The sentence-splitting regex on 150 chars of streamed text produced poor quality.
The Sarvam "anushka" voice reading partial chatter sounded robotic.

**Fix:** Remove mid-stream TTS trigger. Wait for `[DONE]` signal, then send the complete
response (up to 1000 chars) to TTS. Voice changed to "manisha" (warmer tone).

### Bug 10 (FIXED): Assembly AI standalone TTS v2 deprecated

Assembly AI removed the `/v2/tts` REST endpoint. TTS is now bundled exclusively in their
Voice Agent API ($4.50/hr, WebSocket). Marked the `assemblyTTS` provider as deprecated
with a clear error message. Defaulted `TTS_PROVIDER=sarvam` in `.env.example`.

### TTS voice comparison

| Voice | Provider | Quality for English |
|-------|----------|---------------------|
| anushka | Sarvam | Stiff, robotic |
| manisha | Sarvam | Warmer, more natural |
| Assembly Voice Agent | Assembly AI | Best but $4.50/hr, replaces entire pipeline |

`sprint: Evaluate dedicated TTS providers (ElevenLabs, Cartesia) for better English quality.`
