import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, jsonError, rateLimit } from "@/lib/route-utils";
import { sql } from "@/lib/db";
import { reframeThought } from "@/lib/agents/reframe";
import { coerceExamType } from "@/lib/utils";
import { ReframeInput } from "@/lib/schemas";

export async function POST(req: Request) {
  const limited = rateLimit(req, "reframe");
  if (limited) return limited;

  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { username } = auth;

  try {
    const parsed = ReframeInput.safeParse(await req.json());
    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", "Invalid input", 400, {
        details: parsed.error.flatten(),
      });
    }

    const { thought } = parsed.data;

    const users = await sql`SELECT exam_type FROM users WHERE id = ${username}`;
    if (users.length === 0) {
      return jsonError("NOT_FOUND", "User not found", 404);
    }

    let reframe: string;
    try {
      reframe = await reframeThought(coerceExamType(users[0].exam_type), thought);
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
    return jsonError("INTERNAL", "Internal server error", 500);
  }
}
