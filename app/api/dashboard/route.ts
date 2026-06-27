import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/route-utils";
import { sql } from "@/lib/db";
import { calculateStreak } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { username } = auth;

  try {
    // Mood trend: last 14 days
    const moodRows = await sql`
      SELECT
        ml.created_at::date AS date,
        ROUND(AVG(ml.mood)::numeric, 1) AS mood,
        ROUND(AVG(ml.energy)::numeric, 1) AS energy
      FROM mood_logs ml
      JOIN journal_entries je ON ml.entry_id = je.id
      WHERE je.user_id = ${username}
        AND ml.created_at >= now() - INTERVAL '14 days'
      GROUP BY ml.created_at::date
      ORDER BY date
    `;

    const moodTrend = moodRows.map((r) => ({
      date: r.date.toISOString().split("T")[0],
      mood: Number(r.mood),
      energy: Number(r.energy),
    }));

    // Top triggers
    const triggerRows = await sql`
      SELECT
        t.label,
        t.category,
        COUNT(*)::int AS count
      FROM triggers t
      JOIN ai_analysis aa ON t.analysis_id = aa.id
      JOIN journal_entries je ON aa.entry_id = je.id
      WHERE je.user_id = ${username}
      GROUP BY t.label, t.category
      ORDER BY count DESC
      LIMIT 10
    `;

    const topTriggers = triggerRows.map((r) => ({
      label: r.label,
      category: r.category,
      count: r.count,
    }));

    // Emotion distribution
    const emotionRows = await sql`
      SELECT
        aa.emotion,
        COUNT(*)::int AS count
      FROM ai_analysis aa
      JOIN journal_entries je ON aa.entry_id = je.id
      WHERE je.user_id = ${username}
        AND je.created_at >= now() - INTERVAL '30 days'
      GROUP BY aa.emotion
      ORDER BY count DESC
    `;

    const emotionDistribution = emotionRows.map((r) => ({
      emotion: r.emotion,
      count: r.count,
    }));

    // Streak: consecutive days with a journal entry
    const streakRows = await sql`
      SELECT je.created_at::date AS entry_date
      FROM journal_entries je
      WHERE je.user_id = ${username}
      ORDER BY entry_date DESC
      LIMIT 31
    `;

    const streak = calculateStreak(
      streakRows.map((r) => ({ entry_date: r.entry_date.toISOString().split("T")[0] }))
    );

    return NextResponse.json({
      moodTrend,
      topTriggers,
      emotionDistribution,
      streak,
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL" },
      { status: 500 }
    );
  }
}
