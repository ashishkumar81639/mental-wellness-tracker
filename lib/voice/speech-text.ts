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
