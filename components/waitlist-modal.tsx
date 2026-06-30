"use client";

import { useState, FormEvent } from "react";

interface Props {
  open: boolean;
  reason: "voice" | "chat" | "general";
  email: string;
  onClose: () => void;
}

export function WaitlistModal({ open, reason, email, onClose }: Props) {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  if (!open) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, reason, note: note || undefined }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Something went wrong");
      }
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Network error");
    }
  }

  return (
    <div
      className="fixed inset-0 bg-surface-dark/60 flex items-center justify-center z-50 p-lg"
      role="dialog"
      aria-modal="true"
      aria-labelledby="waitlist-title"
      onClick={onClose}
    >
      <div
        className="bg-canvas rounded-lg border border-hairline shadow-xl max-w-md w-full p-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {status === "done" ? (
          <div className="text-center">
            <h3 id="waitlist-title" className="font-display text-title-md text-ink mb-sm">
              You&apos;re on the list!
            </h3>
            <p className="text-body text-muted mb-lg">
              We&apos;ll reach out when more capacity opens up. Thank you for being part of this.
            </p>
            <button onClick={onClose} className="btn-primary">
              Continue
            </button>
          </div>
        ) : (
          <>
            <h3 id="waitlist-title" className="font-display text-title-md text-ink mb-sm">
              Want more {reason === "voice" ? "voice time" : "chat time"}?
            </h3>
            <p className="text-body-sm text-muted mb-lg">
              Join the waitlist and we&apos;ll let you know when paid plans unlock. No spam - just one email when it&apos;s ready.
            </p>
            <form onSubmit={submit} className="space-y-md">
              <input
                type="email"
                value={email}
                disabled
                className="input-field w-full opacity-60"
                aria-label="Email"
              />
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything you want to tell us? (optional)"
                className="input-field w-full resize-none"
                rows={3}
                maxLength={500}
              />
              {status === "error" && errorMsg && (
                <p className="text-sm text-error">{errorMsg}</p>
              )}
              <div className="flex gap-sm">
                <button type="button" onClick={onClose} className="btn-secondary flex-1">
                  Not now
                </button>
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {status === "loading" ? "Joining…" : "Join waitlist"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
