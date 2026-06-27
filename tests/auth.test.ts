import { describe, it, expect } from "vitest";
import { signToken, verifyToken, extractToken } from "@/lib/auth";

describe("JWT round-trip", () => {
  it("signs a token that verifies back to the same subject", async () => {
    const token = await signToken("demo_user");
    const payload = await verifyToken(token);
    expect(payload?.username).toBe("demo_user");
  });

  it("rejects a tampered token", async () => {
    const token = await signToken("demo_user");
    const tampered = token.slice(0, -2) + (token.endsWith("a") ? "b" : "a");
    expect(await verifyToken(tampered)).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await verifyToken("not.a.jwt")).toBeNull();
  });
});

describe("extractToken", () => {
  it("extracts a bearer token", () => {
    const req = new Request("http://localhost", {
      headers: { authorization: "Bearer abc.def.ghi" },
    });
    expect(extractToken(req)).toBe("abc.def.ghi");
  });

  it("returns null without a bearer prefix", () => {
    const req = new Request("http://localhost", {
      headers: { authorization: "Basic abc" },
    });
    expect(extractToken(req)).toBeNull();
  });

  it("returns null when the header is missing", () => {
    expect(extractToken(new Request("http://localhost"))).toBeNull();
  });
});
