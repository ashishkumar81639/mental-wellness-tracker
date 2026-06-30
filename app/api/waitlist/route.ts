import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { jsonError, rateLimit } from "@/lib/route-utils";
import { WaitlistInput } from "@/lib/schemas";

export async function POST(req: Request) {
  const limited = rateLimit(req, "waitlist");
  if (limited) return limited;

  try {
    const parsed = WaitlistInput.safeParse(await req.json());
    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", "Invalid input", 400);
    }

    const { email, reason, note } = parsed.data;

    // Idempotent: repeated clicks from the same email count once.
    await sql`
      INSERT INTO waitlist (email, reason, note)
      VALUES (${email}, ${reason}, ${note ?? null})
      ON CONFLICT (email) DO UPDATE
      SET reason = EXCLUDED.reason,
          note = COALESCE(EXCLUDED.note, waitlist.note)
    `;

    const count = await sql`SELECT COUNT(*)::int AS n FROM waitlist`;
    console.log(`[waitlist] new signup reason=${reason} total=${count[0].n}`);

    return NextResponse.json(
      { message: "You're on the list! We'll reach out when more capacity opens up.", total: count[0].n },
      { status: 201 }
    );
  } catch (err) {
    console.error("Waitlist error:", err);
    return jsonError("INTERNAL", "Internal server error", 500);
  }
}
