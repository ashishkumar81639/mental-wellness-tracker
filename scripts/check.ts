// Full-pipeline smoke test: authenticates, submits a check-in, validates the analysis output.
// Prints PASS or FAIL. Run with: npm run check

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

interface AnalysisResult {
  entry_id: number;
  analysis: {
    emotion: string;
    intensity: number;
    summary: string;
    reframe: string;
    coping: { strategy: string; mindfulness: string; nudge: string };
    triggers: Array<{ label: string; category: string; sentiment: number }>;
    safety_flag: boolean;
  } | null;
  llm_error: { code: string; message: string } | null;
}

function fail(reason: string): never {
  console.error(`FAIL: ${reason}`);
  process.exit(1);
}

async function main() {
  console.log("check.ts: starting full-pipeline smoke test...");

  // 1. Login
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "demo@yaarhelp.in", password: "demo123" }),
  });

  if (!loginRes.ok) {
    fail(`login returned ${loginRes.status}: ${await loginRes.text()}`);
  }

  const { token } = await loginRes.json();

  // 2. Submit check-in
  const checkInRes = await fetch(`${BASE_URL}/api/check-in`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      body: "Mock test tomorrow and I have not finished the syllabus. Everyone in my batch seems ahead of me and I cannot sleep.",
      mood: 2,
      energy: 2,
      sleep_hrs: 4.5,
    }),
  });

  if (!checkInRes.ok) {
    fail(`check-in returned ${checkInRes.status}: ${await checkInRes.text()}`);
  }

  const result: AnalysisResult = await checkInRes.json();

  // 3. Assert structure
  const entryId = Number(result.entry_id);
  if (isNaN(entryId) || entryId < 1) {
    fail("missing or invalid entry_id");
  }

  // Analysis may be null if LLM failed - check llm_error instead
  if (result.analysis) {
    // Core fields
    if (!result.analysis.emotion || typeof result.analysis.emotion !== "string") {
      fail("missing or invalid analysis.emotion");
    }
    if (typeof result.analysis.intensity !== "number" || result.analysis.intensity < 1 || result.analysis.intensity > 5) {
      fail("missing or invalid analysis.intensity");
    }
    if (!result.analysis.summary || typeof result.analysis.summary !== "string") {
      fail("missing or invalid analysis.summary");
    }
    if (!result.analysis.reframe || typeof result.analysis.reframe !== "string") {
      fail("missing or invalid analysis.reframe");
    }
    if (!result.analysis.coping?.strategy || !result.analysis.coping?.mindfulness || !result.analysis.coping?.nudge) {
      fail("missing or invalid analysis.coping fields");
    }
    if (typeof result.analysis.safety_flag !== "boolean") {
      fail("missing or invalid analysis.safety_flag");
    }
    if (!Array.isArray(result.analysis.triggers)) {
      fail("missing or invalid analysis.triggers array");
    }
    if (result.analysis.triggers.length > 0) {
      const t = result.analysis.triggers[0];
      if (!t.label || !t.category || typeof t.sentiment !== "number") {
        fail("trigger missing required fields");
      }
    }
    if (result.llm_error !== null) {
      // Got analysis plus an llm_error - that's the "completed with non-critical error" case
      console.log("  (analysis completed with non-critical llm_error)");
    }
  } else {
    // Analysis is null - check we have a proper llm_error
    if (!result.llm_error || !result.llm_error.code || !result.llm_error.message) {
      fail("analysis is null but llm_error is missing or incomplete");
    }
    console.log(`  (analysis unavailable: [${result.llm_error.code}])`);
  }

  console.log(`PASS: entry_id=${result.entry_id}`);

  // 4. Clean up: delete the test entry so it does not clutter the user's journal.
  const deleteRes = await fetch(
    `${BASE_URL}/api/check-in?entry_id=${result.entry_id}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  if (deleteRes.ok) {
    console.log("  (test entry cleaned up)");
  } else {
    console.log(`  (cleanup returned ${deleteRes.status} — entry_id=${result.entry_id} left in DB)`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL: unhandled exception:", err);
  process.exit(1);
});
