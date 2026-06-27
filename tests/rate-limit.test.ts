import { describe, it, expect, vi, afterEach } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";

function reqFromIp(ip: string): Request {
  return new Request("http://localhost/api/test", {
    headers: { "x-forwarded-for": ip },
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows requests up to the configured limit", () => {
    const ip = "10.0.0.1";
    // register limit is 5/min
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(reqFromIp(ip), "auth:register").allowed).toBe(true);
    }
  });

  it("blocks the request that exceeds the limit and reports retryAfter", () => {
    const ip = "10.0.0.2";
    for (let i = 0; i < 5; i++) checkRateLimit(reqFromIp(ip), "auth:register");
    const blocked = checkRateLimit(reqFromIp(ip), "auth:register");
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfter).toBeGreaterThan(0);
    }
  });

  it("resets after the window elapses", () => {
    vi.useFakeTimers();
    const ip = "10.0.0.3";
    for (let i = 0; i < 5; i++) checkRateLimit(reqFromIp(ip), "auth:register");
    expect(checkRateLimit(reqFromIp(ip), "auth:register").allowed).toBe(false);

    vi.advanceTimersByTime(61_000);
    expect(checkRateLimit(reqFromIp(ip), "auth:register").allowed).toBe(true);
  });

  it("does not limit unregistered endpoints", () => {
    for (let i = 0; i < 100; i++) {
      expect(checkRateLimit(reqFromIp("10.0.0.4"), "unknown-endpoint").allowed).toBe(true);
    }
  });

  it("tracks limits per IP independently", () => {
    for (let i = 0; i < 5; i++) checkRateLimit(reqFromIp("10.0.0.5"), "auth:register");
    expect(checkRateLimit(reqFromIp("10.0.0.5"), "auth:register").allowed).toBe(false);
    expect(checkRateLimit(reqFromIp("10.0.0.6"), "auth:register").allowed).toBe(true);
  });
});
