import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/route-utils";
import { sql } from "@/lib/db";
import { reframeThought } from "@/lib/agents/reframe";
import { checkRateLimit } from "@/lib/rate-limit";

const ReframeInput = z.object({
  thought: z.string().min(5).max(2000),
});

export async function POST(req: Request) {
  const rl = checkRateLimit(req, "reframe");
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
    const parsed = ReframeInput.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", code: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { thought } = parsed.data;

    const users = await sql`SELECT exam_type FROM users WHERE id = ${username}`;
    if (users.length === 0) {
      return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
    }

    let reframe: string;
    try {
      reframe = await reframeThought(users[0].exam_type, thought);
    } catch (err) {
      console.error("Reframe LLM error:", err);
      reframe =
        "It makes sense that this thought is weighing on you. When we're stressed, our mind tends to see things in extremes. Try stepping back for a moment — this thought is one perspective, not the full truth. What would you tell a friend who said this to you?";
    }

    const trimmed = z.string().min(20).max(600).safeParse(reframe);
    const result = trimmed.success
      ? trimmed.data
      : "It makes sense that this thought is weighing on you. When we're stressed, our mind tends to see things in extremes. Try stepping back — this thought is one perspective, not the full truth.";

    return NextResponse.json({ reframe: result });
  } catch (err) {
    console.error("Reframe error:", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL" },
      { status: 500 }
    );
  }
}
