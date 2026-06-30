import { describe, it, expect } from "vitest";
import { generateOtp } from "@/lib/otp";

describe("generateOtp", () => {
  it("produces a 6-digit zero-padded string", () => {
    const code = generateOtp();
    expect(code).toMatch(/^\d{6}$/);
  });

  it("is always between 000000 and 999999", () => {
    for (let i = 0; i < 200; i++) {
      const n = Number(generateOtp());
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(999999);
    }
  });
});
