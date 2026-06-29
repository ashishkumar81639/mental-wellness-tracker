import { describe, it, expect } from "vitest";
import {
  sanitizeForSpeech,
  splitForSpeech,
  createSentenceChunker,
} from "@/lib/voice/speech-text";

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

describe("createSentenceChunker", () => {
  it("emits a sentence only once its boundary + whitespace arrives", () => {
    const c = createSentenceChunker();
    expect(c.push("Hello there. How are")).toEqual(["Hello there."]);
    expect(c.push(" you")).toEqual([]); // no terminator yet
    expect(c.push("? ")).toEqual(["How are you?"]);
  });

  it("does not split decimals", () => {
    const c = createSentenceChunker();
    expect(c.push("It costs 3.14 today")).toEqual([]);
    expect(c.flush()).toBe("It costs 3.14 today");
  });

  it("splits on line breaks and the Hindi danda", () => {
    const c = createSentenceChunker();
    expect(c.push("पहला वाक्य। ")).toEqual(["पहला वाक्य।"]);
    expect(c.push("line one\nline two")).toEqual(["line one"]);
    expect(c.flush()).toBe("line two");
  });

  it("flush returns the trailing partial sentence", () => {
    const c = createSentenceChunker();
    c.push("Done. ");
    expect(c.flush()).toBe("");
    c.push("no terminator");
    expect(c.flush()).toBe("no terminator");
  });

  it("breaks the first chunk early at a clause once past the threshold", () => {
    const c = createSentenceChunker({ firstChunkChars: 18 });
    const first = c.push("I really hear you, and that matters a lot to me.");
    expect(first).toEqual(["I really hear you,"]);
    // The remainder (no trailing terminator) comes out on flush.
    expect(c.flush()).toBe("and that matters a lot to me.");
  });

  it("only the first chunk breaks early; later sentences stay whole", () => {
    const c = createSentenceChunker({ firstChunkChars: 10 });
    const out = c.push("I hear you, and we will get through this together. Okay?");
    // "I hear you," snaps off early; the next sentence is NOT split at its comma.
    expect(out[0]).toBe("I hear you,");
    expect(out).toContain("and we will get through this together.");
    expect(c.flush()).toBe("Okay?");
  });

  it("first chunk falls back to a word break when there is no clause", () => {
    const c = createSentenceChunker({ firstChunkChars: 10 });
    const out = c.push("breathe slowly and steadily for a moment");
    // No comma: break at the first space at/after 10 chars.
    expect(out[0]).toBe("breathe slowly");
  });

  it("streaming token-by-token reassembles to the original sentences", () => {
    const c = createSentenceChunker();
    const text = "First one. Second two! Third three?";
    const out: string[] = [];
    for (const ch of text) out.push(...c.push(ch));
    const tail = c.flush();
    if (tail) out.push(tail);
    expect(out).toEqual(["First one.", "Second two!", "Third three?"]);
  });
});
