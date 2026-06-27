// Pure utility functions: no env, no DB, no network.
// Everything here is deterministic and unit-testable in isolation.

import { z } from "zod";

// --- Exam type ---------------------------------------------------------------

export const EXAM_TYPES = [
  "NEET",
  "JEE",
  "CUET",
  "CAT",
  "GATE",
  "UPSC",
  "boards",
  "other",
] as const;

export type ExamType = (typeof EXAM_TYPES)[number];

/**
 * Narrow an untrusted string (e.g. a DB column) to a known ExamType.
 * Falls back to "other" so downstream prompt lookups always succeed.
 */
export function coerceExamType(value: string | null | undefined): ExamType {
  return (EXAM_TYPES as readonly string[]).includes(value ?? "")
    ? (value as ExamType)
    : "other";
}

// --- Journal analysis prompt + parsing --------------------------------------

export function buildUserPrompt(
  journalBody: string,
  mood: number,
  energy: number,
  sleepHrs?: number
): string {
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

/**
 * Coercing schema for the LLM tool output. Each field self-heals to a safe
 * default via `.catch()` so a single malformed key never sinks the whole
 * analysis, while the shape stays strongly typed at the boundary.
 */
export const AnalysisSchema = z.object({
  emotion: z.string().min(1).catch("anxiety"),
  intensity: z.number().int().min(1).max(5).catch(3),
  summary: z.string().catch(""),
  reframe: z.string().catch(""),
  strategy: z.string().catch(""),
  mindfulness: z.string().catch(""),
  nudge: z.string().catch(""),
  safety_flag: z.boolean().catch(false),
  triggers: z
    .array(
      z.object({
        label: z.string().min(1).catch("unknown"),
        category: z.string().min(1).catch("self"),
        sentiment: z.number().catch(0),
      })
    )
    .catch([]),
});

export type AnalysisResult = z.infer<typeof AnalysisSchema>;

/**
 * Merge the two DeepSeek tool-call payloads into one validated analysis object.
 * Pure: takes already-parsed JSON, returns a typed, defaulted result.
 */
export function parseAnalysis(
  analysisRaw: Record<string, unknown>,
  triggersRaw: Record<string, unknown>
): AnalysisResult {
  return AnalysisSchema.parse({ ...analysisRaw, triggers: triggersRaw.triggers });
}

// --- Streak ------------------------------------------------------------------

/**
 * Calculate the streak of consecutive days with a journal entry ending at today.
 * If today has no entry, the streak starts counting from yesterday backward.
 */
export function calculateStreak(
  dates: Array<{ entry_date: string }>,
  today: Date = new Date()
): number {
  const dateSet = new Set(dates.map((r) => r.entry_date));
  let streak = 0;

  for (let i = 0; i < 31; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    if (dateSet.has(key)) {
      streak++;
    } else if (i === 0) {
      // today missing, check if yesterday starts the streak
      continue;
    } else {
      break;
    }
  }

  return streak;
}

// --- Exam countdown forecast -------------------------------------------------

/** Whole days from `from` until `target`, rounded up. Negative once past. */
export function daysUntil(target: Date, from: Date = new Date()): number {
  return Math.ceil((target.getTime() - from.getTime()) / 86_400_000);
}

/** Mean of a list of moods, defaulting to a neutral 3 when there is no data. */
export function averageMood(moods: number[]): number {
  if (moods.length === 0) return 3;
  return moods.reduce((sum, m) => sum + m, 0) / moods.length;
}

export interface StressPoint {
  date: string;
  predictedStress: number;
  reason: string;
}

/**
 * Deterministic 7-day stress forecast from recent mood + exam proximity.
 * sprint: heuristic. Upgrade path: GenAI forecast with DeepSeek for richer reasoning.
 */
export function buildStressForecast(
  avgMood: number,
  examDate: Date | null,
  today: Date = new Date(),
  horizonDays = 7
): StressPoint[] {
  const forecast: StressPoint[] = [];

  for (let i = 0; i < horizonDays; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];

    const daysToExam = examDate ? daysUntil(examDate, d) : null;

    let predictedStress = 5 - avgMood;
    if (daysToExam !== null && daysToExam <= 7) {
      predictedStress += (7 - daysToExam) * 0.2;
    }
    predictedStress = Math.max(1, Math.min(5, Math.round(predictedStress)));

    const reason =
      daysToExam !== null && daysToExam <= 7
        ? `Exam in ${daysToExam} days - pre-exam peak expected`
        : `Based on your recent mood trend of ${avgMood.toFixed(1)}/5`;

    forecast.push({ date: dateStr, predictedStress, reason });
  }

  return forecast;
}

/** Stage-appropriate coping copy keyed off days remaining to the exam. */
export function preloadedCopingFor(daysLeft: number | null): string {
  if (daysLeft !== null && daysLeft <= 3) {
    return "You're in the final stretch. The next few days are about maintenance, not marathons. Stick to revision, sleep 7+ hours, and do one 2-minute box breathing session before each mock. You've prepared - now trust that.";
  }
  if (daysLeft !== null && daysLeft <= 14) {
    return "Two weeks to go. This is when anxiety spikes hardest - it's normal, not a sign you're unprepared. Focus on mock tests and pattern recognition, not new topics. And remember: your worth was never on that marksheet.";
  }
  if (daysLeft !== null) {
    return `You have ${daysLeft} days. That's enough time to cover ground meaningfully, not frantically. Build a rhythm: study block, break, repeat. Your nervous system needs rest as much as your brain needs revision.`;
  }
  return "Set your exam date on your profile to unlock a personalised countdown and coping plan. Until then - steady rhythm, kind self-talk, one day at a time.";
}
