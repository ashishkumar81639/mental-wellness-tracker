import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError, rateLimit } from "@/lib/route-utils";
import { ResetPasswordInput } from "@/lib/schemas";
import { verifyOtp } from "@/lib/otp";

export async function POST(req: Request) {
  const limited = rateLimit(req, "auth:reset");
  if (limited) return limited;

  try {
    const parsed = ResetPasswordInput.safeParse(await req.json());
    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", "Invalid input", 400);
    }

    const { email, code, password } = parsed.data;

    const ok = await verifyOtp(email, "reset", code);
    if (!ok) {
      return jsonError("INVALID_OTP", "Invalid or expired code", 400);
    }

    const passwordHash = await hashPassword(password);
    await sql`
      UPDATE users SET password_hash = ${passwordHash}
      WHERE email = ${email} AND email_verified = TRUE
    `;

    return NextResponse.json({ message: "Password updated. Sign in with your new password." });
  } catch (err) {
    console.error("Reset error:", err);
    return jsonError("INTERNAL", "Internal server error", 500);
  }
}
