import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/route-utils";
import { sql } from "@/lib/db";

const QuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { username } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      offset: searchParams.get("offset") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query params", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
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

    return NextResponse.json({ messages });
  } catch (err) {
    console.error("Chat history error:", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL" },
      { status: 500 }
    );
  }
}
