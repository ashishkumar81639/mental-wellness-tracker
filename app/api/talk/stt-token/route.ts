import { NextResponse } from "next/server";
import { requireAuth, jsonError } from "@/lib/route-utils";
import { providerConfig, getSTT } from "@/lib/config/registry";
import { ensureRegistered } from "@/lib/config/register";

ensureRegistered();

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const config = providerConfig();
    console.log(`[stt-token] provider=${config.stt} user=${auth.username}`);

    const stt = getSTT(config);
    const streamConfig = await stt.getStreamConfig();
    return NextResponse.json(streamConfig);
  } catch (err) {
    console.error("[stt-token]", err);
    return jsonError(
      "STT_UNAVAILABLE",
      "Speech-to-text is unavailable right now. Please type instead.",
      503
    );
  }
}
