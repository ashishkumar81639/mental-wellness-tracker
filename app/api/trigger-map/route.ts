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

    const nodes: Array<{ id: string; label: string; type: "trigger" | "emotion" | "coping"; latestDate?: string }> = [];
    const edges: Array<{ from: string; to: string; weight: number }> = [];
    const nodeSeen = new Set<string>();
    const edgeWeights = new Map<string, number>();

    for (const row of rows) {
      const triggerId = `trigger:${row.trigger_label}`;
      const emotionId = `emotion:${row.emotion}`;
      const copingLabel = row.strategy || row.mindfulness || "coping strategy";
      const copingId = `coping:${copingLabel}`;

      // Nodes (track latest date for trigger nodes so frontend can sort by recency)
      if (!nodeSeen.has(triggerId)) {
        nodeSeen.add(triggerId);
        nodes.push({ id: triggerId, label: row.trigger_label, type: "trigger", latestDate: row.entry_date });
      } else {
        const existing = nodes.find((n) => n.id === triggerId)!;
        if (row.entry_date > (existing.latestDate ?? "")) {
          existing.latestDate = row.entry_date;
        }
      }
      if (!nodeSeen.has(emotionId)) {
        nodeSeen.add(emotionId);
        nodes.push({ id: emotionId, label: row.emotion, type: "emotion" });
      }
      if (!nodeSeen.has(copingId)) {
        nodeSeen.add(copingId);
        nodes.push({ id: copingId, label: copingLabel, type: "coping" });
      }

      // Edges: trigger -> emotion, emotion -> coping. Store structured from/to so
      // labels containing "->" cannot corrupt the graph.
      const bump = (from: string, to: string) => {
        const key = `${from}\0${to}`;
        edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
      };
      bump(triggerId, emotionId);
      bump(emotionId, copingId);
    }

    for (const [key, weight] of edgeWeights) {
      const sep = key.indexOf("\0");
      edges.push({ from: key.slice(0, sep), to: key.slice(sep + 1), weight });
    }

    return cachedJson({ nodes, edges });
  } catch (err) {
    console.error("Trigger map error:", err);
    return jsonError("INTERNAL", "Internal server error", 500);
  }
}
