"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LeafIcon, CalendarIcon } from "@/components/icons";

interface JournalEntry {
  entry_id: number;
  body: string;
  created_at: string;
  mood: number | null;
  energy: number | null;
  sleep_hrs: number | null;
  analysis: {
    emotion: string;
    intensity: number;
    summary: string;
    reframe: string;
    coping: { strategy: string; mindfulness: string; nudge: string };
    safety_flag: boolean;
  } | null;
}

const MOOD_LABELS: Record<number, string> = {
  1: "Terrible",
  2: "Low",
  3: "Okay",
  4: "Good",
  5: "Great",
};

const MOOD_EMOJIS: Record<number, string> = {
  1: "😞",
  2: "😕",
  3: "😐",
  4: "🙂",
  5: "😊",
};

const EMOTION_COLORS: Record<string, string> = {
  anxiety: "bg-warning/20 text-warning",
  "self-doubt": "bg-surface-cream-strong text-body-strong",
  burnout: "bg-error/15 text-error",
  hopeful: "bg-success/15 text-success",
  calm: "bg-accent-teal/15 text-accent-teal",
  frustrated: "bg-accent-amber/15 text-accent-amber",
  overwhelmed: "bg-error/10 text-error",
  motivated: "bg-success/10 text-success",
  lonely: "bg-muted/10 text-muted",
  grateful: "bg-primary/10 text-primary",
  happy: "bg-success/15 text-success",
  excited: "bg-accent-teal/15 text-accent-teal",
  proud: "bg-primary/10 text-primary",
  content: "bg-accent-teal/10 text-accent-teal",
  confident: "bg-primary/10 text-primary",
  nervous: "bg-warning/10 text-warning",
  tired: "bg-muted/10 text-muted-soft",
};

