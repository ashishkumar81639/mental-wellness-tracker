import { describe, it, expect, vi } from "vitest";
import { buildUserPrompt, sanitiseToolJson } from "@/lib/agents/journal-analyst";
import { calculateStreak } from "@/lib/utils";

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
    expect(result).toContain("Energy: 4/5");
    expect(result).not.toContain("Sleep:");
  });

  it("wraps journal in triple quotes", () => {
    const result = buildUserPrompt("hello world", 3, 3, 6.5);
    expect(result).toContain('"""\nhello world\n"""');
  });
});

describe("sanitiseToolJson", () => {
  it("parses valid JSON", () => {
    const result = sanitiseToolJson('{"key":"value"}');
    expect(result).toEqual({ key: "value" });
  });

  it("strips markdown json fences", () => {
    const result = sanitiseToolJson('```json\n{"a":1}\n```');
    expect(result).toEqual({ a: 1 });
  });

  it("strips markdown fences without language tag", () => {
    const result = sanitiseToolJson('```\n{"b":2}\n```');
    expect(result).toEqual({ b: 2 });
  });

  it("parses nested objects", () => {
    const result = sanitiseToolJson(
      '{"triggers":[{"label":"mock","category":"academic","sentiment":-2}]}'
    );
    expect(result.triggers).toHaveLength(1);
    expect((result.triggers as Array<Record<string, unknown>>)[0].label).toBe("mock");
  });

  it("throws on completely invalid input", () => {
    expect(() => sanitiseToolJson("not json at all {{{")).toThrow();
  });
});

describe("calculateStreak", () => {
  it("returns 0 for empty dates", () => {
    expect(calculateStreak([], new Date("2026-06-27"))).toBe(0);
  });

  it("returns 1 when only today has an entry", () => {
    const dates = [{ entry_date: "2026-06-27" }];
    expect(calculateStreak(dates, new Date("2026-06-27"))).toBe(1);
  });

  it("returns 3 for 3 consecutive days ending today", () => {
    vi.useFakeTimers();
    const dates = [
      { entry_date: "2026-06-27" },
      { entry_date: "2026-06-26" },
      { entry_date: "2026-06-25" },
    ];
    expect(calculateStreak(dates, new Date("2026-06-27"))).toBe(3);
    vi.useRealTimers();
  });

  it("skips today if missing and starts from yesterday", () => {
    const dates = [
      { entry_date: "2026-06-26" },
      { entry_date: "2026-06-25" },
    ];
    // today (27th) has no entry -> streak starts from 26th
    expect(calculateStreak(dates, new Date("2026-06-27"))).toBe(2);
  });

  it("breaks on gap", () => {
    const dates = [
      { entry_date: "2026-06-27" },
      { entry_date: "2026-06-25" }, // gap on 26th
    ];
    expect(calculateStreak(dates, new Date("2026-06-27"))).toBe(1);
  });

  it("caps at 31 days", () => {
    const dates = [];
    for (let i = 0; i < 31; i++) {
      const d = new Date("2026-06-27");
      d.setDate(d.getDate() - i);
      dates.push({ entry_date: d.toISOString().split("T")[0] });
    }
    expect(calculateStreak(dates, new Date("2026-06-27"))).toBe(31);
  });
});
