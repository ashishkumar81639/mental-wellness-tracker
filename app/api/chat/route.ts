import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/route-utils";
import { sql } from "@/lib/db";
import { streamCompanionReply } from "@/lib/agents/companion";
import { checkRateLimit } from "@/lib/rate-limit";
import { coerceExamType } from "@/lib/utils";

const ChatInput = z.object({
  message: z.string().min(1).max(3000),
});

export async function POST(req: Request) {
  const rl = checkRateLimit(req, "chat");
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
    const parsed = ChatInput.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", code: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { message } = parsed.data;

    // These four reads only depend on the user id - run them in parallel.
    const [users, journals, chatRows, latestMood] = await Promise.all([
      sql`SELECT name, exam_type FROM users WHERE id = ${username}`,
      // Recent journal summaries (last 7 entries for context)
      sql`
        SELECT je.created_at::date AS date, aa.emotion, aa.summary
        FROM journal_entries je
        LEFT JOIN ai_analysis aa ON aa.entry_id = je.id
        WHERE je.user_id = ${username}
        ORDER BY je.created_at DESC
        LIMIT 7
      `,
      // M1: latest 15 messages (DESC then reverse for chronological order)
      sql`
        SELECT role, content, created_at::text AS created_at
        FROM chat_messages
        WHERE user_id = ${username}
        ORDER BY created_at DESC
        LIMIT 15
      `,
      // m4: FR10 state-adaptive persona - latest mood + emotion
      sql`
        SELECT ml.mood, aa.emotion
        FROM mood_logs ml
        JOIN journal_entries je ON ml.entry_id = je.id
        LEFT JOIN ai_analysis aa ON aa.entry_id = je.id
        WHERE je.user_id = ${username}
          AND aa.emotion IS NOT NULL
        ORDER BY je.created_at DESC
        LIMIT 1
      `,
    ]);

    if (users.length === 0) {
      return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
    }
    const { name } = users[0];
    const examType = coerceExamType(users[0].exam_type);

    const recentJournals = journals
      .filter((j) => j.emotion)
      .map((j) => ({
        date: j.date.toISOString().split("T")[0],
        emotion: j.emotion,
        summary: j.summary,
      }));

    const chatHistory = chatRows
      .reverse()
      .map((r) => ({
        role: r.role as "user" | "assistant",
        content: r.content,
        created_at: r.created_at,
      }));

    const currentMood = latestMood.length > 0 ? Number(latestMood[0].mood) : null;
    const currentEmotion = latestMood.length > 0 ? (latestMood[0].emotion as string) : null;

    await sql`
      INSERT INTO chat_messages (user_id, role, content)
      VALUES (${username}, 'user', ${message})
    `;

    const encoder = new TextEncoder();
    let fullReply = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const token of streamCompanionReply(
            examType,
            name,
            recentJournals,
            chatHistory,
            message,
            currentMood,
            currentEmotion
          )) {
            fullReply += token;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ token })}\n\n`)
            );
          }

          await sql`
            INSERT INTO chat_messages (user_id, role, content)
            VALUES (${username}, 'assistant', ${fullReply})
          `;

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          console.error("Chat stream error:", err);
          const fallback =
            "I'm having a moment. Can you give me a second? Sometimes the connection gets a little slow.";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ token: fallback })}\n\n`
            )
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Chat error:", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL" },
      { status: 500 }
    );
  }
}
