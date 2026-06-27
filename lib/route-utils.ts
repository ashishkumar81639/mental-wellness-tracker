import { verifyToken, extractToken } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

/** Uniform `{ error, code }` error envelope. Never leaks stack traces to clients. */
export function jsonError(
  code: string,
  message: string,
  status: number,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json({ error: message, code, ...extra }, { status });
}

/**
 * Returns a 429 response when the caller is over the per-endpoint limit,
 * otherwise null. Lets routes guard with a single early return.
 */
export function rateLimit(req: Request, endpoint: string): NextResponse | null {
  const rl = checkRateLimit(req, endpoint);
  if (rl.allowed) return null;
  return NextResponse.json(
    { error: "Too many requests", code: "RATE_LIMITED" },
    { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
  );
}

/**
 * JSON response with a short private cache window. Suitable for per-user GET
 * reads (dashboard, trigger map, countdown) where slightly stale data is fine.
 */
export function cachedJson(data: unknown, maxAgeSeconds = 30): NextResponse {
  return NextResponse.json(data, {
    headers: { "Cache-Control": `private, max-age=${maxAgeSeconds}` },
  });
}

export async function requireAuth(
  req: Request
): Promise<{ username: string } | NextResponse> {
  const token = extractToken(req);
  if (!token) {
    return jsonError("UNAUTHORIZED", "Missing authorization token", 401);
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return jsonError("UNAUTHORIZED", "Invalid or expired token", 401);
  }

  return { username: payload.username };
}
