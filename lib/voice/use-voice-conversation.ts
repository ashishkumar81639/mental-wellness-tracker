import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drives a hands-free, continuous voice conversation:
 *
 *   idle → connecting → listening → thinking → speaking → listening → …
 *
 * Design notes (why it looks the way it does):
 *
 * - ONE Assembly session for the whole conversation. Assembly v3 does
 *   continuous turn detection on a single socket, so we open the mic + WS once
 *   and keep them alive. We do NOT tear down and re-acquire per turn.
 *
 * - We never stop *capturing* audio; we stop *sending* it. While Yaar is
 *   thinking or speaking, `onaudioprocess` drops frames (gated on `phaseRef`).
 *   This is what prevents the echo loop — the mic can't transcribe Yaar's own
 *   TTS because nothing is forwarded to Assembly while it plays.
 *
 * - `phaseRef` mirrors `phase` so the audio callback and WS handlers (which
 *   capture a stale closure) always read the live value. Every transition goes
 *   through `setPhase` to keep ref and state in lockstep — single source of truth.
 */

export type VoicePhase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

interface SttWsConfig {
  type: "ws-token";
  token: string;
  wsUrl: string;
  sampleRate: number;
}

interface AssemblyTurn {
  type: string;
  transcript?: string;
  end_of_turn?: boolean;
}

interface UseVoiceConversationArgs {
  token: string | null;
  /** Append the finalized user utterance to the transcript. */
  onUserMessage: (text: string) => void;
  /** Append Yaar's finalized reply to the transcript. */
  onAssistantMessage: (text: string) => void;
}

interface UseVoiceConversation {
  phase: VoicePhase;
  /** Live (interim) transcript of what the user is currently saying. */
  partialTranscript: string;
  /** Yaar's reply as it streams in, before it's finalized. */
  streamedText: string;
  error: string | null;
  /** Begin a conversation. Must be called from a user gesture (mic permission + audio unlock). */
  start: () => void;
  /** End the conversation and release the mic. */
  stop: () => void;
  dismissError: () => void;
}

const WS_OPEN_TIMEOUT_MS = 10_000;
const SPEAK_FALLBACK_PADDING_MS = 1_000;
const MAX_REPLY_CHARS = 1_000;

function floatTo16BitPCM(float32: Float32Array): ArrayBuffer {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}

