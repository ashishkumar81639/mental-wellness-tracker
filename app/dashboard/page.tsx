"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LeafIcon,
  PenIcon,
  ChatHeartIcon,
  SparklesIcon,
  CalendarIcon,
  TargetIcon,
  HeartPulseIcon,
  ArrowRightIcon,
} from "@/components/icons";

interface User {
  id: string;
  name: string;
  exam_type: string;
  exam_date: string | null;
}

interface DashboardData {
  moodTrend: Array<{ date: string; mood: number; energy: number }>;
  topTriggers: Array<{ label: string; count: number; category: string }>;
  emotionDistribution: Array<{ emotion: string; count: number }>;
  streak: number;
}

interface CountdownData {
  exam_type: string;
  exam_date: string | null;
  days_left: number | null;
  preloadedCoping: string;
}

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

const CATEGORY_LABELS: Record<string, string> = {
  academic: "Academic",
  social: "Social",
  family: "Family",
  health: "Health",
  self: "Self",
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [countdown, setCountdown] = useState<CountdownData | null>(null);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInBody, setCheckInBody] = useState("");
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [sleepHrs, setSleepHrs] = useState("");
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkInResult, setCheckInResult] = useState<{
    emotion?: string;
    summary?: string;
    reframe?: string;
    coping?: { strategy: string; mindfulness: string; nudge: string };
    llmError?: { code: string; message: string } | null;
  } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");

    if (!token || !userStr) {
      router.push("/");
      return;
    }

    setUser(JSON.parse(userStr));

    fetchDashboard(token);
    fetchCountdown(token);
  }, [router]);

  async function fetchDashboard(token: string) {
    try {
      const res = await fetch("/api/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setDashboard(await res.json());
      }
    } catch {
      // silently fail; shown as empty state
    }
  }

  async function fetchCountdown(token: string) {
    try {
      const res = await fetch("/api/exam-countdown", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setCountdown(await res.json());
      }
    } catch {
      // silently fail
    }
  }

  async function handleCheckIn() {
    const token = localStorage.getItem("token");
    if (!token) return;

    setCheckInLoading(true);
    try {
      const res = await fetch("/api/check-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          body: checkInBody,
          mood,
          energy,
          sleep_hrs: sleepHrs ? Number(sleepHrs) : undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // C2: analysis can be null on LLM failure.
        // Only render the analysis card if we have real data.
        const result: { analysis?: typeof checkInResult } = {};
        if (data.analysis) {
          Object.assign(result, data.analysis);
        }
        setCheckInResult({ ...result as typeof checkInResult, llmError: data.llm_error ?? null });
        setCheckInOpen(false);
        setCheckInBody("");
        fetchDashboard(token);
      }
    } catch {
      // sprint: show error toast. For now, silent.
    } finally {
      setCheckInLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/");
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  const maxMood = dashboard
    ? Math.max(...dashboard.moodTrend.map((d) => d.mood), 1)
    : 5;

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
        <div className="flex items-center gap-md">
          <span className="text-sm text-muted">
            {user.name} · {user.exam_type}
          </span>
          <button onClick={handleLogout} className="text-sm text-link">
            Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-lg py-xl">
        {/* Welcome + countdown */}
        <section className="mb-xl">
          <h1 className="text-display-sm font-display text-ink mb-xs">
            Welcome back, {user.name}
          </h1>
          {countdown && countdown.days_left !== null && (
            <div className="flex items-center gap-sm mt-sm">
              <span className="badge-coral text-sm">
                {countdown.days_left} days to {countdown.exam_type}
              </span>
              {dashboard && (
                <span className="text-sm text-muted">
                  Streak: {dashboard.streak} day
                  {dashboard.streak !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}
          {countdown && (
            <p className="text-body-sm text-muted mt-sm max-w-xl">
              {countdown.preloadedCoping}
            </p>
          )}
        </section>

        {/* Check-in result (shown after submission) */}
        {checkInResult && (
          <section className="card mb-xl border-l-4 border-l-primary">
            {checkInResult.llmError && (
              <div className="mb-md p-md bg-warning/10 border border-warning/30 rounded-md">
                <p className="text-sm font-medium text-warning mb-xxs">
                  {checkInResult.emotion
                    ? "Analysis completed with a non-critical error"
                    : "Analysis unavailable"}
                </p>
                <p className="text-xs text-muted font-mono">
                  [{checkInResult.llmError.code}] {checkInResult.llmError.message}
                </p>
              </div>
            )}
            <div className="flex items-start justify-between mb-sm">
              <div>
                {checkInResult.emotion && (
                  <span
                    className={`text-xs font-medium px-sm py-xxs rounded-pill ${
                      EMOTION_COLORS[checkInResult.emotion] ??
                      "bg-surface-cream-strong text-body-strong"
                    }`}
                  >
                    {checkInResult.emotion}
                  </span>
                )}
                {checkInResult.summary && (
                  <h3 className="text-title-sm font-display text-ink mt-sm">
                    {checkInResult.summary}
                  </h3>
                )}
                {!checkInResult.emotion && !checkInResult.summary && (
                  <h3 className="text-title-sm font-display text-ink mt-sm">
                    Your entry was saved.
                  </h3>
                )}
              </div>
              <button
                onClick={() => setCheckInResult(null)}
                className="text-muted-soft hover:text-muted text-sm"
              >
                Dismiss
              </button>
            </div>

            {checkInResult.reframe && (
              <p className="text-body-sm text-body italic mb-md">
                &ldquo;{checkInResult.reframe}&rdquo;
              </p>
            )}

            {checkInResult.llmError && !checkInResult.emotion && (
              <p className="text-body-sm text-muted mb-md">
                We could not analyse this entry right now. Your journal was saved,
                and you can try the analysis again on your next check-in.
              </p>
            )}

            {checkInResult.coping && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-md mt-lg">
                <div>
                  <h4 className="text-caption-uppercase text-muted-soft mb-xxs">
                    Strategy
                  </h4>
                  <p className="text-body-sm text-body-strong">
                    {checkInResult.coping.strategy}
                  </p>
                </div>
                <div>
                  <h4 className="text-caption-uppercase text-muted-soft mb-xxs">
                    Mindfulness
                  </h4>
                  <p className="text-body-sm text-body-strong">
                    {checkInResult.coping.mindfulness}
                  </p>
                </div>
                <div>
                  <h4 className="text-caption-uppercase text-muted-soft mb-xxs">
                    Nudge
                  </h4>
                  <p className="text-body-sm text-body-strong italic">
                    &ldquo;{checkInResult.coping.nudge}&rdquo;
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-xl">
          {/* Left: mood trend */}
          <section
            className="lg:col-span-2 card cursor-pointer hover:bg-surface-cream-strong/30 transition-colors focus-within:ring-2 focus-within:ring-primary/30 relative group"
            onClick={() => router.push("/journal")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push("/journal");
              }
            }}
            aria-label="View journal history"
          >
            <h3 className="flex items-center gap-xs text-title-sm font-display text-ink mb-md">
              <CalendarIcon className="text-primary" width={18} height={18} />
              Your week
              <span className="ml-auto text-xs text-link opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex items-center gap-xxs">
                View journal <ArrowRightIcon width={12} height={12} />
              </span>
            </h3>

            {dashboard && dashboard.moodTrend.length > 0 ? (
              <div className="space-y-sm">
                {dashboard.moodTrend.map((d) => (
                  <div
                    key={d.date}
                    className="flex items-center gap-md"
                  >
                    <span className="text-caption text-muted w-20 text-right">
                      {new Date(d.date).toLocaleDateString("en-IN", {
                        weekday: "short",
                        day: "numeric",
                      })}
                    </span>
                    <div className="flex-1 flex items-center gap-xs">
                      <div className="flex-1 bg-hairline-soft rounded-pill h-3 overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-pill transition-all duration-500"
                          style={{
                            width: `${(d.mood / maxMood) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-caption text-muted w-12 text-right">
                        {d.mood}/5
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-xxl">
                <p className="text-muted text-sm">
                  No mood data yet. Start with a check-in.
                </p>
              </div>
            )}
          </section>

          {/* Right: quick actions */}
          <section className="space-y-md">
            <button
              onClick={() => setCheckInOpen(true)}
              className="group w-full card flex items-center gap-md text-left hover:bg-surface-cream-strong focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
            >
              <span className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-on-primary">
                <PenIcon />
              </span>
              <span className="min-w-0">
                <span className="text-title-sm font-display text-ink block">
                  New check-in
                </span>
                <span className="text-body-sm text-muted">
                  Journal, mood, get your analysis
                </span>
              </span>
            </button>

            <button
              onClick={() => router.push("/chat")}
              className="group w-full card flex items-center gap-md text-left hover:bg-surface-cream-strong focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
            >
              <span className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-accent-teal/15 text-accent-teal">
                <ChatHeartIcon />
              </span>
              <span className="min-w-0">
                <span className="text-title-sm font-display text-ink block">
                  Talk to Yaar
                </span>
                <span className="text-body-sm text-muted">
                  Chat with your companion
                </span>
              </span>
            </button>

            <button
              onClick={() => router.push("/reframe")}
              className="group w-full card flex items-center gap-md text-left hover:bg-surface-cream-strong focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
            >
              <span className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-accent-amber/15 text-accent-amber">
                <SparklesIcon />
              </span>
              <span className="min-w-0">
                <span className="text-title-sm font-display text-ink block">
                  Reframe a thought
                </span>
                <span className="text-body-sm text-muted">
                  CBT-style perspective shift
                </span>
              </span>
            </button>
          </section>
        </div>

        {/* Bottom: triggers + emotions */}
        {dashboard && dashboard.topTriggers.length > 0 && (
          <section className="mt-xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-xl">
              {/* Top triggers */}
              <div className="card">
                <h3 className="flex items-center gap-xs text-title-sm font-display text-ink mb-md">
                  <TargetIcon className="text-primary" width={18} height={18} />
                  Top triggers
                </h3>
                <div className="space-y-sm">
                  {dashboard.topTriggers.slice(0, 5).map((t) => (
                    <div
                      key={t.label}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-sm">
                        <span className="text-caption-uppercase text-muted-soft">
                          {CATEGORY_LABELS[t.category] ?? t.category}
                        </span>
                        <span className="text-body-sm text-body-strong">
                          {t.label}
                        </span>
                      </div>
                      <span className="text-caption text-muted">
                        {t.count}x
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Emotion distribution */}
              <div className="card">
                <h3 className="flex items-center gap-xs text-title-sm font-display text-ink mb-md">
                  <HeartPulseIcon className="text-primary" width={18} height={18} />
                  Emotions
                </h3>
                <div className="flex flex-wrap gap-sm">
                  {dashboard.emotionDistribution.map((e) => (
                    <span
                      key={e.emotion}
                      className={`text-xs font-medium px-sm py-xxs rounded-pill ${
                        EMOTION_COLORS[e.emotion] ??
                        "bg-surface-cream-strong text-body-strong"
                      }`}
                    >
                      {e.emotion} · {e.count}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Trigger map link */}
        {dashboard && dashboard.topTriggers.length > 0 && (
          <div className="mt-lg text-center">
            <button
              onClick={() => router.push("/trigger-map")}
              className="inline-flex items-center gap-xxs text-link text-sm"
            >
              View trigger map
              <ArrowRightIcon width={16} height={16} />
            </button>
          </div>
        )}
      </div>

      {/* Check-in modal */}
      {checkInOpen && (
        <div className="fixed inset-0 bg-ink/30 flex items-center justify-center p-lg z-50">
          <div className="bg-canvas rounded-lg p-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-lg">
              <h2 className="text-title-md font-display text-ink">
                New check-in
              </h2>
              <button
                onClick={() => setCheckInOpen(false)}
                className="text-muted hover:text-ink text-lg"
              >
                &times;
              </button>
            </div>

            <div className="space-y-md">
              <div>
                <label
                  htmlFor="checkin-body"
                  className="block text-sm font-medium text-body-strong mb-xxs"
                >
                  How are you feeling? Write freely.
                </label>
                <textarea
                  id="checkin-body"
                  value={checkInBody}
                  onChange={(e) => setCheckInBody(e.target.value)}
                  className="input-field w-full h-32 resize-none"
                  placeholder="Today was..."
                  minLength={10}
                  maxLength={5000}
                />
              </div>

              <div className="grid grid-cols-3 gap-sm">
                <div>
                  <label
                    htmlFor="checkin-mood"
                    className="block text-sm font-medium text-body-strong mb-xxs"
                  >
                    Mood ({mood}/5)
                  </label>
                  <input
                    id="checkin-mood"
                    type="range"
                    min={1}
                    max={5}
                    value={mood}
                    onChange={(e) => setMood(Number(e.target.value))}
                    aria-valuemin={1}
                    aria-valuemax={5}
                    aria-valuenow={mood}
                    className="w-full accent-primary"
                  />
                </div>
                <div>
                  <label
                    htmlFor="checkin-energy"
                    className="block text-sm font-medium text-body-strong mb-xxs"
                  >
                    Energy ({energy}/5)
                  </label>
                  <input
                    id="checkin-energy"
                    type="range"
                    min={1}
                    max={5}
                    value={energy}
                    onChange={(e) => setEnergy(Number(e.target.value))}
                    aria-valuemin={1}
                    aria-valuemax={5}
                    aria-valuenow={energy}
                    className="w-full accent-primary"
                  />
                </div>
                <div>
                  <label
                    htmlFor="checkin-sleep"
                    className="block text-sm font-medium text-body-strong mb-xxs"
                  >
                    Sleep (hrs)
                  </label>
                  <input
                    id="checkin-sleep"
                    type="number"
                    value={sleepHrs}
                    onChange={(e) => setSleepHrs(e.target.value)}
                    className="input-field w-full"
                    placeholder="7"
                    min={0}
                    max={24}
                    step={0.5}
                  />
                </div>
              </div>

              <button
                onClick={handleCheckIn}
                disabled={checkInLoading || checkInBody.length < 10}
                className="btn-primary w-full disabled:opacity-50"
              >
                {checkInLoading ? "Analysing..." : "Submit check-in"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
