"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LeafIcon } from "@/components/icons";

function BrandMark() {
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/12 text-primary">
      <LeafIcon />
    </span>
  );
}

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [examType, setExamType] = useState("JEE");
  const [examDate, setExamDate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint =
        mode === "login" ? "/api/auth/login" : "/api/auth/register";

      const body: Record<string, string> = { username, password };
      if (mode === "register") {
        body.name = name;
        body.exam_type = examType;
        if (examDate) body.exam_date = examDate;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setLoading(false);
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      router.push("/dashboard");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  const EXAM_OPTIONS = [
    "JEE",
    "NEET",
    "CUET",
    "CAT",
    "GATE",
    "UPSC",
    "boards",
    "other",
  ];

  const isLogin = mode === "login";

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
          className={`object-cover transition-opacity duration-700 ease-out ${
            isLogin ? "opacity-100" : "opacity-0"
          }`}
        />
        <Image
          src="/illustrations/friends-support.png"
          alt=""
          fill
          sizes="50vw"
          className={`object-cover transition-opacity duration-700 ease-out ${
            isLogin ? "opacity-0" : "opacity-100"
          }`}
        />
        {/* Warm scrim for legible overlay text */}
        <div className="absolute inset-0 bg-gradient-to-t from-surface-dark via-surface-dark/40 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-xxl">
          <p className="text-caption-uppercase text-accent-amber mb-sm">
            Yaar · यार
          </p>
          <h2 className="font-display text-display-sm text-on-dark max-w-sm leading-snug">
            {isLogin
              ? "Welcome back. Let's breathe through today, together."
              : "You don't have to carry exam stress alone."}
          </h2>
          <p className="text-body-md text-on-dark-soft mt-sm max-w-sm">
            {isLogin
              ? "Your journal, your moods, your companion — right where you left them."
              : "A calm space to track how you feel and find your footing again."}
          </p>
        </div>
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center p-lg sm:p-xl">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-xl">
            <div className="flex items-center justify-center gap-sm mb-sm">
              <BrandMark />
              <h1 className="text-display-md font-display text-ink">Yaar</h1>
            </div>
            <p className="text-body-md text-muted">
              Your companion through the exam journey.
            </p>
          </div>

          {/* Card */}
          <div className="card">
          {/* Tabs */}
          <div className="flex mb-lg bg-surface-soft rounded-md p-xxs">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 py-xs text-sm font-medium rounded-sm transition-colors ${
                mode === "login"
                  ? "bg-canvas text-ink shadow-sm"
                  : "text-muted hover:text-body"
              }`}
            >
              Sign in
            </button>
            <button
              onClick={() => setMode("register")}
              className={`flex-1 py-xs text-sm font-medium rounded-sm transition-colors ${
                mode === "register"
                  ? "bg-canvas text-ink shadow-sm"
                  : "text-muted hover:text-body"
              }`}
            >
              Register
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-md p-sm bg-error/10 text-error text-sm rounded-md border border-error/20">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-md">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-body-strong mb-xxs"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field w-full"
                placeholder="your_username"
                autoComplete="username"
              />
            </div>

            {mode === "register" && (
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-body-strong mb-xxs"
                >
                  Your name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field w-full"
                  placeholder="What should we call you?"
                  autoComplete="name"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-body-strong mb-xxs"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field w-full"
                placeholder="••••••"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
            </div>

            {mode === "register" && (
              <>
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

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
        </div>

          {/* Demo hint */}
          <p className="text-center text-caption text-muted-soft mt-lg">
            Demo account: <span className="font-medium">demo_user</span> /{" "}
            <span className="font-medium">demo123</span>
          </p>
        </div>
      </section>
    </main>
  );
}
