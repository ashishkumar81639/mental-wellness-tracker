"use client";

import { useEffect, useState, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { formatChatText } from "@/lib/format-chat";

interface Message {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
}

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/");
      return;
    }
    loadHistory(token);
  }, [router]);

  async function loadHistory(token: string) {
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
  }, [messages, streamedText]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setStreaming(true);
    setStreamedText("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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
          <h2 className="text-title-md font-display text-ink">Yaar Chat</h2>
        </div>
      </nav>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-lg py-lg">
        <div className="max-w-2xl mx-auto space-y-lg">
          {messages.length === 0 && !streaming && (
            <div className="text-center py-xxl">
              <h3 className="text-title-md font-display text-ink mb-sm">
                Chat to Yaar
              </h3>
              <p className="text-body text-muted">
                Your empathetic companion who remembers your journey.
                <br />
                Share what&apos;s on your mind.
              </p>
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

      {/* Input */}
      <div className="border-t border-hairline bg-canvas px-lg py-md">
        <form
          onSubmit={handleSend}
          className="max-w-2xl mx-auto flex gap-sm"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="input-field flex-1"
            disabled={streaming}
            maxLength={3000}
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="btn-primary shrink-0 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
