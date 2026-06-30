import { NextResponse } from "next/server";
import { requireAuth, jsonError, cachedJson } from "@/lib/route-utils";
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
        SELECT ml.mood
        FROM mood_logs ml
        JOIN journal_entries je ON ml.entry_id = je.id
        WHERE je.user_id = ${username}
          AND ml.created_at >= now() - INTERVAL '7 days'
      `,
    ]);

    if (users.length === 0) {
      return jsonError("NOT_FOUND", "User not found", 404);
    }

    const { exam_type, exam_date } = users[0];
    const examDate = exam_date ? new Date(exam_date) : null;
    const today = new Date();
    const daysLeft = examDate ? daysUntil(examDate, today) : null;

    const avgMood = averageMood(moodRows.map((r) => Number(r.mood)));
    const forecast = buildStressForecast(avgMood, examDate, today);
    const preloadedCoping = preloadedCopingFor(daysLeft);

    return cachedJson({
      exam_type,
      exam_date: examDate ? examDate.toISOString().split("T")[0] : null,
      days_left: daysLeft,
      forecast,
      preloadedCoping,
    });
  } catch (err) {
    console.error("Exam countdown error:", err);
    return jsonError("INTERNAL", "Internal server error", 500);
  }
}
