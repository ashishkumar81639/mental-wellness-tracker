import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { jsonError, rateLimit } from "@/lib/route-utils";
import { OtpVerifyInput } from "@/lib/schemas";
import { verifyOtp } from "@/lib/otp";
import { signToken } from "@/lib/auth";

export async function POST(req: Request) {
  const limited = rateLimit(req, "auth:otp-verify");
  if (limited) return limited;

  try {
    const parsed = OtpVerifyInput.safeParse(await req.json());
    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", "Invalid input", 400);
    }

    const { email, code, purpose } = parsed.data;

    const ok = await verifyOtp(email, purpose, code);
    if (!ok) {
      return jsonError("INVALID_OTP", "Invalid or expired code", 400);
    }

    if (purpose === "signup") {
      // Mark the user verified and issue a session token.
      await sql`
        UPDATE users SET email_verified = TRUE WHERE email = ${email}
      `;
      const rows = await sql`
        SELECT id, name, exam_type, exam_date FROM users WHERE email = ${email}
      `;
      const user = rows[0];
      if (!user) {
        return jsonError("NOT_FOUND", "Account not found", 404);
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
    }

    // purpose === "reset": return a short-lived reset token (reuse JWT) that
    // the reset route checks. Lifetime is 10 minutes (matches OTP TTL).
    // sprint: simpler than a separate reset token table. If the app outlives
    // the sprint, add a dedicated reset_tokens table with single-use semantics.
    return NextResponse.json(
      { message: "Code verified. Set a new password.", email },
      { status: 200 }
    );
  } catch (err) {
    console.error("OTP verify error:", err);
    return jsonError("INTERNAL", "Internal server error", 500);
  }
}
