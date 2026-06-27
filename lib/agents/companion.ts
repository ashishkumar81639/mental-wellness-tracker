import { companionSystemPrompt } from "@/lib/prompts/companion";
import { DEEPSEEK_API_KEY } from "@/lib/env";
import type { ExamType } from "@/lib/utils";

// The API may route deepseek-chat to deepseek-v4-flash; this is expected behaviour and does not affect functionality.
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const LLM_TIMEOUT_MS = 45000;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

interface JournalSummary {
  date: string;
  emotion: string;
  summary: string;
}

export function buildCompanionMessages(
  systemPrompt: string,
  recentJournals: JournalSummary[],
  chatHistory: ChatMessage[],
  userMessage: string
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  // Inject journal summaries as a context-only system message
  if (recentJournals.length > 0) {
    let journalBlock = "Recent journal summaries:\n";
    for (const j of recentJournals) {
      journalBlock += `- ${j.date}: emotion=[${j.emotion}], summary=[${j.summary}]\n`;
    }
    messages.push({
      role: "system",
      content: `CONTEXT (use this for personalization; do not repeat verbatim):\n${journalBlock}`,
    });
  }

  // Replay last 6 chat turns for continuity (ascending order = oldest first)
  const recent = chatHistory.slice(-6);
  for (const m of recent) {
    messages.push({ role: m.role, content: m.content });
  }

  messages.push({ role: "user", content: userMessage });

  return messages;
}

export async function* streamCompanionReply(
  examType: ExamType,
  studentName: string,
  recentJournals: JournalSummary[],
  chatHistory: ChatMessage[],
  userMessage: string,
  latestMood?: number | null,
  latestEmotion?: string | null
): AsyncGenerator<string, void, unknown> {
  const systemPrompt = companionSystemPrompt(
    examType,
    studentName,
    latestMood,
    latestEmotion
  );

  const messages = buildCompanionMessages(
    systemPrompt,
    recentJournals,
    chatHistory,
    userMessage
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DeepSeek streaming error: ${res.status} - ${text}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body from DeepSeek");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        const trimmed = buffer.trim();
        if (trimmed && trimmed.startsWith("data: ") && trimmed !== "data: [DONE]") {
          const dataStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(dataStr);
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) yield token;
          } catch {
            // skip unparseable final chunk
          }
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === "[DONE]") return;

        try {
          const parsed = JSON.parse(dataStr);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) yield token;
        } catch {
          // skip unparseable chunks
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}
