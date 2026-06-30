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

    const { email, password } = parsed.data;

    const rows = await sql`
      SELECT id, name, password_hash, email_verified, exam_type, exam_date
      FROM users WHERE email = ${email}
    `;

    // Compare against the hash (or a dummy) so timing does not reveal whether
    // the email exists. The dummy hash matches the bcrypt cost factor so
    // both branches run in comparable time.
    const user = rows[0];
    const valid = user
      ? await verifyPassword(password, user.password_hash)
      : // sprint: static dummy hash. Rotate alongside the real hashes if cost changes.
        await verifyPassword(password, "$2a$10$DummyHashForTimingAttac.kMitigation.ABCDEFGHIJKLMNOPQRS");

    if (!user || !valid) {
      return jsonError("UNAUTHORIZED", "Invalid email or password", 401);
    }
    if (!user.email_verified) {
      return jsonError(
        "EMAIL_NOT_VERIFIED",
        "Please verify your email first. Request a new code.",
        403
      );
    }

    const token = await signToken(user.id);

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email,
        exam_type: user.exam_type,
        exam_date: user.exam_date,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return jsonError("INTERNAL", "Internal server error", 500);
  }
}
