import { verifyToken, extractToken } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function requireAuth(
  req: Request
): Promise<{ username: string } | NextResponse> {
  const token = extractToken(req);
  if (!token) {
    return NextResponse.json(
      { error: "Missing authorization token", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json(
      { error: "Invalid or expired token", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  return { username: payload.username };
}
