import { NextRequest, NextResponse } from "next/server";
import { requireAuth, jsonError, rateLimit } from "@/lib/route-utils";
import { sql } from "@/lib/db";
import { analyseJournal } from "@/lib/agents/journal-analyst";
import { coerceExamType } from "@/lib/utils";
import { CheckInInput } from "@/lib/schemas";
import { z } from "zod";

/** Strip empty coping fields so the UI never shows blank Strategy/Mindfulness cards. */
function cleanCoping(coping: { strategy: string; mindfulness: string; nudge: string }) {
  const result: Record<string, string> = {};
  if (coping.strategy) result.strategy = coping.strategy;
  if (coping.mindfulness) result.mindfulness = coping.mindfulness;
  result.nudge = coping.nudge;
  return result;
}

export async function POST(req: Request) {
  const limited = rateLimit(req, "check-in");
  if (limited) return limited;

  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { username } = auth;

  try {
    const parsed = CheckInInput.safeParse(await req.json());
    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", "Invalid input", 400, {
        details: parsed.error.flatten(),
      });
    }

    const { body: journalBody, mood, energy, sleep_hrs } = parsed.data;

    const users = await sql`SELECT exam_type FROM users WHERE id = ${username}`;
    if (users.length === 0) {
      return jsonError("NOT_FOUND", "User not found", 404);
    }
    const examType = coerceExamType(users[0].exam_type);

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
      // Single batched insert via UNNEST instead of one round-trip per trigger.
      const labels = analysis.triggers.map((t) => t.label);
      const categories = analysis.triggers.map((t) => t.category);
      const sentiments = analysis.triggers.map((t) => t.sentiment);
      await sql`
        INSERT INTO triggers (analysis_id, label, category, sentiment)
        SELECT ${analysisId}, *
        FROM UNNEST(${labels}::text[], ${categories}::text[], ${sentiments}::int[])
      `;
    }

    return NextResponse.json({
      entry_id: entryId,
      analysis: {
        emotion: analysis.emotion,
        intensity: analysis.intensity,
        summary: analysis.summary,
        reframe: analysis.reframe,
        coping: cleanCoping({
          strategy: analysis.strategy,
          mindfulness: analysis.mindfulness,
          nudge: analysis.nudge,
        }),
        triggers: analysis.triggers,
        safety_flag: analysis.safety_flag,
      },
      llm_error: null,
    });
  } catch (err) {
    console.error("Check-in error:", err);
    return jsonError("INTERNAL", "Internal server error", 500);
  }
}

/**
 * DELETE /api/check-in?entry_id=N
 * Deletes a journal entry and all cascaded rows (mood_logs, ai_analysis, triggers).
 * Used by the smoke test script to clean up after itself.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { username } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("entry_id");
    const parsed = z.coerce.number().int().positive().safeParse(raw);
    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", "entry_id must be a positive integer", 400);
    }

    const entryId = parsed.data;

    // Only allow deleting own entries
    const rows = await sql`
      SELECT id FROM journal_entries
      WHERE id = ${entryId} AND user_id = ${username}
    `;
    if (rows.length === 0) {
      return jsonError("NOT_FOUND", "Entry not found", 404);
    }

    // CASCADE handles mood_logs, ai_analysis, triggers
    await sql`DELETE FROM journal_entries WHERE id = ${entryId}`;

    return NextResponse.json({ deleted: true, entry_id: entryId });
  } catch (err) {
    console.error("Check-in delete error:", err);
    return jsonError("INTERNAL", "Internal server error", 500);
  }
}
