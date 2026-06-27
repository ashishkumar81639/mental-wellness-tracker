import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Dummy values so importing env-guarded modules (auth, db) never aborts a test run.
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      JWT_SECRET: "test-secret-test-secret-test-secret-0123456789",
      DEEPSEEK_API_KEY: "test-deepseek-key",
    },
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["lib/db.ts", "lib/env.ts"],
    },
  },
});
