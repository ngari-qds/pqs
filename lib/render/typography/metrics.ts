/**
 * Size-dependent typographic rules: line height and optical letter-spacing.
 * `ratio` is font size divided by canvas width, so rules are resolution-free.
 */

export type TextRole = "display" | "body" | "label" | "caps" | "mono";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Line height multiplier: tight for big display text, open for body copy. */
export function lineHeightFor(role: TextRole, ratio: number, fontFactor = 1): number {
  switch (role) {
    case "display":
      // 3% of width -> 1.34, 12% of width -> 1.04
      return clamp(1.34 - ((ratio - 0.03) / 0.09) * 0.3, 1.02, 1.34) * fontFactor;
    case "body":
    case "mono":
      return clamp(1.52 - ((ratio - 0.02) / 0.04) * 0.14, 1.36, 1.52) * fontFactor;
    case "label":
    case "caps":
      return 1.3;
  }
}

/** Optical tracking in em: tighten large display text, loosen caps and labels. */
export function trackingFor(role: TextRole, ratio: number, base = 0): number {
  switch (role) {
    case "display":
      return base - 0.024 * clamp((ratio - 0.035) / 0.07, 0, 1);
    case "body":
      return base;
    case "mono":
      return base - 0.01;
    case "label":
      return base + 0.02;
    case "caps":
      return base + 0.12;
  }
}

/** Target characters per line (spec: display 18–32, body 35–55). */
export const MEASURE: Record<TextRole, [number, number]> = {
  display: [14, 32],
  body: [30, 55],
  mono: [18, 40],
  label: [0, 80],
  caps: [0, 80],
};
