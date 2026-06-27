"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Node {
  id: string;
  label: string;
  type: "trigger" | "emotion" | "coping";
  latestDate?: string;
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

interface TriggerChain {
  trigger: Node;
  emotions: Array<{ emotion: Node; coping: Node[]; triggerWeight: number }>;
  totalOccurrences: number;
}

type SortMode = "recent" | "count";

const typeBadge: Record<string, string> = {
  trigger: "bg-accent-amber/15 text-accent-amber text-xs font-medium px-sm py-xxs rounded-pill",
  emotion: "bg-primary/10 text-primary text-xs font-medium px-sm py-xxs rounded-pill",
  coping: "bg-accent-teal/15 text-accent-teal text-xs font-medium px-sm py-xxs rounded-pill cursor-pointer hover:bg-accent-teal/20 transition-colors",
};

const typeLabel: Record<string, string> = {
  trigger: "Trigger",
  emotion: "Emotion",
  coping: "Coping",
};

export default function TriggerMapPage() {
  const router = useRouter();
  const [data, setData] = useState<TriggerMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [expandedCoping, setExpandedCoping] = useState<string | null>(null);

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

  function buildChains(d: TriggerMapData): TriggerChain[] {
    const nodeById = new Map(d.nodes.map((n) => [n.id, n]));
    const triggerNodes = d.nodes.filter((n) => n.type === "trigger");
    const edgesByFrom = new Map<string, Edge[]>();
    for (const e of d.edges) {
      const list = edgesByFrom.get(e.from) ?? [];
      list.push(e);
      edgesByFrom.set(e.from, list);
    }

    return triggerNodes.map((trigger) => {
      const triggerEdges = edgesByFrom.get(trigger.id) ?? [];
      let totalOccurrences = 0;

      const emotions = triggerEdges.map((te) => {
        totalOccurrences += te.weight;
        const emotionNode = nodeById.get(te.to);
        const copingEdges = edgesByFrom.get(te.to) ?? [];
        const coping = copingEdges
          .map((ce) => nodeById.get(ce.to))
          .filter((n): n is Node => n != null);

        return {
          emotion: emotionNode!,
          coping,
          triggerWeight: te.weight,
        };
      });

      return { trigger, emotions, totalOccurrences };
    });
  }

  function sortedChains(chains: TriggerChain[], mode: SortMode): TriggerChain[] {
    if (mode === "count") {
      return [...chains].sort((a, b) => b.totalOccurrences - a.totalOccurrences);
    }
    // recent — sort by latestDate descending, then count as tiebreaker
    return [...chains].sort((a, b) => {
      const da = a.trigger.latestDate ?? "";
      const db = b.trigger.latestDate ?? "";
      if (da !== db) return db.localeCompare(da);
      return b.totalOccurrences - a.totalOccurrences;
    });
  }

  function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  function daysAgo(dateStr: string | undefined): string {
    if (!dateStr) return "";
    const ms = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(ms / 86400000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    return `${days}d ago`;
  }

  const chains = data ? buildChains(data) : [];
  const ordered = sortedChains(chains, sortMode);

  const countSorted = sortedChains(chains, "count");
  const topByCount = countSorted[0];
  const maxOccurrences = topByCount?.totalOccurrences ?? 0;
  const hasClearPattern =
    maxOccurrences >= 2 &&
    (maxOccurrences >= 3 || (countSorted[1] ? maxOccurrences >= countSorted[1].totalOccurrences * 2 : true));

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

      <div className="max-w-3xl mx-auto px-lg py-xl">
        <h1 className="text-display-md font-display text-ink mb-xs">
          Your trigger map
        </h1>
        <p className="text-body-md text-muted mb-xl">
          Each trigger below shows the emotions it stirs and what has helped
          you cope. Built from your journal history.
        </p>

        {loading ? (
          <div className="card text-center py-xxl">
            <p className="text-muted">Loading your trigger map...</p>
          </div>
        ) : chains.length === 0 ? (
          <div className="card text-center py-xxl">
            <p className="text-muted">
              No trigger data yet. The map builds as you journal.
              Start with a check-in and analysis will populate your patterns.
            </p>
          </div>
        ) : (
          <div className="space-y-lg">
            {/* Summary insight */}
            <div className="card border-l-4 border-l-primary">
              <h3 className="text-caption-uppercase text-muted-soft mb-xxs">
                At a glance
              </h3>
              <p className="text-body-md text-body">
                {chains.length} trigger
                {chains.length !== 1 ? "s" : ""} across your journals.
                {hasClearPattern
                  ? ` Your strongest pattern: ${topByCount.trigger.label.toLowerCase()} leads to ${topByCount.emotions[0]?.emotion?.label ?? "stress"} (${maxOccurrences}x).`
                  : chains.length <= 3
                    ? ` These surfaced a handful of times each — keep journaling to see clearer patterns.`
                    : ` Most have surfaced only once or twice so far. The patterns become clearer as you journal more consistently.`}
              </p>
            </div>

            {/* Sort toggle + cards */}
            <div>
              <div className="flex items-center gap-sm mb-lg">
                <span className="text-caption text-muted-soft shrink-0">
                  Sort by
                </span>
                <div className="inline-flex bg-surface-cream-strong rounded-pill p-xxs">
                  <button
                    onClick={() => setSortMode("recent")}
                    className={`text-sm px-md py-xxs rounded-pill transition-colors ${
                      sortMode === "recent"
                        ? "bg-canvas text-body-strong shadow-sm"
                        : "text-muted hover:text-body"
                    }`}
                  >
                    Most recent
                  </button>
                  <button
                    onClick={() => setSortMode("count")}
                    className={`text-sm px-md py-xxs rounded-pill transition-colors ${
                      sortMode === "count"
                        ? "bg-canvas text-body-strong shadow-sm"
                        : "text-muted hover:text-body"
                    }`}
                  >
                    Most frequent
                  </button>
                </div>
              </div>

              <div className="space-y-lg">
                {ordered.map((chain) => (
                  <div key={chain.trigger.id} className="card">
                    {/* Trigger header */}
                    <div className="flex items-center gap-sm mb-md">
                      <span className={typeBadge.trigger}>
                        {typeLabel.trigger}
                      </span>
                      <h3 className="text-title-sm font-display text-ink">
                        {chain.trigger.label}
                      </h3>
                      <span className="text-caption text-muted-soft ml-auto flex items-center gap-sm">
                        {sortMode === "recent" && chain.trigger.latestDate && (
                          <span>{daysAgo(chain.trigger.latestDate)}</span>
                        )}
                        <span>
                          {chain.totalOccurrences}x
                        </span>
                      </span>
                    </div>

                    {/* Emotion -> coping chains */}
                    <div className="space-y-md">
                      {chain.emotions.map((em, i) => (
                        <div
                          key={i}
                          className="pl-lg border-l-2 border-hairline"
                        >
                          <div className="flex items-center gap-sm mb-xs">
                            <span className={typeBadge.emotion}>
                              {typeLabel.emotion}
                            </span>
                            <span className="text-body-sm font-medium text-body-strong">
                              {em.emotion.label}
                            </span>
                            <span className="text-caption text-muted-soft">
                              &middot; {em.triggerWeight}x
                            </span>
                          </div>

                          {em.coping.length > 0 ? (
                            <div className="flex flex-wrap gap-xs mt-sm">
                              {em.coping.map((cope) => {
                                const isExpanded = expandedCoping === cope.id;
                                const isLong = cope.label.length > 50;
                                return (
                                  <span
                                    key={cope.id}
                                    onClick={() =>
                                      isLong
                                        ? setExpandedCoping(isExpanded ? null : cope.id)
                                        : undefined
                                    }
                                    className={`${typeBadge.coping} inline-flex items-center gap-1 ${
                                      !isExpanded ? "max-w-[200px]" : ""
                                    } ${
                                      isExpanded
                                        ? "!rounded-md !px-md !py-sm text-body-sm leading-relaxed"
                                        : "truncate"
                                    } ${!isLong ? "cursor-default" : ""}`}
                                    title={isLong ? "Click to expand" : cope.label}
                                    role={isLong ? "button" : undefined}
                                    tabIndex={isLong ? 0 : undefined}
                                    onKeyDown={
                                      isLong
                                        ? (e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                              e.preventDefault();
                                              setExpandedCoping(isExpanded ? null : cope.id);
                                            }
                                          }
                                        : undefined
                                    }
                                    aria-expanded={isLong ? isExpanded : undefined}
                                  >
                                    {isExpanded ? cope.label : cope.label}
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-caption text-muted-soft mt-xs">
                              No coping strategies recorded yet.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
