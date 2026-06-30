import { NextResponse } from "next/server";
import { requireAuth, jsonError, rateLimit } from "@/lib/route-utils";
import { providerConfig, getTTS } from "@/lib/config/registry";
import { ensureRegistered } from "@/lib/config/register";
import { TTSInput } from "@/lib/schemas";
import { sanitizeForSpeech } from "@/lib/voice/speech-text";
import { sql } from "@/lib/db";
import { VOICE_CHAR_CAP } from "@/lib/budgets";

ensureRegistered();

export async function POST(req: Request) {
  const limited = rateLimit(req, "talk:tts");
  if (limited) return limited;

  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = TTSInput.safeParse(body);
    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", "Invalid TTS request", 400, {
        details: parsed.error.flatten(),
      });
    }

    const speechText = sanitizeForSpeech(parsed.data.text);
    if (!speechText) {
      return jsonError("VALIDATION_ERROR", "Nothing to speak after sanitizing", 422);
    }

    // Reserve voice budget BEFORE calling Sarvam. Atomic UPDATE ensures the
    // cap holds even under concurrent requests. No row returned = over cap.
    const len = speechText.length;
    const reserved = await sql`
      UPDATE users
      SET voice_chars_used = voice_chars_used + ${len}
      WHERE id = ${auth.username}
        AND voice_chars_used + ${len} <= ${VOICE_CHAR_CAP}
      RETURNING voice_chars_used
    `;
    if (reserved.length === 0) {
      return jsonError(
        "QUOTA_EXCEEDED",
        "You've used your free voice time. Keep chatting by text!",
        429,
        { waitlist: true, reason: "voice" }
      );
    }

    const config = providerConfig();
    console.log(
      `[tts] provider=${config.tts} chars=${len} lang=${parsed.data.language} used=${reserved[0].voice_chars_used}/${VOICE_CHAR_CAP}`
    );

    const tts = getTTS(config);
    const response = await tts.synthesize({
      ...parsed.data,
      text: speechText,
      tone: parsed.data.tone,
    });

    if (!response.ok) {
      // Refund the reserved chars on upstream failure so a transient error
      // doesn't burn the user's budget.
      await sql`
        UPDATE users SET voice_chars_used = GREATEST(voice_chars_used - ${len}, 0)
        WHERE id = ${auth.username}
      `.catch(() => {});
      const errText = await response.text().catch(() => "");
      console.error(`[tts] upstream error ${response.status}: ${errText.slice(0, 200)}`);
      throw new Error(`TTS provider returned ${response.status}`);
    }

    const contentType =
      response.headers.get("Content-Type") || "audio/mpeg";

    return new Response(response.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error("[tts]", err);
    return jsonError(
      "TTS_UNAVAILABLE",
      "Text-to-speech is unavailable. You can still read the response.",
      503
    );
  }
}
