import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword, signToken } from "@/lib/auth";
import { sql } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

const LoginInput = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const rl = checkRateLimit(req, "auth:login");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const body = await req.json();
    const parsed = LoginInput.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const { username, password } = parsed.data;

    const rows = await sql`
      SELECT id, name, password_hash, exam_type, exam_date
      FROM users WHERE id = ${username}
    `;

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Invalid username or password", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const user = rows[0];
    const valid = await verifyPassword(password, user.password_hash);

    if (!valid) {
      return NextResponse.json(
        { error: "Invalid username or password", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const token = await signToken(username);

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        exam_type: user.exam_type,
        exam_date: user.exam_date,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL" },
      { status: 500 }
    );
  }
}
