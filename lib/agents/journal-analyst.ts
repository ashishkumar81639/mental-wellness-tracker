import {
  journalAnalystSystemPrompt,
  journalAnalystTools,
} from "@/lib/prompts/journal-analyst";
import { z } from "zod";
import { DEEPSEEK_API_KEY } from "@/lib/env";

// The API may route deepseek-chat to deepseek-v4-flash; this is expected and does not affect functionality.
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

export const AnalysisOutput = z.object({
  emotion: z.string(),
  intensity: z.number().min(1).max(5),
  summary: z.string(),
  reframe: z.string(),
  strategy: z.string(),
  mindfulness: z.string(),
  nudge: z.string(),
  safety_flag: z.boolean(),
  triggers: z.array(
    z.object({
      label: z.string(),
      category: z.string(),
      sentiment: z.number(),
    })
  ),
});

type AnalysisResult = z.infer<typeof AnalysisOutput>;

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

// sprint: 15s timeout. Move to configurable timeout per-agent.
const LLM_TIMEOUT_MS = 30000;

export function buildUserPrompt(journalBody: string, mood: number, energy: number, sleepHrs?: number): string {
  let prompt = `Journal entry:\n"""\n${journalBody}\n"""\n\nMood: ${mood}/5 | Energy: ${energy}/5`;
  if (sleepHrs != null) prompt += ` | Sleep: ${sleepHrs}h`;
  return prompt;
}

// sprint: JSON repair is minimal. Add jsonrepair package if DeepSeek malformation rate exceeds 5%.
export function sanitiseToolJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    // DeepSeek sometimes wraps JSON in markdown fences
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    return JSON.parse(cleaned);
  }
}

export async function analyseJournal(
  examType: string,
  journalBody: string,
  mood: number,
  energy: number,
  sleepHrs?: number
): Promise<AnalysisResult> {
  const systemPrompt = journalAnalystSystemPrompt(examType as Parameters<typeof journalAnalystSystemPrompt>[0]);
  const userPrompt = buildUserPrompt(journalBody, mood, energy, sleepHrs);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    // Step 1: Get tool calls from DeepSeek
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
    const message = data.choices?.[0]?.message;
    const toolCalls = message?.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      throw new LLMError("LLM_NO_TOOL_CALLS", "DeepSeek returned no tool calls in the response");
    }

    // Extract triggers from tool call 1
    const triggerCall = toolCalls.find(
      (tc: { function: { name: string } }) => tc.function.name === "extract_triggers"
    );
    const analysisCall = toolCalls.find(
      (tc: { function: { name: string } }) => tc.function.name === "produce_analysis"
    );

    if (!triggerCall || !analysisCall) {
      const foundNames = toolCalls.map((tc: { function: { name: string } }) => tc.function.name);
      throw new LLMError(
        "LLM_MISSING_TOOL",
        `Expected extract_triggers and produce_analysis, but got: [${foundNames.join(", ")}]`
      );
    }

    let triggersRaw: Record<string, unknown>;
    let analysisRaw: Record<string, unknown>;
    try {
      triggersRaw = sanitiseToolJson(triggerCall.function.arguments);
      analysisRaw = sanitiseToolJson(analysisCall.function.arguments);
    } catch {
      throw new LLMError(
        "LLM_MALFORMED_JSON",
        "DeepSeek returned malformed JSON in tool arguments"
      );
    }

    const triggers = (triggersRaw.triggers as Array<Record<string, unknown>> || []).map(
      (t: Record<string, unknown>) => ({
        label: String(t.label ?? "unknown"),
        category: String(t.category ?? "self"),
        sentiment: Number(t.sentiment ?? 0),
      })
    );

    const result = {
      emotion: String(analysisRaw.emotion ?? "anxiety"),
      intensity: Number(analysisRaw.intensity ?? 3),
      summary: String(analysisRaw.summary ?? ""),
      reframe: String(analysisRaw.reframe ?? ""),
      strategy: String(analysisRaw.strategy ?? ""),
      mindfulness: String(analysisRaw.mindfulness ?? ""),
      nudge: String(analysisRaw.nudge ?? ""),
      safety_flag: Boolean(analysisRaw.safety_flag ?? false),
      triggers,
    };

    // Zod validate at the boundary
    try {
      return AnalysisOutput.parse(result);
    } catch {
      throw new LLMError(
        "LLM_INVALID_OUTPUT",
        "DeepSeek analysis failed zod schema validation"
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
