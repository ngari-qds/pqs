/** Template configs and quote content are plain JSON (duplicable, savable). */

export const FORMAT_IDS = [
  "classic", "hbp", "carousel", "one-liner", "highlight", "contrast", "myth-truth", "then-now",
  "paradox", "list", "qa", "definition", "equation", "stat", "law", "dialogue", "stanza",
  "field-note", "post-card", "pull-quote",
] as const;
export type FormatId = (typeof FORMAT_IDS)[number];

/** Layout ids are per format (see formats/index.ts); unknown ids fall back to the format's first layout. */
export type LayoutId = string;

export type BackgroundConfig =
  | { kind: "solid" }
  | { kind: "gradient"; angle?: number }
  | { kind: "paper"; strength?: number }
  | { kind: "vignette"; strength?: number }
  | { kind: "photo-scrim"; scrim?: "auto" | "bottom" | "top" | "full" | "left"; strength?: number }
  | { kind: "photo-mono-tint"; strength?: number }
  | { kind: "photo-duotone" }
  | { kind: "photo-blur"; radius?: number }
  | { kind: "photo-split"; ratio?: number }
  | { kind: "photo-frame"; ratio?: number };

export type SignatureStyle = "line" | "stacked" | "caps" | "rule" | "monogram" | "vertical";

export interface TemplateConfig {
  id: string;
  name: string;
  format: FormatId;
  layout: LayoutId;
  pairing: string;
  palette: string;
  background: BackgroundConfig;
  /** Attribution treatment for author lines. */
  attribution?: "caps" | "dash";
  emphasis?: "italic" | "color" | "underline" | "marker";
  /** Use the accent colour for decorative marks (rules, quotation marks). */
  accentMarks?: boolean;
  hero?: boolean;
  tags?: string[];
  /** Generated templates: presets where the sample text sets comfortably. */
  presets?: string[];
  /** Generated templates: fitness score from the generator. */
  score?: number;
}

/**
 * Quote content: the format plus its named fields (see each format's field
 * definitions). Lists are string arrays. `slide` selects a carousel slide.
 */
export interface QuoteContent {
  format: FormatId;
  slide?: number;
  [field: string]: string | string[] | number | undefined;
}

/** For classic content in older call sites and tests. */
export interface ClassicContent extends QuoteContent {
  format: "classic";
  text: string;
  author?: string;
}

export const str = (c: QuoteContent, key: string): string => {
  const v = c[key];
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
};
export const list = (c: QuoteContent, key: string): string[] => {
  const v = c[key];
  return Array.isArray(v) ? v.map((x) => x.trim()).filter(Boolean) : typeof v === "string" ? v.split("\n").map((x) => x.trim()).filter(Boolean) : [];
};

export const isPhotoBackground = (bg: BackgroundConfig) => bg.kind.startsWith("photo");
