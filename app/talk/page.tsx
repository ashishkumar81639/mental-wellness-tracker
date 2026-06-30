"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatChatText } from "@/lib/format-chat";
import { MicIcon } from "@/components/icons";
import { useVoiceConversation } from "@/lib/voice/use-voice-conversation";
import { WaitlistModal } from "@/components/waitlist-modal";

interface Message {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
}

type VoiceStatus = "loading" | "available" | "unavailable";

const PHASE_HINT: Record<string, string> = {
  connecting: "Connecting…",
  listening: "Listening… Yaar replies automatically. Tap to stop.",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

const VOICE_EXHAUSTED = "You've used your free voice time. You can still chat by text!";

export default function TalkPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("loading");
  const [showWaitlist, setShowWaitlist] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const userEmail = (() => {
    try { return JSON.parse(localStorage.getItem("user") ?? "{}")?.email ?? ""; }
    catch { return ""; }
  })();

  const appendMessage = useCallback((role: Message["role"], content: string) => {
    setMessages((prev) => [...prev, { role, content }]);
  }, []);

  const {
    phase,
    partialTranscript,
    streamedText,
    error,
    start,
    stop,
    dismissError,
  } = useVoiceConversation({
    token,
    onUserMessage: (text) => appendMessage("user", text),
    onAssistantMessage: (text) => appendMessage("assistant", text),
  });

  useEffect(() => {
    if (!token) {
      router.push("/");
      return;
    }
    loadHistory();
    checkVoiceAvailability();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamedText, partialTranscript]);

  useEffect(() => {
    if (error === VOICE_EXHAUSTED) setShowWaitlist(true);
  }, [error]);

  async function checkVoiceAvailability() {
    try {
      const res = await fetch("/api/talk/stt-token", { headers: { Authorization: `Bearer ${token}` } });
      setVoiceStatus(res.ok ? "available" : "unavailable");
    } catch {
      setVoiceStatus("unavailable");
    }
  }

  async function loadHistory() {
    try {
      const res = await fetch("/api/chat/history", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages.reverse());
      }
    } catch {
      /* silent */
    }
  }

  const active = phase !== "idle" && phase !== "error";
  const isEmpty = messages.length === 0 && !streamedText && !active;

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <nav className="h-16 border-b border-hairline flex items-center justify-between px-lg bg-canvas shrink-0">
        <div className="flex items-center gap-md">
          <button onClick={() => router.push("/dashboard")} className="text-muted hover:text-ink">
            &larr; Back
          </button>
          <h2 className="text-title-md font-display text-ink">Talk to Yaar</h2>
        </div>
        {voiceStatus === "available" && <span className="badge-coral">Voice Ready</span>}
      </nav>

      <div className="flex-1 overflow-y-auto px-lg py-lg">
        <div className="max-w-2xl mx-auto space-y-lg">
          {isEmpty && (
            <div className="text-center py-xxl">
              <h3 className="text-title-md font-display text-ink mb-sm">Talk to Yaar</h3>
              <p className="text-body text-muted">
                Your empathetic companion who remembers your journey.
                <br />
                Tap the mic and just talk - Yaar listens and replies out loud.
              </p>
              {voiceStatus === "loading" && (
                <p className="text-caption text-muted mt-md">Checking voice features&hellip;</p>
              )}
              {voiceStatus === "unavailable" && (
                <p className="text-caption text-muted mt-md">
                  Voice is unavailable right now. You can still{" "}
                  <button onClick={() => router.push("/chat")} className="text-link underline">
                    chat by text
                  </button>
                  .
                </p>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-lg px-lg py-md ${
                  msg.role === "user" ? "bg-primary text-on-primary" : "bg-surface-card text-body"
                }`}
              >
                <p className="text-body-sm whitespace-pre-wrap">{formatChatText(msg.content)}</p>
              </div>
            </div>
          ))}

          {partialTranscript && (
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-lg px-lg py-md bg-primary/20 text-ink border border-primary/30">
                <p className="text-body-sm whitespace-pre-wrap">
                  {partialTranscript}
                  {phase === "listening" && <span className="animate-pulse text-primary">|</span>}
                </p>
              </div>
            </div>
          )}

          {streamedText && (
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

      {error && (
        <div className="bg-yellow-50 border-t border-yellow-200 px-lg py-sm">
          <p className="text-caption text-yellow-800 flex items-center gap-sm">
            <span role="img" aria-hidden="true">&#9888;</span> {error}
            {error === VOICE_EXHAUSTED && (
              <button
                onClick={() => setShowWaitlist(true)}
                className="text-yellow-800 underline font-medium ml-sm"
              >
                Join waitlist
              </button>
            )}
            <button onClick={dismissError} className="ml-auto text-yellow-600 hover:text-yellow-800 font-medium">
              Dismiss
            </button>
          </p>
        </div>
      )}

      <WaitlistModal
        open={showWaitlist}
        reason="voice"
        email={userEmail}
        onClose={() => {
          setShowWaitlist(false);
          dismissError();
        }}
      />

      {/* Voice-only control bar */}
      <div className="border-t border-hairline bg-canvas px-lg py-lg">
        <div className="max-w-2xl mx-auto flex flex-col items-center gap-sm">
          {voiceStatus === "unavailable" ? (
            <p className="text-caption text-muted">
              Voice unavailable.{" "}
              <button onClick={() => router.push("/chat")} className="text-link underline">
                Chat by text instead
              </button>
            </p>
          ) : voiceStatus === "loading" ? (
            <p className="text-caption text-muted">Preparing voice&hellip;</p>
          ) : (
            <button
              type="button"
              onClick={active ? stop : start}
              disabled={phase === "connecting"}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-primary/30 ${
                active
                  ? "bg-red-500 text-white animate-pulse shadow-lg"
                  : "bg-primary text-on-primary hover:opacity-90 shadow-md"
              } disabled:opacity-50`}
              aria-label={active ? "Stop talking" : "Start talking"}
            >
              <MicIcon width={26} height={26} />
            </button>
          )}

          <span className="text-caption text-muted flex items-center gap-sm">
            {phase === "listening" && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
            {(phase === "thinking" || phase === "speaking") && (
              <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
            )}
            {active
              ? PHASE_HINT[phase]
              : voiceStatus === "available"
              ? "Tap the mic to start talking"
              : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
