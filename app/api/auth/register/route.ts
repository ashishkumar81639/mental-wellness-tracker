import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { signToken } from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError, rateLimit } from "@/lib/route-utils";
import { RegisterInput } from "@/lib/schemas";

export async function POST(req: Request) {
  const limited = rateLimit(req, "auth:register");
  if (limited) return limited;

  try {
    const parsed = RegisterInput.safeParse(await req.json());
    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", "Invalid input", 400, {
        details: parsed.error.flatten(),
      });
    }

    const { username, name, password, exam_type, exam_date } = parsed.data;

    const existing = await sql`SELECT id FROM users WHERE id = ${username}`;
    if (existing.length > 0) {
      return jsonError("CONFLICT", "Username already taken", 409);
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
    return jsonError("INTERNAL", "Internal server error", 500);
  }
}
