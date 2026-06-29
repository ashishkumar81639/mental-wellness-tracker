import { NextResponse } from "next/server";
import { requireAuth, jsonError } from "@/lib/route-utils";
import { providerConfig, getTTS } from "@/lib/config/registry";
import { ensureRegistered } from "@/lib/config/register";
import { TTSInput } from "@/lib/schemas";
import { sanitizeForSpeech } from "@/lib/voice/speech-text";

ensureRegistered();

export async function POST(req: Request) {
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

    const config = providerConfig();
    console.log(
      `[tts] provider=${config.tts} chars=${speechText.length} lang=${parsed.data.language}`
    );

    const tts = getTTS(config);
    const response = await tts.synthesize({ ...parsed.data, text: speechText });

    if (!response.ok) {
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
