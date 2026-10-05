/**
 * Calm-area scoring. Samples a small copy of each candidate photo inside the
 * region where text will sit and measures how busy it is: luminance spread
 * plus edge energy. Lower is calmer, so text has room.
 */
import type { LayoutId } from "../render/template";

export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where a layout puts its text, as fractions of the canvas. */
export function textRegionFor(layout: LayoutId): NormRect {
  switch (layout) {
    case "bottom":
      return { x: 0.07, y: 0.5, w: 0.86, h: 0.43 };
    case "top":
      return { x: 0.07, y: 0.07, w: 0.86, h: 0.43 };
    case "editorial":
      return { x: 0.07, y: 0.2, w: 0.78, h: 0.55 };
    case "corner":
      return { x: 0.07, y: 0.62, w: 0.62, h: 0.31 };
    case "strip":
      return { x: 0.0, y: 0.0, w: 0.5, h: 1 };
    case "swiss":
      return { x: 0.07, y: 0.07, w: 0.86, h: 0.5 };
    case "big-word":
      return { x: 0.07, y: 0.25, w: 0.86, h: 0.5 };
    default:
      return { x: 0.1, y: 0.25, w: 0.8, h: 0.5 };
  }
}

export interface CalmScore {
  /** Combined busyness; lower is better. */
  score: number;
  /** Std-dev of luma (0..1) in the region. */
  spread: number;
  /** Mean absolute neighbour difference (0..1): texture/edges. */
  edges: number;
  /** Mean luma (0..1) in the region. */
  mean: number;
}

/**
 * RGBA pixels of a (small) image, already cover-cropped to the canvas aspect.
 */
export function calmScore(px: Uint8ClampedArray | Uint8Array, w: number, h: number, region: NormRect): CalmScore {
  const x0 = Math.max(0, Math.floor(region.x * w)), x1 = Math.min(w, Math.ceil((region.x + region.w) * w));
  const y0 = Math.max(0, Math.floor(region.y * h)), y1 = Math.min(h, Math.ceil((region.y + region.h) * h));
  const luma = (i: number) => (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
  let n = 0, sum = 0, sum2 = 0, edge = 0, en = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const l = luma(i);
      sum += l;
      sum2 += l * l;
      n++;
      if (x + 1 < x1) {
        edge += Math.abs(l - luma(i + 4));
        en++;
      }
      if (y + 1 < y1) {
        edge += Math.abs(l - luma(i + w * 4));
        en++;
      }
    }
  }
  if (!n) return { score: 1, spread: 1, edges: 1, mean: 0 };
  const mean = sum / n;
  const spread = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  const edges = en ? edge / en : 0;
  // Edges dominate legibility at text sizes; spread catches big light/dark splits.
  return { score: spread * 0.6 + edges * 4, spread, edges, mean };
}