function groupByDate(entries: JournalEntry[]): Map<string, JournalEntry[]> {
  const groups = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    const date = new Date(entry.created_at).toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const existing = groups.get(date);
    if (existing) {
      existing.push(entry);
    } else {
      groups.set(date, [entry]);
    }
  }
  return groups;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default function JournalPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/");
      return;
    }
    fetchEntries(token);
  }, [router]);

  async function fetchEntries(token: string) {
    try {
      const res = await fetch("/api/journal?days=30&limit=50", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries);
      } else {
        setError("Could not load journal entries.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(entryId: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  }

  const grouped = groupByDate(entries);

  return (
    <div className="min-h-screen bg-canvas">
      {/* Top nav */}
      <nav className="h-16 border-b border-hairline flex items-center justify-between px-lg bg-canvas">
        <div className="flex items-center gap-xs">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/12 text-primary">
            <LeafIcon width={18} height={18} />
          </span>
          <h2 className="text-title-md font-display text-ink">Yaar</h2>
        </div>
        <button
          onClick={() => router.push("/dashboard")}
          className="text-muted hover:text-ink text-sm"
        >
          &larr; Back to Dashboard
        </button>
      </nav>

      <div className="max-w-3xl mx-auto px-lg py-xl">
        <header className="mb-xl">
          <h1 className="text-display-sm font-display text-ink mb-xs flex items-center gap-xs">
            <CalendarIcon className="text-primary" width={24} height={24} />
            Your journal
          </h1>
          <p className="text-body-md text-muted">
            Every check-in you have ever written, with mood, energy, and AI
            analysis.
          </p>
        </header>

        {loading && (
          <div className="space-y-md">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card animate-pulse">
                <div className="h-4 bg-hairline-soft rounded w-24 mb-sm" />
                <div className="h-3 bg-hairline-soft rounded w-full mb-xs" />
                <div className="h-3 bg-hairline-soft rounded w-3/4" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="card border border-error/20 bg-error/5">
            <p className="text-error text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="text-center py-xxl">
            <p className="text-muted text-lg mb-sm">No journal entries yet.</p>
            <p className="text-muted-soft text-sm mb-lg">
              Write your first check-in from the dashboard.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="btn-primary"
            >
              Go to dashboard
            </button>
          </div>
        )}

        {!loading &&
          !error &&
          Array.from(grouped.entries()).map(([dateLabel, dayEntries]) => (
            <section key={dateLabel} className="mb-xl">
              <h2 className="text-title-sm font-display text-ink mb-md sticky top-0 bg-canvas/95 backdrop-blur-sm py-xs z-10">
                {dateLabel}
              </h2>
              <div className="space-y-md">
                {dayEntries.map((entry) => {
                  const isOpen = expanded.has(entry.entry_id);
                  const preview = entry.body.slice(0, 140);
                  const hasMore = entry.body.length > 140;

                  return (
                    <article
                      key={entry.entry_id}
                      className="card hover:bg-surface-cream-strong/50 transition-colors cursor-pointer"
                      onClick={() => toggleExpand(entry.entry_id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleExpand(entry.entry_id);
                        }
                      }}
                    >
                      {/* Header row */}
                      <div className="flex items-center justify-between mb-sm">
                        <div className="flex items-center gap-sm">
                          <time className="text-caption text-muted">
                            {formatTime(entry.created_at)}
                          </time>
                          {entry.analysis && (
                            <span
                              className={`text-xs font-medium px-sm py-xxs rounded-pill ${
                                EMOTION_COLORS[entry.analysis.emotion] ??
                                "bg-surface-cream-strong text-body-strong"
                              }`}
                            >
                              {entry.analysis.emotion}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-sm">
                          {entry.mood !== null && (
                            <span
                              className="text-sm"
                              title={`Mood: ${MOOD_LABELS[entry.mood] ?? entry.mood}/5`}
                            >
                              {MOOD_EMOJIS[entry.mood] ?? "😐"}
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(entry.entry_id);
                            }}
                            className="text-xs text-link"
                            aria-expanded={isOpen}
                          >
                            {isOpen ? "Collapse" : "Read more"}
                          </button>
                        </div>
                      </div>

                      {/* Body preview / full */}
                      <p className="text-body-sm text-body-strong leading-relaxed">
                        {isOpen ? entry.body : preview}
                        {!isOpen && hasMore && (
                          <span className="text-muted-soft">…</span>
                        )}
                      </p>

                      {/* Mood & energy bars */}
                      {entry.mood !== null && (
                        <div className="flex items-center gap-lg mt-sm pt-sm border-t border-hairline">
                          <div className="flex items-center gap-xs">
                            <span className="text-caption text-muted w-12">
                              Mood
                            </span>
                            <div className="flex gap-xxs">
                              {[1, 2, 3, 4, 5].map((level) => (
                                <span
                                  key={level}
                                  className={`h-2 w-4 rounded-sm ${
                                    level <= entry.mood!
                                      ? "bg-primary"
                                      : "bg-hairline-soft"
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                          {entry.energy !== null && (
                            <div className="flex items-center gap-xs">
                              <span className="text-caption text-muted w-12">
                                Energy
                              </span>
                              <div className="flex gap-xxs">
                                {[1, 2, 3, 4, 5].map((level) => (
                                  <span
                                    key={level}
                                    className={`h-2 w-4 rounded-sm ${
                                      level <= entry.energy!
                                        ? "bg-accent-amber"
                                        : "bg-hairline-soft"
                                    }`}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                          {entry.sleep_hrs !== null && (
                            <span className="text-caption text-muted">
                              {entry.sleep_hrs}h sleep
                            </span>
                          )}
                        </div>
                      )}

                      {/* Analysis (expanded) */}
                      {isOpen && entry.analysis && (
                        <div className="mt-md pt-md border-t border-hairline">
                          <h4 className="text-caption-uppercase text-muted-soft mb-sm">
                            Analysis
                          </h4>

                          {entry.analysis.summary && (
                            <p className="text-body-sm text-body mb-sm">
                              {entry.analysis.summary}
                            </p>
                          )}

                          {entry.analysis.reframe && (
                            <p className="text-body-sm text-body italic mb-md border-l-2 border-primary/30 pl-md py-xxs">
                              &ldquo;{entry.analysis.reframe}&rdquo;
                            </p>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-sm">
                            <div>
                              <h5 className="text-caption-uppercase text-muted-soft mb-xxs">
                                Strategy
                              </h5>
                              <p className="text-body-sm text-body-strong">
                                {entry.analysis.coping.strategy}
                              </p>
                            </div>
                            <div>
                              <h5 className="text-caption-uppercase text-muted-soft mb-xxs">
                                Mindfulness
                              </h5>
                              <p className="text-body-sm text-body-strong">
                                {entry.analysis.coping.mindfulness}
                              </p>
                            </div>
                            <div>
                              <h5 className="text-caption-uppercase text-muted-soft mb-xxs">
                                Nudge
                              </h5>
                              <p className="text-body-sm text-body-strong italic">
                                &ldquo;{entry.analysis.coping.nudge}&rdquo;
                              </p>
                            </div>
                          </div>

                          {entry.analysis.safety_flag && (
                            <div className="mt-md p-sm bg-warning/10 border border-warning/20 rounded text-xs text-warning">
                              This entry was flagged for crisis language. If you
                              need support, call Tele-MANAS (14416) or
                              Vandrevala Foundation (1860-2662-345).
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
      </div>
    </div>
  );
}
