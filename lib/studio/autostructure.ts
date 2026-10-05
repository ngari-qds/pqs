/**
 * Auto-structure: suggests a hook / body / punchline split for a pasted
 * paragraph, using sentence boundaries. The result is only a suggestion; the
 * user edits it freely.
 */
import { sentences } from "@/lib/render/formats/hbp";

export interface Structured {
  hook: string;
  body: string;
  punchline: string;
}

export function autoStructure(paragraph: string): Structured {
  const text = paragraph.replace(/\s+/g, " ").trim();
  const s = sentences(text);
  if (s.length === 0) return { hook: "", body: "", punchline: "" };
  if (s.length === 1) {
    // One sentence: split at a strong mid-sentence pause if there is one.
    const m = text.match(/^(.{8,}?)([,;:—–]\s+)(.{8,})$/);
    if (m) return { hook: m[1].trim(), body: "", punchline: capitalise(m[3]) };
    return { hook: text, body: "", punchline: "" };
  }
  if (s.length === 2) return { hook: s[0], body: "", punchline: s[1] };
  return { hook: s[0], body: s.slice(1, -1).join(" "), punchline: s[s.length - 1] };
}

const capitalise = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** The reverse: flattens structured content back into one paragraph. */
export const flatten = (c: Partial<Structured>) => [c.hook, c.body, c.punchline].map((x) => x?.trim()).filter(Boolean).join(" ");
