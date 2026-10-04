/** Template configs are plain JSON so they can be duplicated, tweaked and saved. */

export type FormatId = "classic";

export type LayoutId =
  | "centered"
  | "editorial"
  | "bottom"
  | "top"
  | "pull-quote"
  | "corner"
  | "framed-card";

export type BackgroundConfig =
  | { kind: "solid" }
  | { kind: "gradient"; angle?: number }
  | { kind: "paper"; strength?: number }
  | { kind: "vignette"; strength?: number }
  | { kind: "photo-scrim"; scrim?: "bottom" | "top" | "full" | "left"; strength?: number }
  | { kind: "photo-mono-tint"; strength?: number };

export type SignatureStyle = "line" | "stacked" | "caps" | "rule" | "monogram" | "vertical";

export interface TemplateConfig {
  id: string;
  name: string;
  format: FormatId;
  layout: LayoutId;
  pairing: string;
  palette: string;
  background: BackgroundConfig;
  /** Attribution treatment for the author line. */
  attribution?: "caps" | "dash";
  emphasis?: "italic" | "color" | "underline" | "marker";
  /** Use the accent colour for decorative marks (rules, quotation marks). */
  accentMarks?: boolean;
  hero?: boolean;
  tags?: string[];
}

export interface ClassicContent {
  format: "classic";
  text: string;
  author?: string;
}

export type QuoteContent = ClassicContent;

export const isPhotoBackground = (bg: BackgroundConfig) => bg.kind.startsWith("photo");
