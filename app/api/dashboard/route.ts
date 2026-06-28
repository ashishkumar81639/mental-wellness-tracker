import { NextRequest, NextResponse } from "next/server";
import { requireAuth, jsonError, cachedJson } from "@/lib/route-utils";
import { sql } from "@/lib/db";
import { calculateStreak } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { username } = auth;

  try {
    // The four widgets are independent reads - fire them in parallel.
    const [moodRows, triggerRows, emotionRows, streakRows] = await Promise.all([
      // Mood trend: last 14 days, in IST so dates match the user's calendar.
      // Cast through text to avoid node-postgres timezone-shifting DATE columns.
      sql`
        SELECT
          (ml.created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS date,
          ROUND(AVG(ml.mood)::numeric, 1) AS mood,
          ROUND(AVG(ml.energy)::numeric, 1) AS energy
        FROM mood_logs ml
        JOIN journal_entries je ON ml.entry_id = je.id
        WHERE je.user_id = ${username}
          AND ml.created_at >= now() - INTERVAL '14 days'
        GROUP BY (ml.created_at AT TIME ZONE 'Asia/Kolkata')::date
        ORDER BY date
      `,
      // Top triggers
      sql`
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
      `,
      // Emotion distribution: last 30 days
      sql`
        SELECT
          aa.emotion,
          COUNT(*)::int AS count
        FROM ai_analysis aa
        JOIN journal_entries je ON aa.entry_id = je.id
        WHERE je.user_id = ${username}
          AND je.created_at >= now() - INTERVAL '30 days'
        GROUP BY aa.emotion
        ORDER BY count DESC
      `,
      // Streak: consecutive days with a journal entry, in IST.
      sql`
        SELECT (je.created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS entry_date
        FROM journal_entries je
        WHERE je.user_id = ${username}
        ORDER BY entry_date DESC
        LIMIT 31
      `,
    ]);

    const moodTrend = moodRows.map((r) => ({
      date: r.date as string,
      mood: Number(r.mood),
      energy: Number(r.energy),
    }));

    const topTriggers = triggerRows.map((r) => ({
      label: r.label,
      category: r.category,
      count: r.count,
    }));

    const emotionDistribution = emotionRows.map((r) => ({
      emotion: r.emotion,
      count: r.count,
    }));

    const streak = calculateStreak(
      streakRows.map((r) => ({ entry_date: r.entry_date as string }))
    );

    return cachedJson({ moodTrend, topTriggers, emotionDistribution, streak });
  } catch (err) {
    console.error("Dashboard error:", err);
    return jsonError("INTERNAL", "Internal server error", 500);
  }
}
