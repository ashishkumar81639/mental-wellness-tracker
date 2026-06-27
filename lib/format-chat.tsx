import type { ReactNode } from "react";

/**
 * Convert basic markdown formatting to React elements.
 * Handles **bold** and *italic*. Safe: never uses dangerouslySetInnerHTML.
 * The primary fix lives in the companion prompt (no-markdown rule);
 * this is a defense-in-depth safety net.
 */
export function formatChatText(text: string): ReactNode[] {
  // Matches **bold** or *italic* — bold first to avoid conflicting with single asterisks
  const parts = text.split(/(\*\*.*?\*\*|\*(?!\*).*?\*(?!\*))/g);

  return parts.map((part, i) => {
    // **bold**
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    // *italic*
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={i} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}
