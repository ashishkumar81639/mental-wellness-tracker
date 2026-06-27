import {
  journalAnalystSystemPrompt,
  journalAnalystTools,
} from "@/lib/prompts/journal-analyst";
import { DEEPSEEK_API_KEY } from "@/lib/env";
import {
  buildUserPrompt,
  sanitiseToolJson,
  parseAnalysis,
  type AnalysisResult,
  type ExamType,
} from "@/lib/utils";

// The API may route deepseek-chat to deepseek-v4-flash; this is expected and does not affect functionality.
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

// sprint: 30s timeout. Move to configurable timeout per-agent.
const LLM_TIMEOUT_MS = 30000;

export class LLMError extends Error {
  code: string;
  status?: number;
  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "LLMError";
    this.code = code;
    this.status = status;
  }
}

interface ToolCall {
  function: { name: string; arguments: string };
}

export async function analyseJournal(
  examType: ExamType,
  journalBody: string,
  mood: number,
  energy: number,
  sleepHrs?: number
): Promise<AnalysisResult> {
  const systemPrompt = journalAnalystSystemPrompt(examType);
  const userPrompt = buildUserPrompt(journalBody, mood, energy, sleepHrs);

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
          { role: "user", content: userPrompt },
        ],
        tools: journalAnalystTools,
        tool_choice: "required",
        temperature: 0.3,
        max_tokens: 1000,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      throw new LLMError(
        res.status === 401 ? "LLM_AUTH" : res.status === 429 ? "LLM_RATE_LIMIT" : "LLM_API_ERROR",
        `DeepSeek API returned ${res.status}${errorBody ? ": " + errorBody.slice(0, 200) : ""}`,
        res.status
      );
    }

    const data = await res.json();
    const toolCalls: ToolCall[] = data.choices?.[0]?.message?.tool_calls ?? [];

    if (toolCalls.length === 0) {
      throw new LLMError("LLM_NO_TOOL_CALLS", "DeepSeek returned no tool calls in the response");
    }

    const triggerCall = toolCalls.find((tc) => tc.function.name === "extract_triggers");
    const analysisCall = toolCalls.find((tc) => tc.function.name === "produce_analysis");

    if (!triggerCall || !analysisCall) {
      const foundNames = toolCalls.map((tc) => tc.function.name);
      throw new LLMError(
        "LLM_MISSING_TOOL",
        `Expected extract_triggers and produce_analysis, but got: [${foundNames.join(", ")}]`
      );
    }

    try {
      const triggersRaw = sanitiseToolJson(triggerCall.function.arguments);
      const analysisRaw = sanitiseToolJson(analysisCall.function.arguments);
      return parseAnalysis(analysisRaw, triggersRaw);
    } catch {
      throw new LLMError(
        "LLM_MALFORMED_JSON",
        "DeepSeek returned malformed JSON in tool arguments"
      );
    }
  } catch (err) {
    if (err instanceof LLMError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new LLMError("LLM_TIMEOUT", "DeepSeek request timed out after 30 seconds");
    }
    throw new LLMError("LLM_UNKNOWN", `Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timeout);
  }
}
