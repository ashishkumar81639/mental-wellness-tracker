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

// Voice keys are optional. Warn but don't crash.
if (!process.env.ASSEMBLY_API_KEY && !process.env.SARVAM_API_KEY) {
  console.warn(
    "⚠ No voice provider API keys set (ASSEMBLY_API_KEY or SARVAM_API_KEY). Voice features disabled."
  );
}
