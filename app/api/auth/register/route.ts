import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError, rateLimit } from "@/lib/route-utils";
import { RegisterInput } from "@/lib/schemas";
import { issueOtp } from "@/lib/otp";
import { sendOtpEmail } from "@/lib/email";

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

    const { email, name, password, exam_type, exam_date } = parsed.data;

    // Pre-check: if email already in use AND verified, block. If pending
    // unverified, we allow re-registration (resends OTP, overwrites row).
    const existing = await sql`
      SELECT id FROM users WHERE email = ${email} AND email_verified = TRUE
    `;
    if (existing.length > 0) {
      return jsonError("CONFLICT", "Email already registered", 409);
    }

    const passwordHash = await hashPassword(password);

    // Insert or replace the unverified row. Keep id stable if a pending
    // row already exists so re-send does not create duplicates.
    // ON CONFLICT target must match the partial unique index (email WHERE NOT NULL).
    await sql`
      INSERT INTO users (id, name, password_hash, email, email_verified, exam_type, exam_date)
      VALUES (
        ${email}, ${name}, ${passwordHash}, ${email}, FALSE,
        ${exam_type}, ${exam_date ?? null}
      )
      ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE
      SET name = EXCLUDED.name,
          password_hash = EXCLUDED.password_hash,
          email_verified = FALSE,
          exam_type = EXCLUDED.exam_type,
          exam_date = EXCLUDED.exam_date
      WHERE users.email_verified = FALSE
    `;

    const code = await issueOtp(email, "signup");
    await sendOtpEmail(email, code, "signup");

    return NextResponse.json(
      { message: "Check your email for a 6-digit code.", email },
      { status: 202 }
    );
  } catch (err) {
    console.error("Register error:", err);
    return jsonError("INTERNAL", "Internal server error", 500);
  }
}
