import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/route-utils";
import { sql } from "@/lib/db";
import {
  averageMood,
  buildStressForecast,
  daysUntil,
  preloadedCopingFor,
} from "@/lib/utils";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { username } = auth;

  try {
    const [users, moodRows] = await Promise.all([
      sql`SELECT exam_type, exam_date FROM users WHERE id = ${username}`,
      sql`
        SELECT ROUND(AVG(ml.mood)::numeric, 1) AS mood
        FROM mood_logs ml
        JOIN journal_entries je ON ml.entry_id = je.id
        WHERE je.user_id = ${username}
          AND ml.created_at >= now() - INTERVAL '7 days'
        GROUP BY ml.created_at::date
      `,
    ]);

    if (users.length === 0) {
      return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const { exam_type, exam_date } = users[0];
    const examDate = exam_date ? new Date(exam_date) : null;
    const today = new Date();
    const daysLeft = examDate ? daysUntil(examDate, today) : null;

    const avgMood = averageMood(moodRows.map((r) => Number(r.mood)));
    const forecast = buildStressForecast(avgMood, examDate, today);
    const preloadedCoping = preloadedCopingFor(daysLeft);

    return NextResponse.json({
      exam_type,
      exam_date: examDate ? examDate.toISOString().split("T")[0] : null,
      days_left: daysLeft,
      forecast,
      preloadedCoping,
    });
  } catch (err) {
    console.error("Exam countdown error:", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL" },
      { status: 500 }
    );
  }
}
