import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { signToken } from "@/lib/auth";
import { sql } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

const RegisterInput = z.object({
  username: z.string().min(3).max(30).regex(/^[a-z0-9_]+$/, "Username must be lowercase letters, numbers, and underscores only"),
  name: z.string().min(1).max(100),
  password: z.string().min(6).max(128),
  exam_type: z.enum(["NEET", "JEE", "CUET", "CAT", "GATE", "UPSC", "boards", "other"]),
  exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD format").optional(),
});

export async function POST(req: Request) {
  const rl = checkRateLimit(req, "auth:register");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const body = await req.json();
    const parsed = RegisterInput.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", code: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { username, name, password, exam_type, exam_date } = parsed.data;

    const existing = await sql`SELECT id FROM users WHERE id = ${username}`;
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Username already taken", code: "CONFLICT" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const token = await signToken(username);

    await sql`
      INSERT INTO users (id, name, password_hash, exam_type, exam_date)
      VALUES (${username}, ${name}, ${passwordHash}, ${exam_type}, ${exam_date ?? null})
    `;

    return NextResponse.json({
      token,
      user: { id: username, name, exam_type, exam_date: exam_date ?? null },
    });
  } catch (err) {
    console.error("Register error:", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL" },
      { status: 500 }
    );
  }
}
