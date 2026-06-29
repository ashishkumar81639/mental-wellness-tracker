import { describe, it, expect } from "vitest";
import { sanitizeForSpeech, splitForSpeech } from "@/lib/voice/speech-text";

describe("sanitizeForSpeech", () => {
  it("strips bold and italic markers but keeps the words", () => {
    expect(sanitizeForSpeech("I **hear** you, that *matters*.")).toBe(
      "I hear you, that matters."
    );
  });

  it("handles underscores and inline code", () => {
    expect(sanitizeForSpeech("you are _not_ behind, run `npm test`")).toBe(
      "you are not behind, run npm test"
    );
  });

  it("removes list bullets, headings and blockquotes at line start", () => {
    const input = "# Title\n- one small step\n> a quote";
    expect(sanitizeForSpeech(input)).toBe("Title\none small step\na quote");
  });

  it("keeps link text and drops the url", () => {
    expect(sanitizeForSpeech("call [Tele-MANAS](tel:14416) now")).toBe(
      "call Tele-MANAS now"
    );
  });

  it("removes emoji and stray markdown punctuation", () => {
    expect(sanitizeForSpeech("you've got this 🙂✨ ## keep going")).toBe(
      "you've got this keep going"
    );
  });

  it("does not leave spaces before punctuation", () => {
    expect(sanitizeForSpeech("breathe **,** then rest")).toBe("breathe, then rest");
  });

  it("returns empty string for emoji-only input", () => {
    expect(sanitizeForSpeech("🙂✨")).toBe("");
  });
});

describe("splitForSpeech", () => {
  it("returns a single chunk when under the limit", () => {
    expect(splitForSpeech("short reply", 500)).toEqual(["short reply"]);
  });

  it("never exceeds the max length per chunk", () => {
    const long = "word ".repeat(400).trim(); // ~2000 chars
    const chunks = splitForSpeech(long, 500);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(500);
  });

  it("prefers sentence boundaries", () => {
    const a = "A".repeat(300);
    const b = "B".repeat(300);
    const [first, second] = splitForSpeech(`${a}. ${b}.`, 500);
    expect(first).toBe(`${a}.`);
    expect(second).toBe(`${b}.`);
  });

  it("reassembles to the original words in order", () => {
    const text = Array.from({ length: 50 }, (_, i) => `sentence number ${i}.`).join(" ");
    const chunks = splitForSpeech(text, 200);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(text);
  });

  it("hard-cuts text with no natural break", () => {
    const chunks = splitForSpeech("x".repeat(1200), 500);
    expect(chunks.every((c) => c.length <= 500)).toBe(true);
    expect(chunks.join("")).toBe("x".repeat(1200));
  });
});
