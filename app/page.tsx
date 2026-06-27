"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

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

  return (
    <main className="min-h-screen flex items-center justify-center p-lg">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-xl">
          <h1 className="text-display-md font-display text-ink mb-sm">
            Yaar
          </h1>
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
    </main>
  );
}
