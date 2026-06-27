"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function ReframePage() {
  const router = useRouter();
  const [thought, setThought] = useState("");
  const [reframe, setReframe] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (thought.length < 5) return;

    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/");
      return;
    }

    setLoading(true);
    setError("");
    setReframe("");

    try {
      const res = await fetch("/api/reframe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ thought }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
      } else {
        setReframe(data.reframe);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <nav className="h-16 border-b border-hairline flex items-center px-lg bg-canvas">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-muted hover:text-ink"
        >
          &larr; Back
        </button>
      </nav>

      <div className="max-w-2xl mx-auto px-lg py-xxl">
        <h1 className="text-display-md font-display text-ink mb-sm">
          Reframe this thought
        </h1>
        <p className="text-body-md text-muted mb-xl">
          Paste a spiraling, anxious, or self-critical thought. Get a warm,
          CBT-style perspective shift tailored to your exam journey.
        </p>

        <form onSubmit={handleSubmit} className="space-y-lg">
          <div>
            <label
              htmlFor="thought"
              className="block text-sm font-medium text-body-strong mb-xxs"
            >
              The thought
            </label>
            <textarea
              id="thought"
              value={thought}
              onChange={(e) => setThought(e.target.value)}
              className="input-field w-full h-28 resize-none"
              placeholder="e.g. If I don't crack JEE, my life is over..."
              minLength={5}
              maxLength={2000}
            />
          </div>

          <button
            type="submit"
            disabled={loading || thought.length < 5}
            className="btn-primary disabled:opacity-50"
          >
            {loading ? "Reframing..." : "Reframe it"}
          </button>
        </form>

        {error && (
          <div className="mt-lg p-md bg-error/10 text-error text-sm rounded-md border border-error/20">
            {error}
          </div>
        )}

        {reframe && (
          <div className="card mt-xl border-l-4 border-l-accent-teal">
            <h3 className="text-caption-uppercase text-muted-soft mb-sm">
              Reframed perspective
            </h3>
            <p className="text-body-md text-body-strong leading-relaxed">
              {reframe}
            </p>
          </div>
        )}

        {!reframe && !loading && !error && (
          <div className="card mt-xl text-center py-xxl">
            <p className="text-muted text-sm">
              Your reframed perspective will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
