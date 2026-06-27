import { describe, it, expect } from "vitest";
import {
  LoginInput,
  RegisterInput,
  CheckInInput,
  ChatInput,
  ReframeInput,
  JournalQuery,
} from "@/lib/schemas";

describe("CheckInInput", () => {
  it("accepts a valid check-in", () => {
    const r = CheckInInput.safeParse({
      body: "Today felt heavy and I could not focus.",
      mood: 2,
      energy: 3,
      sleep_hrs: 6,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a too-short body", () => {
    expect(CheckInInput.safeParse({ body: "hi", mood: 3, energy: 3 }).success).toBe(false);
  });

  it("rejects out-of-range mood", () => {
    const r = CheckInInput.safeParse({
      body: "long enough body here",
      mood: 9,
      energy: 3,
    });
    expect(r.success).toBe(false);
  });

  it("treats sleep_hrs as optional", () => {
    const r = CheckInInput.safeParse({ body: "long enough body here", mood: 3, energy: 3 });
    expect(r.success).toBe(true);
  });
});

describe("RegisterInput", () => {
  it("accepts a valid registration", () => {
    const r = RegisterInput.safeParse({
      username: "demo_user",
      name: "Demo",
      password: "secret1",
      exam_type: "JEE",
      exam_date: "2026-07-01",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown exam_type", () => {
    const r = RegisterInput.safeParse({
      username: "demo_user",
      name: "Demo",
      password: "secret1",
      exam_type: "SAT",
    });
    expect(r.success).toBe(false);
  });

  it("rejects uppercase usernames", () => {
    const r = RegisterInput.safeParse({
      username: "DemoUser",
      name: "Demo",
      password: "secret1",
      exam_type: "JEE",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed exam_date", () => {
    const r = RegisterInput.safeParse({
      username: "demo_user",
      name: "Demo",
      password: "secret1",
      exam_type: "JEE",
      exam_date: "01-07-2026",
    });
    expect(r.success).toBe(false);
  });
});

describe("LoginInput / ChatInput / ReframeInput", () => {
  it("login rejects empty credentials", () => {
    expect(LoginInput.safeParse({ username: "", password: "" }).success).toBe(false);
  });

  it("chat rejects an empty message", () => {
    expect(ChatInput.safeParse({ message: "" }).success).toBe(false);
  });

  it("reframe rejects a too-short thought", () => {
    expect(ReframeInput.safeParse({ thought: "no" }).success).toBe(false);
  });
});

describe("JournalQuery coercion + defaults", () => {
  it("applies defaults when params are absent", () => {
    const r = JournalQuery.parse({});
    expect(r).toEqual({ days: 7, offset: 0, limit: 10 });
  });

  it("coerces string query params to numbers", () => {
    const r = JournalQuery.parse({ days: "30", offset: "5", limit: "20" });
    expect(r).toEqual({ days: 30, offset: 5, limit: 20 });
  });

  it("rejects a limit above the cap", () => {
    expect(JournalQuery.safeParse({ limit: "999" }).success).toBe(false);
  });
});
