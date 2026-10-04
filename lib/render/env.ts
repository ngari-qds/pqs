import type { Ctx, FaceRef, RenderEnv } from "./types";

/** Builds a CSS font shorthand for canvas. */
export function fontString(env: RenderEnv, face: FaceRef, px: number): string {
  return `${face.style === "italic" ? "italic " : ""}${face.weight} ${px}px ${env.fontFamily(face.family)}`;
}

export interface FaceMetrics {
  /** All at 1px font size. */
  capHeight: number;
  xHeight: number;
  ascent: number;
  descent: number;
  space: number;
  avgChar: number;
}

const REF = 100;

/**
 * Text measurement at a 100px reference size, cached. Widths scale linearly
 * with size (tracking is expressed in em), so line breaking never depends on
 * the output resolution.
 */
export class Measurer {
  private ctx: Ctx;
  private cache = new Map<string, number>();
  private metricsCache = new Map<string, FaceMetrics>();
  readonly letterSpacingSupported: boolean;

  constructor(private env: RenderEnv) {
    const c = env.createCanvas(8, 8);
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.letterSpacingSupported = "letterSpacing" in ctx;
  }

  private setFont(face: FaceRef, trackingEm: number) {
    this.ctx.font = fontString(this.env, face, REF);
    if (this.letterSpacingSupported) this.ctx.letterSpacing = `${(trackingEm * REF).toFixed(3)}px`;
  }

  /** Advance width at 1px font size (trailing letter-spacing excluded). */
  width(face: FaceRef, text: string, trackingEm = 0): number {
    const key = `${face.family}|${face.weight}|${face.style ?? ""}|${trackingEm.toFixed(4)}|${text}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    this.setFont(face, trackingEm);
    let w = this.ctx.measureText(text).width / REF;
    if (this.letterSpacingSupported && text.length) w -= trackingEm; // canvas adds spacing after the last glyph too
    this.cache.set(key, w);
    return w;
  }

  /** Ink bounds of a single glyph at 1px: ascent above and descent below baseline (negative = above). */
  glyphBox(face: FaceRef, ch: string): { ascent: number; descent: number; width: number } {
    this.setFont(face, 0);
    const t = this.ctx.measureText(ch);
    return { ascent: t.actualBoundingBoxAscent / REF, descent: t.actualBoundingBoxDescent / REF, width: t.width / REF };
  }

  metrics(face: FaceRef): FaceMetrics {
    const key = `${face.family}|${face.weight}|${face.style ?? ""}`;
    const hit = this.metricsCache.get(key);
    if (hit) return hit;
    this.setFont(face, 0);
    const H = this.ctx.measureText("H");
    const x = this.ctx.measureText("x");
    const g = this.ctx.measureText("gjpqy");
    const sample = "the quick brown fox jumps over a lazy dog";
    const m: FaceMetrics = {
      capHeight: H.actualBoundingBoxAscent / REF,
      xHeight: x.actualBoundingBoxAscent / REF,
      ascent: (H.fontBoundingBoxAscent ?? H.actualBoundingBoxAscent * 1.3) / REF,
      descent: g.actualBoundingBoxDescent / REF,
      space: this.ctx.measureText(" ").width / REF,
      avgChar: this.ctx.measureText(sample).width / sample.length / REF,
    };
    this.metricsCache.set(key, m);
    return m;
  }
}
