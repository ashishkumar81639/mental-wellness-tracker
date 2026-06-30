"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LeafIcon } from "@/components/icons";

type Stage =
  | { kind: "login" }
  | { kind: "register" }
  | { kind: "verify-signup"; email: string }
  | { kind: "reset-request" }
  | { kind: "reset-confirm"; email: string };

function BrandMark() {
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/12 text-primary">
      <LeafIcon />
    </span>
  );
}

export default function AuthPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "login" });
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [examType, setExamType] = useState("JEE");
  const [examDate, setExamDate] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  function persistSession(data: { token: string; user: unknown }) {
    // sprint: JWT in localStorage (XSS-vulnerable). Move to httpOnly cookie
    // set by the auth routes if the app outlives the sprint.
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    router.push("/dashboard");
  }

  async function callApi(path: string, body: unknown) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error(data.error ?? "Something went wrong"), {
        code: data.code,
      });
    }
    return data;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      if (stage.kind === "login") {
        const data = await callApi("/api/auth/login", { email, password });
        persistSession(data);
      } else if (stage.kind === "register") {
        const body: Record<string, string> = { email, name, password, exam_type: examType };
        if (examDate) body.exam_date = examDate;
        await callApi("/api/auth/register", body);
        setStage({ kind: "verify-signup", email });
        setInfo("We sent a 6-digit code to your email. Enter it below.");
      } else if (stage.kind === "verify-signup") {
        const data = await callApi("/api/auth/otp/verify", {
          email: stage.email,
          code,
          purpose: "signup",
        });
        persistSession(data);
      } else if (stage.kind === "reset-request") {
        await callApi("/api/auth/otp/request", { email, purpose: "reset" });
        setStage({ kind: "reset-confirm", email });
        setInfo("If that email exists, a code is on its way.");
      } else if (stage.kind === "reset-confirm") {
        await callApi("/api/auth/reset", {
          email: stage.email,
          code,
          password: newPassword,
        });
        setStage({ kind: "login" });
        setPassword("");
        setInfo("Password updated. Sign in with your new password.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    if (stage.kind !== "verify-signup") return;
    setError("");
    setInfo("");
    setLoading(true);
    try {
      await callApi("/api/auth/otp/request", { email: stage.email, purpose: "signup" });
      setInfo("A new code is on its way.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code.");
    } finally {
      setLoading(false);
    }
  }

  const EXAM_OPTIONS = ["JEE", "NEET", "CUET", "CAT", "GATE", "UPSC", "boards", "other"];

  const heading =
    stage.kind === "login"
      ? "Welcome back. Let's breathe through today, together."
      : stage.kind === "register"
        ? "You don't have to carry exam stress alone."
        : stage.kind === "verify-signup"
          ? "One last step - verify your email."
          : stage.kind === "reset-request"
            ? "Reset your password."
            : "Set a new password.";

  const subheading =
    stage.kind === "login"
      ? "Your journal, your moods, your companion - right where you left them."
      : stage.kind === "register"
        ? "A calm space to track how you feel and find your footing again."
        : stage.kind === "verify-signup"
          ? "Enter the 6-digit code we sent to your inbox."
          : stage.kind === "reset-request"
            ? "We'll email you a code to set a new password."
            : "Enter the code from your email and your new password.";

  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      {/* Illustration panel */}
      <section
        className="relative hidden lg:block overflow-hidden bg-surface-dark"
        aria-hidden="true"
      >
        <Image
          src="/illustrations/study-night.png"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface-dark via-surface-dark/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-xxl">
          <p className="text-caption-uppercase text-accent-amber mb-sm">Yaar · यार</p>
          <h2 className="font-display text-display-sm text-on-dark max-w-sm leading-snug">
            {heading}
          </h2>
          <p className="text-body-md text-on-dark-soft mt-sm max-w-sm">{subheading}</p>
        </div>
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center p-lg sm:p-xl">
        <div className="w-full max-w-md">
          <div className="text-center mb-xl">
            <div className="flex items-center justify-center gap-sm mb-sm">
              <BrandMark />
              <h1 className="text-display-md font-display text-ink">Yaar</h1>
            </div>
            <p className="text-body-md text-muted">Your companion through the exam journey.</p>
          </div>

          <div className="card">
            {/* Tabs - only on login/register */}
            {(stage.kind === "login" || stage.kind === "register") && (
              <div className="flex mb-lg bg-surface-soft rounded-md p-xxs">
                <button
                  type="button"
                  onClick={() => {
                    setStage({ kind: "login" });
                    setError("");
                    setInfo("");
                  }}
                  className={`flex-1 py-xs text-sm font-medium rounded-sm transition-colors ${
                    stage.kind === "login"
                      ? "bg-canvas text-ink shadow-sm"
                      : "text-muted hover:text-body"
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStage({ kind: "register" });
                    setError("");
                    setInfo("");
                  }}
                  className={`flex-1 py-xs text-sm font-medium rounded-sm transition-colors ${
                    stage.kind === "register"
                      ? "bg-canvas text-ink shadow-sm"
                      : "text-muted hover:text-body"
                  }`}
                >
                  Register
                </button>
              </div>
            )}

            {error && (
              <div className="mb-md p-sm bg-error/10 text-error text-sm rounded-md border border-error/20">
                {error}
              </div>
            )}
            {info && (
              <div className="mb-md p-sm bg-accent/10 text-accent text-sm rounded-md border border-accent/20">
                {info}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-md">
              {stage.kind === "login" && (
                <>
                  <EmailField value={email} onChange={setEmail} />
                  <PasswordField
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    autoComplete="current-password"
                  />
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setStage({ kind: "reset-request" });
                        setError("");
                        setInfo("");
                      }}
                      className="text-sm text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                </>
              )}

              {stage.kind === "register" && (
                <>
                  <EmailField value={email} onChange={setEmail} />
                  <NameField value={name} onChange={setName} />
                  <PasswordField
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    autoComplete="new-password"
                  />
                  <div className="grid grid-cols-2 gap-sm">
                    <div>
                      <label
                        htmlFor="examType"
                        className="block text-sm font-medium text-body-strong mb-xxs"
                      >
                        Exam
                      </label>
                      <select
                        id="examType"
                        value={examType}
                        onChange={(e) => setExamType(e.target.value)}
                        className="input-field w-full"
                      >
                        {EXAM_OPTIONS.map((ex) => (
                          <option key={ex} value={ex}>
                            {ex}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="examDate"
                        className="block text-sm font-medium text-body-strong mb-xxs"
                      >
                        Exam date
                      </label>
                      <input
                        id="examDate"
                        type="date"
                        value={examDate}
                        onChange={(e) => setExamDate(e.target.value)}
                        className="input-field w-full"
                      />
                    </div>
                  </div>
                </>
              )}

              {stage.kind === "verify-signup" && (
                <>
                  <p className="text-sm text-muted">
                    Code sent to <span className="font-medium text-body">{stage.email}</span>
                  </p>
                  <div>
                    <label
                      htmlFor="code"
                      className="block text-sm font-medium text-body-strong mb-xxs"
                    >
                      Verification code
                    </label>
                    <input
                      id="code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="\d{6}"
                      maxLength={6}
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="input-field w-full tracking-[0.5em] text-center"
                      placeholder="••••••"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={resendCode}
                    disabled={loading}
                    className="text-sm text-primary hover:underline disabled:opacity-50"
                  >
                    Resend code
                  </button>
                </>
              )}

              {stage.kind === "reset-request" && (
                <>
                  <EmailField value={email} onChange={setEmail} />
                  <button
                    type="button"
                    onClick={() => {
                      setStage({ kind: "login" });
                      setError("");
                      setInfo("");
                    }}
                    className="text-sm text-muted hover:text-body"
                  >
                    Back to sign in
                  </button>
                </>
              )}

              {stage.kind === "reset-confirm" && (
                <>
                  <p className="text-sm text-muted">
                    Code sent to <span className="font-medium text-body">{stage.email}</span>
                  </p>
                  <div>
                    <label
                      htmlFor="code"
                      className="block text-sm font-medium text-body-strong mb-xxs"
                    >
                      Reset code
                    </label>
                    <input
                      id="code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="\d{6}"
                      maxLength={6}
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="input-field w-full tracking-[0.5em] text-center"
                      placeholder="••••••"
                    />
                  </div>
                  <PasswordField
                    label="New password"
                    value={newPassword}
                    onChange={setNewPassword}
                    autoComplete="new-password"
                  />
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? "Please wait..."
                  : stage.kind === "login"
                    ? "Sign in"
                    : stage.kind === "register"
                      ? "Create account"
                      : stage.kind === "verify-signup"
                        ? "Verify email"
                        : stage.kind === "reset-request"
                          ? "Send reset code"
                          : "Update password"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}

function EmailField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor="email" className="block text-sm font-medium text-body-strong mb-xxs">
        Email
      </label>
      <input
        id="email"
        type="email"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field w-full"
        placeholder="you@example.com"
        autoComplete="email"
      />
    </div>
  );
}

function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor="name" className="block text-sm font-medium text-body-strong mb-xxs">
        Your name
      </label>
      <input
        id="name"
        type="text"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field w-full"
        placeholder="What should we call you?"
        autoComplete="name"
      />
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  return (
    <div>
      <label htmlFor="password" className="block text-sm font-medium text-body-strong mb-xxs">
        {label}
      </label>
      <input
        id="password"
        type="password"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field w-full"
        placeholder="••••••"
        autoComplete={autoComplete}
      />
    </div>
  );
}