export function useVoiceConversation({
  token,
  onUserMessage,
  onAssistantMessage,
}: UseVoiceConversationArgs): UseVoiceConversation {
  const [phase, setPhaseState] = useState<VoicePhase>("idle");
  const [partialTranscript, setPartialTranscript] = useState("");
  const [streamedText, setStreamedText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Live mirrors for use inside long-lived callbacks (audio thread, WS handlers).
  const phaseRef = useRef<VoicePhase>("idle");
  const transcriptRef = useRef("");

  // Audio + network resources, all torn down together in teardown().
  const streamRef = useRef<MediaStream | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const ttsCtxRef = useRef<AudioContext | null>(null);
  const ttsPrimedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const setPhase = useCallback((next: VoicePhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  // Read through a call so TS doesn't flow-narrow phaseRef.current between awaits.
  // "error" counts as stopped: a turn in flight must not resume listening after
  // the conversation has already failed (e.g. a dropped connection).
  const isStopped = useCallback(
    () => phaseRef.current === "idle" || phaseRef.current === "error",
    []
  );

  // Lazily create and unlock the playback AudioContext. Browsers hand back a
  // *suspended* context after a tab/visibility/navigation change, so we resume
  // every time rather than assuming it's running. The first unlock must be
  // reachable from a user gesture (it is — start() runs on the mic tap);
  // afterwards resume() no longer needs one. Returns null if it can't reach
  // "running", in which case we simply skip audio and keep the text reply.
  const ensureTtsContext = useCallback(async (): Promise<AudioContext | null> => {
    if (!ttsCtxRef.current || ttsCtxRef.current.state === "closed") {
      try {
        ttsCtxRef.current = new AudioContext();
      } catch {
        return null;
      }
      ttsPrimedRef.current = false;
    }
    const ctx = ttsCtxRef.current;
    // Prime the output path once by playing a silent buffer. resume() only
    // flips the state to "running"; several browsers keep audio output muted
    // until a source actually plays inside a user gesture. This runs
    // synchronously (before the resume await) so it lands inside the mic tap —
    // without it, TTS is silent on a fresh page load until other gestures pile up.
    if (!ttsPrimedRef.current) {
      try {
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        src.connect(ctx.destination);
        src.start(0);
        ttsPrimedRef.current = true;
      } catch {
        /* ignore — best effort */
      }
    }
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => {});
    }
    return ctx.state === "running" ? ctx : null;
  }, []);

  // --- Teardown: idempotent, releases every resource ---------------------
  const teardown = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (captureCtxRef.current && captureCtxRef.current.state !== "closed") {
      captureCtxRef.current.close().catch(() => {});
    }
    captureCtxRef.current = null;
    if (wsRef.current) {
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      if (wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close();
      wsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    transcriptRef.current = "";
  }, []);

  // --- Chat: stream a reply, return the full text (null if aborted/failed) --
  const streamReply = useCallback(
    async (message: string): Promise<string | null> => {
      const controller = new AbortController();
      abortRef.current = controller;
      setStreamedText("");

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`chat ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const payload = trimmed.slice(6);
            if (payload === "[DONE]") {
              setStreamedText("");
              return fullText;
            }
            try {
              const parsed = JSON.parse(payload) as { token?: string };
              if (parsed.token) {
                fullText += parsed.token;
                setStreamedText(fullText);
              }
            } catch {
              /* skip non-JSON keepalives */
            }
          }
        }
        setStreamedText("");
        return fullText;
      } catch {
        setStreamedText("");
        if (controller.signal.aborted) return null;
        setError("Couldn't reach Yaar. Tap the mic to try again.");
        return null;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [token]
  );

  // --- TTS: resolves only once playback finishes (so the mic stays gated) ---
  const speak = useCallback(
    async (text: string): Promise<void> => {
      const clean = text.trim();
      if (!clean) return;
      // Re-unlock here, not just in start(): the context can be suspended again
      // by the time a reply is ready (tab switch, navigation, OS audio change).
      // This is the fix for "text appeared but no audio on the first turn back".
      const ctx = await ensureTtsContext();
      if (!ctx) return;

      let res: Response;
      try {
        res = await fetch("/api/talk/tts", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: clean.slice(0, MAX_REPLY_CHARS),
            language: /[ऀ-ॿ]/.test(clean) ? "hi" : "en",
          }),
        });
      } catch {
        return; // network error: skip playback, fall through to listening
      }
      if (!res.ok) return;

      try {
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        await new Promise<void>((resolve) => {
          const source = ctx.createBufferSource();
          source.buffer = buf;
          source.connect(ctx.destination);
          // onended is the source of truth; the timer is a safety net so a
          // dropped event can never strand us in the "speaking" phase.
          const fallback = setTimeout(
            resolve,
            buf.duration * 1000 + SPEAK_FALLBACK_PADDING_MS
          );
          source.onended = () => {
            clearTimeout(fallback);
            resolve();
          };
          source.start(0);
        });
      } catch {
        /* decode failure: skip playback */
      }
    },
    [token, ensureTtsContext]
  );

  // --- One full turn: user finished speaking → reply → speak → listen again -
  const runTurn = useCallback(
    async (utterance: string) => {
      setPhase("thinking");
      setPartialTranscript("");
      transcriptRef.current = "";
      onUserMessage(utterance);

      const reply = await streamReply(utterance);
      if (isStopped()) return; // user stopped mid-flight
      if (reply == null) {
        setPhase("listening"); // recoverable failure: keep the mic open
        return;
      }
      onAssistantMessage(reply);

      setPhase("speaking");
      await speak(reply);
      if (isStopped()) return;
      setPhase("listening");
    },
    [onUserMessage, onAssistantMessage, streamReply, speak, setPhase, isStopped]
  );

  // --- Open the Assembly socket and wire the capture graph ------------------
  const openSession = useCallback(
    async (stream: MediaStream): Promise<void> => {
      const res = await fetch("/api/talk/stt-token", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("stt-token unavailable");
      const cfg = (await res.json()) as SttWsConfig;
      if (cfg.type !== "ws-token") throw new Error("unsupported stt config");

      // Force the context to Assembly's declared rate so the PCM we send and
      // the sample_rate we advertise always agree.
      const ctx = new AudioContext({ sampleRate: cfg.sampleRate });
      captureCtxRef.current = ctx;

      const ws = new WebSocket(
        `${cfg.wsUrl}?token=${cfg.token}&sample_rate=${cfg.sampleRate}`
      );
      wsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("ws open timeout")),
          WS_OPEN_TIMEOUT_MS
        );

        ws.onopen = () => {
          clearTimeout(timeout);
          const source = ctx.createMediaStreamSource(stream);
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;
          processor.onaudioprocess = (e) => {
            // Gate: only forward audio while actively listening. This is what
            // stops Yaar's TTS from being transcribed back into the convo.
            if (phaseRef.current !== "listening") return;
            if (ws.readyState !== WebSocket.OPEN) return;
            ws.send(floatTo16BitPCM(e.inputBuffer.getChannelData(0)));
          };
          source.connect(processor);
          processor.connect(ctx.destination);
          resolve();

          // Past this point a socket error/close is an *unexpected* drop (the
          // intentional close in teardown nulls these handlers first). Surface
          // it and stop cleanly so the user can just tap the mic to reconnect.
          const onDrop = () => {
            if (phaseRef.current === "idle" || phaseRef.current === "error") return;
            setError("Connection lost. Tap the mic to start again.");
            setPhase("error");
            teardown();
          };
          ws.onerror = onDrop;
          ws.onclose = onDrop;
        };

        ws.onmessage = (event) => {
          let msg: AssemblyTurn;
          try {
            msg = JSON.parse(event.data as string);
          } catch {
            return;
          }
          if (msg.type !== "Turn" || typeof msg.transcript !== "string") return;
          // Ignore turns that arrive while we're thinking/speaking.
          if (phaseRef.current !== "listening") return;

          transcriptRef.current = msg.transcript;
          setPartialTranscript(msg.transcript);
          if (msg.end_of_turn && msg.transcript.trim()) {
            void runTurn(msg.transcript.trim());
          }
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("ws error"));
        };
      });
    },
    [token, runTurn, teardown, setPhase]
  );

  // --- Public: start --------------------------------------------------------
  const start = useCallback(async () => {
    if (phaseRef.current !== "idle" && phaseRef.current !== "error") return;
    setError(null);
    setPartialTranscript("");

    // Unlock the playback context inside the user gesture so later replies can
    // speak. We don't fail the conversation if this can't run — STT still works.
    await ensureTtsContext();

    setPhase("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      // The mic is live now. If the user stopped or navigated away while it was
      // being acquired, we're no longer "connecting" — release the track right
      // away instead of leaking a held mic onto a dead session.
      if (isStopped()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      await openSession(stream);
      if (isStopped()) {
        teardown(); // stopped during the socket handshake
        return;
      }
      setPhase("listening");
    } catch (err) {
      teardown();
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Microphone access denied.");
      } else {
        setError("Couldn't start voice. Please try again.");
      }
      setPhase("error");
    }
  }, [openSession, teardown, setPhase, ensureTtsContext, isStopped]);

  // --- Public: stop ---------------------------------------------------------
  const stop = useCallback(() => {
    if (phaseRef.current === "idle") return;
    setPhase("idle");
    setPartialTranscript("");
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "Terminate" }));
    }
    teardown();
  }, [teardown, setPhase]);

  // Release everything on unmount — including the playback context, which
  // teardown() intentionally leaves alone (it survives stop/start within a
  // session). Leaking it across navigations is what left a suspended, orphaned
  // context behind and broke TTS on the first turn after coming back.
  useEffect(() => {
    return () => {
      // Mark idle first so any in-flight start() (mid getUserMedia/handshake)
      // sees the session is gone and releases the mic it's about to acquire.
      phaseRef.current = "idle";
      teardown();
      const tts = ttsCtxRef.current;
      if (tts && tts.state !== "closed") tts.close().catch(() => {});
      ttsCtxRef.current = null;
    };
  }, [teardown]);

  return {
    phase,
    partialTranscript,
    streamedText,
    error,
    start,
    stop,
    dismissError: () => setError(null),
  };
}
