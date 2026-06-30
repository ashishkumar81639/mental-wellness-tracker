// Startup guard: refuse to boot if critical env vars are missing.
// Called at module load time in routes that depend on these vars.
// Voice keys (ASSEMBLY_API_KEY, SARVAM_API_KEY) are optional - the app
// works without them, just voice features are disabled.

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Set it in .env or your deployment platform.`
    );
  }
  return value;
}

export const DATABASE_URL = assertEnv("DATABASE_URL");
export const JWT_SECRET_ENV = assertEnv("JWT_SECRET");
export const DEEPSEEK_API_KEY = assertEnv("DEEPSEEK_API_KEY");

// Transactional email (Resend). Optional at boot - auth routes that need
// email will throw a clear error if called without these.
export const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
export const EMAIL_FROM = process.env.EMAIL_FROM ?? "Yaar <noreply@send.yaarhelp.in>";
export const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";

// DeepSeek connection constants. The API may route deepseek-chat to
// deepseek-v4-flash; this is expected and does not affect functionality.
export const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
export const DEEPSEEK_MODEL = "deepseek-chat";

// Voice keys are optional. Warn but don't crash.
if (!process.env.ASSEMBLY_API_KEY && !process.env.SARVAM_API_KEY) {
  console.warn(
    "⚠ No voice provider API keys set (ASSEMBLY_API_KEY or SARVAM_API_KEY). Voice features disabled."
  );
}

export function logLLMCall(
  agent: string,
  model: string,
  ms: number,
  tokens?: { prompt?: number; completion?: number }
): void {
  const parts = [`[llm] agent=${agent} model=${model} latency=${ms}ms`];
  if (tokens?.prompt != null) parts.push(`promptTokens=${tokens.prompt}`);
  if (tokens?.completion != null) parts.push(`completionTokens=${tokens.completion}`);
  console.log(parts.join(" "));
}
