"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Node {
  id: string;
  label: string;
  type: "trigger" | "emotion" | "coping";
}

interface Edge {
  from: string;
  to: string;
  weight: number;
}

interface TriggerMapData {
  nodes: Node[];
  edges: Edge[];
}

export default function TriggerMapPage() {
  const router = useRouter();
  const [data, setData] = useState<TriggerMapData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/");
      return;
    }
    fetchMap(token);
  }, [router]);

  async function fetchMap(token: string) {
    try {
      const res = await fetch("/api/trigger-map", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  const typeColors: Record<string, string> = {
    trigger: "bg-accent-amber/20 text-accent-amber border-accent-amber/30",
    emotion: "bg-primary/10 text-primary border-primary/20",
    coping: "bg-accent-teal/15 text-accent-teal border-accent-teal/30",
  };

  return (
    <div className="min-h-screen bg-canvas">
      <nav className="h-16 border-b border-hairline flex items-center px-lg bg-canvas">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-muted hover:text-ink"
        >
          &larr; Back to Dashboard
        </button>
      </nav>

      <div className="max-w-4xl mx-auto px-lg py-xl">
        <h1 className="text-display-md font-display text-ink mb-sm">
          Trigger Map
        </h1>
        <p className="text-body-md text-muted mb-xl">
          See how your triggers connect to emotions and what coping strategies
          have helped. Each connection is built from your journal history.
        </p>

        {loading ? (
          <p className="text-muted text-sm">Loading your trigger map...</p>
        ) : data && data.nodes.length > 0 ? (
          <div className="card">
            <div className="space-y-xl">
              {/* Nodes */}
              <div>
                <h3 className="text-caption-uppercase text-muted-soft mb-sm">
                  Nodes
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-sm">
                  {data.nodes.map((node) => (
                    <div
                      key={node.id}
                      className={`px-md py-sm rounded-md border text-sm font-medium ${
                        typeColors[node.type] ?? "bg-surface-cream-strong"
                      }`}
                    >
                      <span className="text-caption-uppercase text-muted-soft block mb-xxs">
                        {node.type}
                      </span>
                      {node.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Edges */}
              <div>
                <h3 className="text-caption-uppercase text-muted-soft mb-sm">
                  Connections
                </h3>
                <div className="space-y-xs">
                  {data.edges
                    .sort((a, b) => b.weight - a.weight)
                    .map((edge, i) => {
                      const fromNode = data.nodes.find(
                        (n) => n.id === edge.from
                      );
                      const toNode = data.nodes.find(
                        (n) => n.id === edge.to
                      );
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-sm text-sm"
                        >
                          <span className="text-body-strong font-medium">
                            {fromNode?.label ?? edge.from}
                          </span>
                          <span className="text-muted-soft">&rarr;</span>
                          <span className="text-body-strong font-medium">
                            {toNode?.label ?? edge.to}
                          </span>
                          <span className="text-caption text-muted-soft">
                            ({edge.weight}x)
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="card text-center py-xxl">
            <p className="text-muted">
              No data yet. The trigger map builds from your journal entries.
              Start with a check-in.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
