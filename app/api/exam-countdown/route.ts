import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/route-utils";
import { sql } from "@/lib/db";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { username } = auth;

  try {
    const users = await sql`
      SELECT exam_type, exam_date FROM users WHERE id = ${username}
    `;
    if (users.length === 0) {
      return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const { exam_type, exam_date } = users[0];

    let daysLeft: number | null = null;
    if (exam_date) {
      const examDate = new Date(exam_date);
      const now = new Date();
      daysLeft = Math.ceil(
        (examDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    // Get recent mood trend to inform forecast
    const moodRows = await sql`
      SELECT
        ml.created_at::date AS date,
        ROUND(AVG(ml.mood)::numeric, 1) AS mood
      FROM mood_logs ml
      JOIN journal_entries je ON ml.entry_id = je.id
      WHERE je.user_id = ${username}
        AND ml.created_at >= now() - INTERVAL '7 days'
      GROUP BY ml.created_at::date
      ORDER BY date
    `;

    const recentMood = moodRows.map((r) => ({ date: r.date, mood: Number(r.mood) }));

    // sprint: simplified forecast from recent mood trend + exam proximity.
    // Upgrade: GenAI-powered forecast with DeepSeek for richer reasoning.
    const forecast: Array<{ date: string; predictedStress: number; reason: string }> = [];
    const today = new Date();
    const avgMood =
      recentMood.length > 0
        ? recentMood.reduce((s, r) => s + r.mood, 0) / recentMood.length
        : 3;

    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];

      // Days to exam (or null)
      let daysToExam: number | null = null;
      if (exam_date) {
        daysToExam = Math.ceil(
          (new Date(exam_date).getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
        );
      }

      // Stress increases as exam approaches
      let predictedStress = 5 - avgMood;
      if (daysToExam !== null && daysToExam <= 7) {
        predictedStress += (7 - daysToExam) * 0.2;
      }
      predictedStress = Math.max(1, Math.min(5, Math.round(predictedStress)));

      const reason =
        daysToExam !== null && daysToExam <= 7
          ? `Exam in ${daysToExam} days — pre-exam peak expected`
          : `Based on your recent mood trend of ${avgMood.toFixed(1)}/5`;

      forecast.push({ date: dateStr, predictedStress, reason });
    }

    // Preloaded coping: custom message based on exam proximity
    let preloadedCoping: string;
    if (daysLeft !== null && daysLeft <= 3) {
      preloadedCoping =
        "You're in the final stretch. The next few days are about maintenance, not marathons. Stick to revision, sleep 7+ hours, and do one 2-minute box breathing session before each mock. You've prepared — now trust that.";
    } else if (daysLeft !== null && daysLeft <= 14) {
      preloadedCoping =
        "Two weeks to go. This is when anxiety spikes hardest — it's normal, not a sign you're unprepared. Focus on mock tests and pattern recognition, not new topics. And remember: your worth was never on that marksheet.";
    } else if (daysLeft !== null) {
      preloadedCoping =
        `You have ${daysLeft} days. That's enough time to cover ground meaningfully, not frantically. Build a rhythm: study block, break, repeat. Your nervous system needs rest as much as your brain needs revision.`;
    } else {
      preloadedCoping =
        "Set your exam date on your profile to unlock a personalised countdown and coping plan. Until then — steady rhythm, kind self-talk, one day at a time.";
    }

    return NextResponse.json({
      exam_type,
      exam_date: exam_date ? exam_date.toISOString().split("T")[0] : null,
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
