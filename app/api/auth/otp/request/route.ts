import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { jsonError, rateLimit } from "@/lib/route-utils";
import { OtpRequestInput } from "@/lib/schemas";
import { issueOtp } from "@/lib/otp";
import { sendOtpEmail } from "@/lib/email";

export async function POST(req: Request) {
  const limited = rateLimit(req, "auth:otp-request");
  if (limited) return limited;

  try {
    const parsed = OtpRequestInput.safeParse(await req.json());
    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", "Invalid input", 400);
    }

    const { email, purpose } = parsed.data;

    if (purpose === "reset") {
      // Only send reset codes to verified, registered emails.
      const rows = await sql`
        SELECT id FROM users WHERE email = ${email} AND email_verified = TRUE
      `;
      if (rows.length === 0) {
        // sprint: silent 202 to avoid email enumeration at this scale.
        return NextResponse.json(
          { message: "If that email exists, a code is on its way." },
          { status: 202 }
        );
      }
    }

    const code = await issueOtp(email, purpose);
    await sendOtpEmail(email, code, purpose);

    return NextResponse.json(
      { message: "Check your email for a 6-digit code.", email },
      { status: 202 }
    );
  } catch (err) {
    console.error("OTP request error:", err);
    return jsonError("INTERNAL", "Internal server error", 500);
  }
}
