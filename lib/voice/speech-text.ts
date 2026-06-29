/**
 * Normalize an LLM reply for text-to-speech.
 *
 * The companion is allowed to use light markdown (**bold**, *italic*) because
 * the chat UI renders it. TTS engines, however, read the raw glyphs aloud
 * ("asterisk asterisk hopeful asterisk asterisk"), which sounds robotic and
 * broken. This strips formatting markers and unspeakable symbols while keeping
 * the words intact, so the voice reads clean, natural sentences.
 */
export function sanitizeForSpeech(input: string): string {
  let text = input;

  // [label](url) -> label
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // Emphasis / code / strikethrough: drop the markers, keep the content.
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2"); // **bold** / __bold__
  text = text.replace(/(\*|_)(.*?)\1/g, "$2"); // *italic* / _italic_
  text = text.replace(/~~(.*?)~~/g, "$1"); // ~~strike~~
  text = text.replace(/`+([^`]*)`+/g, "$1"); // `code`

  // Line-start markers: headings, blockquotes, list bullets/numbers.
  text = text.replace(/^[ \t]*#{1,6}[ \t]+/gm, "");
  text = text.replace(/^[ \t]*>[ \t]?/gm, "");
  text = text.replace(/^[ \t]*([-*•]|\d+[.)])[ \t]+/gm, "");

  // Any leftover markdown punctuation that would otherwise be spoken.
  text = text.replace(/[*_`~#]/g, "");

  // Emoji, pictographs, arrows and dingbats — silent or mispronounced by TTS.
  text = text.replace(
    /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}]/gu,
    ""
  );

  // Collapse the whitespace the removals leave behind.
  text = text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,!?;:])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

/**
 * Split text into chunks no longer than `maxLen` characters, breaking at
 * sentence boundaries where possible and word boundaries otherwise. Some TTS
 * providers (Sarvam) cap each input string at 500 chars, so a long reply must
 * be chunked — the provider then stitches the clips back into one audio.
 */
export function splitForSpeech(text: string, maxLen = 500): string[] {
  const chunks: string[] = [];
  let rest = text.trim();

  while (rest.length > maxLen) {
    const window = rest.slice(0, maxLen);
    // Prefer the last sentence end within the window (incl. Hindi danda).
    let cut = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
      window.lastIndexOf("। ")
    );
    // If that boundary is too early, fall back to the last word break.
    if (cut < maxLen * 0.5) cut = window.lastIndexOf(" ");
    // No usable boundary at all: hard-cut at the limit.
    cut = cut <= 0 ? maxLen : cut + 1;

    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);

  return chunks;
}

/**
 * Incremental sentence splitter for streaming text. Feed it token deltas as
 * they arrive from the LLM; `push` returns whichever complete sentences have
 * become available, and `flush` returns the trailing partial sentence at the
 * end. This is what lets us synthesize and speak sentence-by-sentence instead
 * of waiting for the whole reply — the source of the latency win.
 */
export function createSentenceChunker(
  opts: { firstChunkChars?: number } = {}
): {
  push: (delta: string) => string[];
  flush: () => string;
} {
  // When > 0, the FIRST chunk is allowed to break early at a clause boundary
  // (or word break) once it reaches this length — so the first words start
  // synthesizing immediately instead of waiting for a whole opening sentence.
  // This is the main lever on perceived time-to-first-audio.
  const firstChunkChars = opts.firstChunkChars ?? 0;
  let buffer = "";
  let emittedFirst = false;

  // A sentence ends at . ! ? or the Hindi danda (।) — optionally followed by a
  // closing quote/bracket — and then whitespace; or at one or more line breaks.
  // Requiring trailing whitespace avoids splitting decimals like "3.14".
  const sentence = /(?:[.!?।]+["'”’)\]]?\s)|(?:\n+)/;
  const clause = /[,;:—–]\s/g;

  // Index just past the next chunk boundary in `buffer`, or -1 if none yet.
  function nextCut(): number {
    const sm = buffer.match(sentence);
    let cut = sm && sm.index !== undefined ? sm.index + sm[0].length : -1;

    if (!emittedFirst && firstChunkChars > 0 && buffer.length >= firstChunkChars) {
      clause.lastIndex = 0;
      let m: RegExpExecArray | null;
      let early = -1;
      while ((m = clause.exec(buffer))) {
        const end = m.index + m[0].length;
        if (end >= firstChunkChars) { early = end; break; }
      }
      if (early < 0) {
        const sp = buffer.indexOf(" ", firstChunkChars);
        if (sp >= 0) early = sp + 1;
      }
      if (early > 0 && (cut < 0 || early < cut)) cut = early;
    }
    return cut;
  }

  return {
    push(delta: string): string[] {
      buffer += delta;
      const out: string[] = [];
      for (;;) {
        const cut = nextCut();
        if (cut < 0) break;
        const piece = buffer.slice(0, cut).trim();
        buffer = buffer.slice(cut);
        if (piece) {
          out.push(piece);
          emittedFirst = true;
        }
      }
      return out;
    },
    flush(): string {
      const rest = buffer.trim();
      buffer = "";
      emittedFirst = true;
      return rest;
    },
  };
}
