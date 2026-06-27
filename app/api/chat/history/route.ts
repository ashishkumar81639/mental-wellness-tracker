import { NextRequest, NextResponse } from "next/server";
import { requireAuth, jsonError, cachedJson } from "@/lib/route-utils";
import { sql } from "@/lib/db";
import { ChatHistoryQuery } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { username } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = ChatHistoryQuery.safeParse({
      offset: searchParams.get("offset") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", "Invalid query params", 400);
    }

    const { offset, limit } = parsed.data;

    const rows = await sql`
      SELECT id, role, content, created_at::text AS created_at
      FROM chat_messages
      WHERE user_id = ${username}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const messages = rows.map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      created_at: r.created_at,
    }));

    return cachedJson({ messages }, 10);
  } catch (err) {
    console.error("Chat history error:", err);
    return jsonError("INTERNAL", "Internal server error", 500);
  }
}
