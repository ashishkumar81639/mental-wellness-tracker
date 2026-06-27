import { reframeSystemPrompt } from "@/lib/prompts/reframe";
import { DEEPSEEK_API_KEY } from "@/lib/env";

// The API may route deepseek-chat to deepseek-v4-flash; this is expected and does not affect functionality.
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const LLM_TIMEOUT_MS = 20000;

export async function reframeThought(
  examType: string,
  thought: string
): Promise<string> {
  const systemPrompt = reframeSystemPrompt(
    examType as Parameters<typeof reframeSystemPrompt>[0]
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
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: thought },
        ],
        temperature: 0.5,
        max_tokens: 300,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`DeepSeek API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      throw new Error("Empty response from DeepSeek reframe call");
    }

    return content.trim();
  } finally {
    clearTimeout(timeout);
  }
}
