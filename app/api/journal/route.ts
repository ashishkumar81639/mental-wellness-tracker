import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/route-utils";
import { sql } from "@/lib/db";

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { username } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      days: searchParams.get("days") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query params", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
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

    const entries = rows.map((row) => ({
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
            coping: row.coping_json,
            safety_flag: row.safety_flag,
          }
        : null,
    }));

    return NextResponse.json({ entries });
  } catch (err) {
    console.error("Journal fetch error:", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL" },
      { status: 500 }
    );
  }
}
