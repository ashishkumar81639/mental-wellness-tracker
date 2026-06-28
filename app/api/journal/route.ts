import { NextRequest, NextResponse } from "next/server";
import { requireAuth, jsonError, cachedJson } from "@/lib/route-utils";
import { sql } from "@/lib/db";
import { JournalQuery } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { username } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = JournalQuery.safeParse({
      days: searchParams.get("days") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", "Invalid query params", 400);
    }

    const { days, offset, limit } = parsed.data;

    const rows = await sql`
      SELECT
        je.id AS entry_id,
        je.body,
        je.created_at,
        ml.mood,
        ml.energy,
        ml.sleep_hrs,
        aa.emotion,
        aa.intensity,
        aa.summary,
        aa.reframe,
        aa.coping_json,
        aa.safety_flag
      FROM journal_entries je
      LEFT JOIN mood_logs ml ON ml.entry_id = je.id
      LEFT JOIN ai_analysis aa ON aa.entry_id = je.id
      WHERE je.user_id = ${username}
        AND je.created_at >= now() - (${days} || ' days')::interval
      ORDER BY je.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const entries = rows.map((row) => {
      const copingRaw = row.coping_json as { strategy?: string; mindfulness?: string; nudge?: string } | null;
      const coping = copingRaw
        ? Object.fromEntries(
            Object.entries(copingRaw).filter(([k, v]) => k === "nudge" || (typeof v === "string" && v.length > 0))
          )
        : null;

      return {
        entry_id: row.entry_id,
        body: row.body,
        created_at: row.created_at,
        mood: row.mood,
        energy: row.energy,
        sleep_hrs: row.sleep_hrs,
        analysis: row.emotion
          ? {
              emotion: row.emotion,
              intensity: row.intensity,
              summary: row.summary,
              reframe: row.reframe,
              coping,
              safety_flag: row.safety_flag,
            }
          : null,
      };
    });

    return cachedJson({ entries });
  } catch (err) {
    console.error("Journal fetch error:", err);
    return jsonError("INTERNAL", "Internal server error", 500);
  }
}
