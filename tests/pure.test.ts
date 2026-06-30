import { describe, it, expect } from "vitest";
import {
  buildUserPrompt,
  sanitiseToolJson,
  parseAnalysis,
  calculateStreak,
  coerceExamType,
  daysUntil,
  averageMood,
  buildStressForecast,
  preloadedCopingFor,
} from "@/lib/utils";

describe("buildUserPrompt", () => {
  it("builds a prompt with mood, energy, and sleep", () => {
    const result = buildUserPrompt("I am stressed", 2, 3, 7);
    expect(result).toContain("I am stressed");
    expect(result).toContain("Mood: 2/5");
    expect(result).toContain("Energy: 3/5");
    expect(result).toContain("Sleep: 7h");
  });

  it("omits sleep when undefined", () => {
    const result = buildUserPrompt("Testing", 4, 4);
    expect(result).toContain("Mood: 4/5");
    expect(result).not.toContain("Sleep:");
  });

  it("wraps journal in triple quotes", () => {
    const result = buildUserPrompt("hello world", 3, 3, 6.5);
    expect(result).toContain('"""\nhello world\n"""');
  });
});

describe("sanitiseToolJson", () => {
  it("parses valid JSON", () => {
    expect(sanitiseToolJson('{"key":"value"}')).toEqual({ key: "value" });
  });

  it("strips markdown json fences", () => {
    expect(sanitiseToolJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("strips markdown fences without language tag", () => {
    expect(sanitiseToolJson('```\n{"b":2}\n```')).toEqual({ b: 2 });
  });

  it("returns empty object on completely invalid input", () => {
    expect(sanitiseToolJson("not json at all {{{")).toEqual({});
  });
});

describe("parseAnalysis", () => {
  it("validates a well-formed payload", () => {
    const result = parseAnalysis(
      {
        emotion: "burnout",
        intensity: 4,
        summary: "tired",
        reframe: "you matter",
        strategy: "rest",
        mindfulness: "breathe",
        nudge: "one step",
        safety_flag: false,
      },
      { triggers: [{ label: "mock test", category: "academic", sentiment: -2 }] }
    );
    expect(result.emotion).toBe("burnout");
    expect(result.triggers).toHaveLength(1);
    expect(result.triggers[0].label).toBe("mock test");
  });

  it("self-heals bad fields to safe defaults", () => {
    const result = parseAnalysis(
      { emotion: "", intensity: 99, safety_flag: "nope" },
      { triggers: "not-an-array" }
    );
    expect(result.emotion).toBe("anxiety");
    expect(result.intensity).toBe(3);
    expect(result.safety_flag).toBe(false);
    expect(result.triggers).toEqual([]);
  });

  it("defaults missing trigger fields", () => {
    const result = parseAnalysis(
      { emotion: "calm", intensity: 2 },
      { triggers: [{ sentiment: 1 }] }
    );
    expect(result.triggers[0].label).toBe("unknown");
    expect(result.triggers[0].category).toBe("self");
    expect(result.triggers[0].sentiment).toBe(1);
  });
});

describe("coerceExamType", () => {
  it("passes known exam types through", () => {
    expect(coerceExamType("JEE")).toBe("JEE");
    expect(coerceExamType("UPSC")).toBe("UPSC");
  });

  it("falls back to 'other' for unknown or empty values", () => {
    expect(coerceExamType("SAT")).toBe("other");
    expect(coerceExamType("")).toBe("other");
    expect(coerceExamType(null)).toBe("other");
    expect(coerceExamType(undefined)).toBe("other");
  });
});

describe("calculateStreak", () => {
  const jun27 = "2026-06-27";

  it("returns 0 for empty dates", () => {
    expect(calculateStreak([], jun27)).toBe(0);
  });

  it("returns 3 for 3 consecutive days ending today", () => {
    const dates = [
      { entry_date: "2026-06-27" },
      { entry_date: "2026-06-26" },
      { entry_date: "2026-06-25" },
    ];
    expect(calculateStreak(dates, jun27)).toBe(3);
  });

  it("skips today if missing and starts from yesterday", () => {
    const dates = [{ entry_date: "2026-06-26" }, { entry_date: "2026-06-25" }];
    expect(calculateStreak(dates, jun27)).toBe(2);
  });

  it("breaks on gap", () => {
    const dates = [{ entry_date: "2026-06-27" }, { entry_date: "2026-06-25" }];
    expect(calculateStreak(dates, jun27)).toBe(1);
  });

  it("caps at dates length not at arbitrary bound", () => {
    const dates: Array<{ entry_date: string }> = [];
    for (let i = 0; i < 40; i++) {
      const d = new Date(jun27);
      d.setDate(d.getDate() - i);
      dates.push({ entry_date: d.toISOString().split("T")[0] });
    }
    expect(calculateStreak(dates, jun27)).toBe(40);
  });
});

describe("daysUntil", () => {
  it("counts whole days to a future date", () => {
    expect(daysUntil(new Date("2026-07-04"), new Date("2026-06-27"))).toBe(7);
  });

  it("returns negative once past", () => {
    expect(daysUntil(new Date("2026-06-20"), new Date("2026-06-27"))).toBeLessThan(0);
  });
});

describe("averageMood", () => {
  it("defaults to neutral 3 with no data", () => {
    expect(averageMood([])).toBe(3);
  });

  it("averages the provided moods", () => {
    expect(averageMood([2, 4])).toBe(3);
    expect(averageMood([1, 2, 3])).toBe(2);
  });
});

describe("buildStressForecast", () => {
  it("produces a point per day in the horizon", () => {
    const forecast = buildStressForecast(3, null, new Date("2026-06-27"), 7);
    expect(forecast).toHaveLength(7);
    expect(forecast[0].date).toBe("2026-06-27");
  });

  it("clamps predicted stress to the 1-5 range", () => {
    const forecast = buildStressForecast(1, null, new Date("2026-06-27"));
    for (const point of forecast) {
      expect(point.predictedStress).toBeGreaterThanOrEqual(1);
      expect(point.predictedStress).toBeLessThanOrEqual(5);
    }
  });

  it("raises stress as the exam approaches", () => {
    const today = new Date("2026-06-27");
    const examSoon = new Date("2026-06-29");
    const farAway = buildStressForecast(3, null, today);
    const nearExam = buildStressForecast(3, examSoon, today);
    expect(nearExam[0].predictedStress).toBeGreaterThanOrEqual(farAway[0].predictedStress);
    expect(nearExam[0].reason).toContain("Exam in");
  });
});

describe("preloadedCopingFor", () => {
  it("returns the final-stretch message at <= 3 days", () => {
    expect(preloadedCopingFor(2)).toContain("final stretch");
  });

  it("returns the two-week message at <= 14 days", () => {
    expect(preloadedCopingFor(10)).toContain("Two weeks");
  });

  it("interpolates the day count for longer horizons", () => {
    expect(preloadedCopingFor(40)).toContain("40 days");
  });

  it("prompts to set an exam date when null", () => {
    expect(preloadedCopingFor(null)).toContain("Set your exam date");
  });
});
