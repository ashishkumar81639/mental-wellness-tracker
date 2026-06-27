import { describe, it, expect } from "vitest";
import { buildCompanionMessages } from "@/lib/agents/companion";

const history = Array.from({ length: 10 }, (_, i) => ({
  role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
  content: `msg ${i}`,
  created_at: `2026-06-${10 + i}`,
}));

describe("buildCompanionMessages", () => {
  it("always leads with the system prompt and ends with the user message", () => {
    const messages = buildCompanionMessages("SYSTEM", [], [], "hello");
    expect(messages[0]).toEqual({ role: "system", content: "SYSTEM" });
    expect(messages[messages.length - 1]).toEqual({ role: "user", content: "hello" });
  });

  it("injects journal summaries as a context-only system message", () => {
    const messages = buildCompanionMessages(
      "SYSTEM",
      [{ date: "2026-06-20", emotion: "anxiety", summary: "mock test fear" }],
      [],
      "hi"
    );
    const ctx = messages.find(
      (m) => m.role === "system" && m.content.includes("CONTEXT")
    );
    expect(ctx?.content).toContain("anxiety");
    expect(ctx?.content).toContain("mock test fear");
  });

  it("replays only the last 6 chat turns", () => {
    const messages = buildCompanionMessages("SYSTEM", [], history, "now");
    const replayed = messages.filter((m) => m.content.startsWith("msg "));
    expect(replayed).toHaveLength(6);
    expect(replayed[0].content).toBe("msg 4");
    expect(replayed[5].content).toBe("msg 9");
  });

  it("omits the context block when there are no journals", () => {
    const messages = buildCompanionMessages("SYSTEM", [], [], "hi");
    expect(messages.some((m) => m.content.includes("CONTEXT"))).toBe(false);
  });
});
