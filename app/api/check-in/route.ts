import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/route-utils";
import { sql } from "@/lib/db";
import { analyseJournal } from "@/lib/agents/journal-analyst";
import { checkRateLimit } from "@/lib/rate-limit";

const CheckInInput = z.object({
  body: z.string().min(10).max(5000),
  mood: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
  sleep_hrs: z.number().min(0).max(24).optional(),
});

export async function POST(req: Request) {
  const rl = checkRateLimit(req, "check-in");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { username } = auth;

  try {
    const body = await req.json();
    const parsed = CheckInInput.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", code: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { body: journalBody, mood, energy, sleep_hrs } = parsed.data;

    const users = await sql`SELECT exam_type FROM users WHERE id = ${username}`;
    if (users.length === 0) {
      return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
    }
    const examType = users[0].exam_type;

    const entryRows = await sql`
      INSERT INTO journal_entries (user_id, body)
      VALUES (${username}, ${journalBody})
      RETURNING id
    `;
    const entryId = entryRows[0].id;

    await sql`
      INSERT INTO mood_logs (user_id, entry_id, mood, energy, sleep_hrs)
      VALUES (${username}, ${entryId}, ${mood}, ${energy}, ${sleep_hrs ?? null})
    `;

    let analysis;
    let llmError: { code: string; message: string } | null = null;
    try {
      analysis = await analyseJournal(examType, journalBody, mood, energy, sleep_hrs);
    } catch (err) {
      console.error("[LLM] Check-in analysis failed:", err);
      const code =
        err instanceof Error && "code" in err
          ? (err as { code: string }).code
          : "LLM_UNKNOWN";
      const message = err instanceof Error ? err.message : "Unknown LLM error";
      llmError = { code, message };

      // C2: do NOT write a fabricated analysis row on failure.
      // Return the journal entry id with a null analysis and the error code.
      // The client can surface the error and retry.
      return NextResponse.json(
        {
          entry_id: entryId,
          analysis: null,
          llm_error: llmError,
        },
        { status: 200 } // 200 so the client knows the entry was saved
      );
    }

    const analysisRows = await sql`
      INSERT INTO ai_analysis (entry_id, emotion, intensity, summary, reframe, coping_json, safety_flag)
      VALUES (
        ${entryId}, ${analysis.emotion}, ${analysis.intensity},
        ${analysis.summary}, ${analysis.reframe},
        ${JSON.stringify({ strategy: analysis.strategy, mindfulness: analysis.mindfulness, nudge: analysis.nudge })}::jsonb,
        ${analysis.safety_flag}
      )
      RETURNING id
    `;
    const analysisId = analysisRows[0].id;

    if (analysis.triggers.length > 0) {
      // sprint: batch insert with a single query. Fine for <10 triggers per entry.
      for (const t of analysis.triggers) {
        await sql`
          INSERT INTO triggers (analysis_id, label, category, sentiment)
          VALUES (${analysisId}, ${t.label}, ${t.category}, ${t.sentiment})
        `;
      }
    }

    return NextResponse.json({
      entry_id: entryId,
      analysis: {
        emotion: analysis.emotion,
        intensity: analysis.intensity,
        summary: analysis.summary,
        reframe: analysis.reframe,
        coping: {
          strategy: analysis.strategy,
          mindfulness: analysis.mindfulness,
          nudge: analysis.nudge,
        },
        triggers: analysis.triggers,
        safety_flag: analysis.safety_flag,
      },
      llm_error: null,
    });
  } catch (err) {
    console.error("Check-in error:", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL" },
      { status: 500 }
    );
  }
}
