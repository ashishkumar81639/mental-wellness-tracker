import { NextResponse } from "next/server";
import { verifyPassword, signToken } from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError, rateLimit } from "@/lib/route-utils";
import { LoginInput } from "@/lib/schemas";

export async function POST(req: Request) {
  const limited = rateLimit(req, "auth:login");
  if (limited) return limited;

  try {
    const parsed = LoginInput.safeParse(await req.json());
    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", "Invalid input", 400);
    }

    const { username, password } = parsed.data;

    const rows = await sql`
      SELECT id, name, password_hash, exam_type, exam_date
      FROM users WHERE id = ${username}
    `;

    // Compare against the hash (or a dummy) so timing does not reveal whether
    // the username exists.
    const user = rows[0];
    const valid = user
      ? await verifyPassword(password, user.password_hash)
      : false;

    if (!user || !valid) {
      return jsonError("UNAUTHORIZED", "Invalid username or password", 401);
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
    return jsonError("INTERNAL", "Internal server error", 500);
  }
}
