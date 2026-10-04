import type { FontStyle } from "../fonts/registry";

export type Ctx = CanvasRenderingContext2D;

export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: "2d"): Ctx | null;
}

/** Anything drawImage accepts (ImageBitmap, HTMLCanvasElement, napi Image/Canvas). */
export interface Drawable {
  width: number;
  height: number;
}

/** Platform hooks so the same renderer runs in the browser and in Node (QA). */
export interface RenderEnv {
  createCanvas(w: number, h: number): CanvasLike;
  /** CSS font-family string for a canonical Google family name. */
  fontFamily(family: string): string;
}

export interface FaceRef {
  family: string;
  weight: number;
  style?: FontStyle;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const inside = (a: Rect, outer: Rect, eps = 0.5) =>
  a.x >= outer.x - eps && a.y >= outer.y - eps && a.x + a.w <= outer.x + outer.w + eps && a.y + a.h <= outer.y + outer.h + eps;
