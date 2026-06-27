"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { formatChatText } from "@/lib/format-chat";

export default function ReframePage() {
  const router = useRouter();
  const [thought, setThought] = useState("");
  const [submittedThought, setSubmittedThought] = useState("");
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
    setSubmittedThought(thought);

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
          &larr; Back to Dashboard
        </button>
      </nav>

      <div className="max-w-6xl mx-auto px-lg py-xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-xxl items-start">
          {/* Left: content */}
          <div>
            <h1 className="text-display-md font-display text-ink mb-xs">
              Reframe a thought
            </h1>
            <p className="text-body-md text-muted mb-lg">
              Stuck in a loop? Paste the thought that&apos;s spiraling.
              Yaar will help you see it through a kinder, more realistic lens.
            </p>

            <form onSubmit={handleSubmit} className="space-y-md mb-xl">
              <div>
                <label
                  htmlFor="thought"
                  className="block text-sm font-medium text-body-strong mb-xxs"
                >
                  The thought that&apos;s bothering you
                </label>
                <textarea
                  id="thought"
                  value={thought}
                  onChange={(e) => setThought(e.target.value)}
                  className="input-field w-full h-32 resize-none"
                  placeholder='e.g. "If I don&apos;t crack JEE, I&apos;ve wasted two years and let everyone down"'
                  minLength={5}
                  maxLength={2000}
                />
              </div>

              <button
                type="submit"
                disabled={loading || thought.length < 5}
                className="btn-primary disabled:opacity-50"
              >
                {loading ? "Reframing..." : "See a different perspective"}
              </button>
            </form>

            {/* Error */}
            {error && (
              <div className="p-md bg-error/10 text-error text-sm rounded-md border border-error/20 mb-lg">
                {error}
              </div>
            )}

            {/* Results */}
            {submittedThought && (
              <div className="space-y-lg">
                {/* Original thought */}
                <div className="bg-surface-soft rounded-lg px-lg py-md border border-hairline">
                  <h3 className="text-caption-uppercase text-muted-soft mb-xxs">
                    You wrote
                  </h3>
                  <p className="text-body-sm text-muted italic leading-relaxed">
                    &ldquo;{submittedThought}&rdquo;
                  </p>
                </div>

                {/* Loading skeleton */}
                {loading && (
                  <div className="card border-l-4 border-l-accent-teal animate-pulse">
                    <div className="space-y-sm">
                      <div className="h-4 bg-surface-cream-strong rounded w-2/3" />
                      <div className="h-4 bg-surface-cream-strong rounded w-full" />
                      <div className="h-4 bg-surface-cream-strong rounded w-3/4" />
                    </div>
                  </div>
                )}

                {/* Reframed result */}
                {reframe && !loading && (
                  <div className="card border-l-4 border-l-accent-teal">
                    <h3 className="text-caption-uppercase text-muted-soft mb-sm">
                      A different perspective
                    </h3>
                    <div className="text-body-md text-body leading-relaxed">
                      {formatChatText(reframe)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Empty state — before first submit */}
            {!submittedThought && !loading && (
              <div className="card text-center py-xxl border-dashed border-hairline-soft">
                <p className="text-muted text-sm">
                  Share a thought above and Yaar will offer a fresh
                  perspective.
                  <br />
                  This uses CBT-style reframing to help you step out of the
                  spiral.
                </p>
              </div>
            )}
          </div>

          {/* Right: illustration */}
          <div className="hidden lg:flex items-start justify-center pt-0 lg:pt-xxl sticky top-xl">
            <Image
              src="/images/reframe.svg"
              alt="A person sitting and processing their thoughts, surrounded by floating elements representing ideas and reflection"
              width={480}
              height={400}
              className="w-full max-w-[480px] h-auto"
              priority
            />
          </div>
        </div>
      </div>
    </div>
  );
}
