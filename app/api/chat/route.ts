import { NextResponse } from "next/server";
import { requireAuth, jsonError, rateLimit } from "@/lib/route-utils";
import { sql } from "@/lib/db";
import { streamCompanionReply } from "@/lib/agents/companion";
import { coerceExamType } from "@/lib/utils";
import { ChatInput } from "@/lib/schemas";

export async function POST(req: Request) {
  const limited = rateLimit(req, "chat");
  if (limited) return limited;

  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { username } = auth;

  try {
    const parsed = ChatInput.safeParse(await req.json());
    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", "Invalid input", 400, {
        details: parsed.error.flatten(),
      });
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
      return jsonError("NOT_FOUND", "User not found", 404);
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

    // The companion starts each reply with a hidden tone tag like
    // [[tone:gentle]]. We parse it off the front, emit it as its own SSE event
    // (the voice client maps it to delivery), and keep it out of the displayed
    // text and the stored message. Text chat never sees it.
    const TAG_RE = /^\s*\[\[\s*tone\s*:\s*([a-zA-Z]+)\s*\]\]\s*/i;
    let tagResolved = false;
    let tagBuf = "";

    const stream = new ReadableStream({
      async start(controller) {
        const emitToken = (t: string) => {
          if (!t) return;
          fullReply += t;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ token: t })}\n\n`)
          );
        };

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
            if (tagResolved) {
              emitToken(token);
              continue;
            }
            tagBuf += token;
            const match = tagBuf.match(TAG_RE);
            if (match) {
              tagResolved = true;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ tone: match[1].toLowerCase() })}\n\n`
                )
              );
              emitToken(tagBuf.slice(match[0].length));
              tagBuf = "";
            } else {
              // Stop buffering once the start can no longer be the tag, or we've
              // waited long enough — then flush what we held as normal text.
              const head = tagBuf.replace(/^\s+/, "").slice(0, 7);
              const couldBeTag = "[[tone:".startsWith(head) || head === "[[tone:";
              if (!couldBeTag || tagBuf.length > 40) {
                tagResolved = true;
                emitToken(tagBuf);
                tagBuf = "";
              }
            }
          }
          if (!tagResolved) emitToken(tagBuf); // short reply: flush leftover

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
    return jsonError("INTERNAL", "Internal server error", 500);
  }
}
