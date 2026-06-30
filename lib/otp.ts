import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { OTP_TTL_MS } from "@/lib/email";

export type OtpPurpose = "signup" | "reset";

// Cryptographically random 6-digit code, zero-padded.
export function generateOtp(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

function hashOtp(code: string): Promise<string> {
  // Lower cost than passwords - OTPs are short-lived and 6 digits.
  return bcrypt.hash(code, 10);
}

/**
 * Issue a new OTP for (email, purpose). Invalidates any prior active codes
 * for the same email+purpose by marking them consumed, so only the newest
 * code works. Returns the plaintext code so the caller can email it.
 */
export async function issueOtp(
  email: string,
  purpose: OtpPurpose
): Promise<string> {
  const code = generateOtp();
  const codeHash = await hashOtp(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await sql`
    WITH invalidated AS (
      UPDATE otp_codes
      SET consumed_at = now()
      WHERE email = ${email} AND purpose = ${purpose} AND consumed_at IS NULL
    )
    INSERT INTO otp_codes (email, purpose, code_hash, expires_at)
    VALUES (${email}, ${purpose}, ${codeHash}, ${expiresAt})
  `;

  return code;
}

/**
 * Verify a code without consuming it (used for signup verify + reset).
 * On success, marks the code consumed and returns true. Constant-ish time:
 * we always run a bcrypt compare even if no row exists.
 */
export async function verifyOtp(
  email: string,
  purpose: OtpPurpose,
  code: string
): Promise<boolean> {
  const rows = await sql`
    SELECT id, code_hash, expires_at
    FROM otp_codes
    WHERE email = ${email} AND purpose = ${purpose} AND consumed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const row = rows[0];
  const dummyHash =
    "$2a$10$DummyHashForTimingAttac.kMitigation.ABCDEFGHIJKLMNOPQRS";
  const ok = await bcrypt.compare(code, row?.code_hash ?? dummyHash);

  if (!row || !ok) return false;
  if (new Date(row.expires_at).getTime() < Date.now()) return false;

  await sql`
    UPDATE otp_codes SET consumed_at = now() WHERE id = ${row.id}
  `;
  return true;
}
