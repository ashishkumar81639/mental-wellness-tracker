import { NextResponse } from "next/server";
import { requireAuth, jsonError, cachedJson } from "@/lib/route-utils";
import { sql } from "@/lib/db";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { username } = auth;

  try {
    // sprint: trigger-map builds a graph from triggers + analysis tables.
    // This is computed per-request. Materialise for >1000 entries.
    const rows = await sql`
      SELECT
        t.label AS trigger_label,
        t.category AS trigger_category,
        t.sentiment,
        aa.emotion,
        aa.coping_json->>'strategy' AS strategy,
        aa.coping_json->>'mindfulness' AS mindfulness,
        je.created_at::text AS entry_date
      FROM triggers t
      JOIN ai_analysis aa ON t.analysis_id = aa.id
      JOIN journal_entries je ON aa.entry_id = je.id
      WHERE je.user_id = ${username}
      ORDER BY je.created_at DESC
      LIMIT 50
    `;

    const nodeMap = new Map<string, { id: string; label: string; type: "trigger" | "emotion" | "coping"; latestDate?: string }>();
    const edgeMap = new Map<string, number>();

    for (const row of rows) {
      const triggerId = `trigger:${row.trigger_label}`;
      const emotionId = `emotion:${row.emotion}`;
      const copingLabel = row.strategy || row.mindfulness || "coping strategy";
      const copingId = `coping:${copingLabel}`;

      // Nodes (track latest date for trigger nodes so frontend can sort by recency)
      if (!nodeMap.has(triggerId)) {
        nodeMap.set(triggerId, { id: triggerId, label: row.trigger_label, type: "trigger", latestDate: row.entry_date });
      } else {
        const existing = nodeMap.get(triggerId)!;
        if (row.entry_date > (existing.latestDate ?? "")) {
          existing.latestDate = row.entry_date;
        }
      }
      if (!nodeMap.has(emotionId)) {
        nodeMap.set(emotionId, { id: emotionId, label: row.emotion, type: "emotion" });
      }
      if (!nodeMap.has(copingId)) {
        nodeMap.set(copingId, { id: copingId, label: copingLabel, type: "coping" });
      }

      // Edges: trigger -> emotion, emotion -> coping
      const e1 = `${triggerId}->${emotionId}`;
      edgeMap.set(e1, (edgeMap.get(e1) ?? 0) + 1);

      const e2 = `${emotionId}->${copingId}`;
      edgeMap.set(e2, (edgeMap.get(e2) ?? 0) + 1);
    }

    const nodes = Array.from(nodeMap.values());
    const edges = Array.from(edgeMap.entries()).map(([key, weight]) => {
      const [from, to] = key.split("->");
      return { from, to, weight };
    });

    return cachedJson({ nodes, edges });
  } catch (err) {
    console.error("Trigger map error:", err);
    return jsonError("INTERNAL", "Internal server error", 500);
  }
}
