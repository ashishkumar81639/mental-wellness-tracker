"use client";

import { useEffect, useState, useRef, FormEvent, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatChatText } from "@/lib/format-chat";
import { MicIcon } from "@/components/icons";

interface Message {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
}

type VoiceStatus = "loading" | "available" | "unavailable" | "denied";

/** Convert Float32Array to Int16Array for Assembly AI WebSocket. */
function floatTo16BitPCM(float32: Float32Array): Int16Array {
  const buf = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    buf[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return buf;
}

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState("");

  // Voice state
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("loading");
  const [isRecording, setIsRecording] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [submittingVoice, setSubmittingVoice] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const ttsContextRef = useRef<AudioContext | null>(null);
  const transcriptRef = useRef("");

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  function authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  // Auth guard + load history + check voice availability
  useEffect(() => {
    if (!token) {
      router.push("/");
      return;
    }
    loadHistory();
    checkVoiceAvailability();
  }, []);

  async function checkVoiceAvailability() {
    try {
      const res = await fetch("/api/talk/stt-token", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setVoiceStatus("available");
      } else {
        setVoiceStatus("unavailable");
      }
    } catch {
      setVoiceStatus("unavailable");
    }
  }

  async function loadHistory() {
    try {
      const res = await fetch("/api/chat/history", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages.reverse());
      }
    } catch {
      // silent
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamedText, partialTranscript]);

  // --- Voice recording ---

  const startRecording = useCallback(async () => {
    setVoiceError(null);
    setPartialTranscript("");
    transcriptRef.current = "";

    // Create TTS AudioContext during user gesture (unlocks autoplay for TTS)
    if (!ttsContextRef.current || ttsContextRef.current.state === "closed") {
      ttsContextRef.current = new AudioContext();
    }
    if (ttsContextRef.current.state === "suspended") {
      await ttsContextRef.current.resume();
    }

    try {
      // 1. Request mic
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // 2. Get Assembly AI WebSocket token
      const sttRes = await fetch("/api/talk/stt-token", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!sttRes.ok) throw new Error("STT unavailable");
      const sttConfig = await sttRes.json();

      if (sttConfig.type !== "ws-token") {
        throw new Error("Only WebSocket STT is supported for real-time transcription");
      }

      // v3 requires sample_rate as URL query param
      const ws = new WebSocket(
        `${sttConfig.wsUrl}?token=${sttConfig.token}&sample_rate=${sttConfig.sampleRate}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        // Set up audio pipeline: mic -> PCM Int16 -> binary WS frames
        const audioContext = new AudioContext({ sampleRate: sttConfig.sampleRate });
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e: AudioProcessingEvent) => {
          if (ws.readyState === WebSocket.OPEN) {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcm16 = floatTo16BitPCM(inputData);
            ws.send(pcm16.buffer);
          }
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string);
          // v3: type "Turn" with field "transcript"
          if (msg.type === "Turn" && typeof msg.transcript === "string") {
            transcriptRef.current = msg.transcript;
            setPartialTranscript(msg.transcript);
          }
        } catch {
          // skip non-JSON messages (binary ping/pong)
        }
      };

      ws.onerror = () => {
        setVoiceError("Connection lost. Please try again.");
        cleanupRecording();
      };

      ws.onclose = () => {
        // cleanup handled by stopRecording
      };

      setIsRecording(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setVoiceStatus("denied");
        setVoiceError("Microphone access denied. Check your browser settings.");
      } else {
        setVoiceError("Could not start recording. Please type instead.");
      }
      cleanupRecording();
    }
  }, [token]);

  const stopRecording = useCallback(async () => {
    // Send Terminate, then wait for final Turn to arrive from Assembly AI
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "Terminate" }));
    }
    setIsRecording(false);
    // Wait for the final Turn message to arrive over WebSocket before reading transcript
    await new Promise((r) => setTimeout(r, 800));

    // Stop mic + audio pipeline
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const transcript = transcriptRef.current.trim();
    transcriptRef.current = "";

    if (!transcript) {
      setPartialTranscript("");
      return;
    }

    setInput(transcript);
    setSubmittingVoice(true);
    // Clear the transcript bubble so only the real user message renders
    setPartialTranscript("");
    await submitMessage(transcript);
    setInput("");
    setSubmittingVoice(false);
  }, []);

  function cleanupRecording() {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "Terminate" }));
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    transcriptRef.current = "";
  }

  // --- TTS playback ---

  const ttsPlayingRef = useRef(false);

  async function speakResponse(text: string) {
    if (ttsPlayingRef.current) return;

    // Lazy-init AudioContext if not created by mic click (text-only chat fallback)
    let ctx = ttsContextRef.current;
    if (!ctx || ctx.state === "closed") {
      try {
        ctx = new AudioContext();
        ttsContextRef.current = ctx;
        await ctx.resume();
      } catch {
        return; // browser blocked autoplay
      }
    }
    if (ctx.state === "suspended") {
      await ctx.resume(); // browser may have suspended after first message
    }

    try {
      ttsPlayingRef.current = true;
      const hasHindi = /[ऀ-ॿ]/.test(text);

      const res = await fetch("/api/talk/tts", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          text: text.slice(0, 1000),
          language: hasHindi ? "hi" : "en",
        }),
      });

      if (!res.ok) { ttsPlayingRef.current = false; return; }

      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start(0);
      source.onended = () => { ttsPlayingRef.current = false; };
    } catch {
      ttsPlayingRef.current = false;
    }
  }

  // --- Chat ---

  async function submitMessage(content: string) {
    if (!content.trim() || streaming) return;

    const userMessage: Message = { role: "user", content: content.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setStreaming(true);
    setStreamedText("");
    ttsPlayingRef.current = false;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ message: userMessage.content }),
      });

      if (!res.ok) throw new Error("Stream failed");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const dataStr = trimmed.slice(6);
          if (dataStr === "[DONE]") {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: fullText },
            ]);
            setStreamedText("");
            setStreaming(false);

            speakResponse(fullText);
            return;
          }
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.token) {
              fullText += parsed.token;
              setStreamedText(fullText);
            }
          } catch {
            // skip
          }
        }
      }
    } catch {
      setStreaming(false);
    }
  }

  function handleSend(e: FormEvent) {
    e.preventDefault();
    // Unlock TTS AudioContext from text Send button click (user gesture)
    if (!ttsContextRef.current || ttsContextRef.current.state !== "running") {
      const ctx = new AudioContext();
      ttsContextRef.current = ctx;
      ctx.resume();
    }
    submitMessage(input);
  }

  // --- UI helpers ---

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      {/* Top bar */}
      <nav className="h-16 border-b border-hairline flex items-center justify-between px-lg bg-canvas shrink-0">
        <div className="flex items-center gap-md">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-muted hover:text-ink"
          >
            &larr; Back
          </button>
          <h2 className="text-title-md font-display text-ink">
            Talk to Yaar
          </h2>
        </div>
        {voiceStatus === "available" && (
          <span className="badge-coral">Voice Ready</span>
        )}
      </nav>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-lg py-lg">
        <div className="max-w-2xl mx-auto space-y-lg">
          {messages.length === 0 && !streaming && (
            <div className="text-center py-xxl">
              <h3 className="text-title-md font-display text-ink mb-sm">
                Talk to Yaar
              </h3>
              <p className="text-body text-muted">
                Your empathetic companion who remembers your journey.
                <br />
                Share what&apos;s on your mind - type or tap the mic to speak.
              </p>
              {voiceStatus === "loading" && (
                <p className="text-caption text-muted mt-md">
                  Checking voice features&hellip;
                </p>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-lg py-md ${
                  msg.role === "user"
                    ? "bg-primary text-on-primary"
                    : "bg-surface-card text-body"
                }`}
              >
                <p className="text-body-sm whitespace-pre-wrap">
                  {formatChatText(msg.content)}
                </p>
              </div>
            </div>
          ))}

          {partialTranscript && (isRecording || submittingVoice) && (
            <div className="flex justify-end">
              <div
                className={`max-w-[80%] rounded-lg px-lg py-md ${
                  submittingVoice
                    ? "bg-primary text-on-primary"
                    : "bg-primary/20 text-ink border border-primary/30"
                }`}
              >
                <p className="text-body-sm whitespace-pre-wrap">
                  {partialTranscript}
                  {isRecording && <span className="animate-pulse text-primary">|</span>}
                </p>
              </div>
            </div>
          )}

          {streamedText && !isRecording && (
            <div className="flex justify-start">
              <div className="max-w-[80%] bg-surface-card rounded-lg px-lg py-md">
                <p className="text-body-sm whitespace-pre-wrap">
                  {formatChatText(streamedText)}
                  <span className="animate-pulse text-primary">|</span>
                </p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Voice error banner */}
      {voiceError && (
        <div className="bg-yellow-50 border-t border-yellow-200 px-lg py-sm">
          <p className="text-caption text-yellow-800 flex items-center gap-sm">
            <span role="img" aria-hidden="true">
              &#9888;
            </span>
            {voiceError}
            <button
              onClick={() => setVoiceError(null)}
              className="ml-auto text-yellow-600 hover:text-yellow-800 font-medium"
            >
              Dismiss
            </button>
          </p>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-hairline bg-canvas px-lg py-md">
        <form
          onSubmit={handleSend}
          className="max-w-2xl mx-auto flex gap-sm items-center"
        >
          <input
            type="text"
            value={isRecording ? partialTranscript : input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isRecording
                ? "Listening..."
                : "Type your message..."
            }
            className="input-field flex-1"
            disabled={streaming || isRecording}
            maxLength={3000}
          />

          {/* Mic button */}
          {voiceStatus === "available" && (
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={streaming}
              className={`shrink-0 w-10 h-10 rounded-md flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                isRecording
                  ? "bg-red-500 text-white animate-pulse"
                  : "bg-surface-card border border-hairline text-muted hover:text-ink hover:border-primary/50"
              } disabled:opacity-50`}
              aria-label={isRecording ? "Stop recording" : "Start recording"}
            >
              <MicIcon width={18} height={18} />
            </button>
          )}

          <button
            type="submit"
            disabled={(!input.trim() && !isRecording) || streaming}
            className="btn-primary shrink-0 disabled:opacity-50"
          >
            Send
          </button>
        </form>

        {/* Recording indicator */}
        {isRecording && (
          <div className="max-w-2xl mx-auto mt-sm flex items-center gap-sm">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-caption text-muted">
              Recording&hellip; {partialTranscript ? "words appearing as you speak" : "speak now"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
