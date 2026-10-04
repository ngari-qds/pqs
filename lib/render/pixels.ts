/**
 * Pixel-level operations that canvas gradients cannot do cleanly: every
 * gradient, scrim and vignette is computed in float and quantised with
 * triangular dither, so 8-bit output never shows banding.
 */
import { LINEAR_LUT, hexToRgb, mixOklab, type RGB } from "./color";
import { ditherTable, mulberry32 } from "./random";
import type { Ctx, Rect } from "./types";

const DITHER = ditherTable(0x51f15e, 65536, 1.0);
const clampRect = (ctx: Ctx, r: Rect) => {
  const x = Math.max(0, Math.floor(r.x));
  const y = Math.max(0, Math.floor(r.y));
  const w = Math.min(ctx.canvas.width, Math.ceil(r.x + r.w)) - x;
  const h = Math.min(ctx.canvas.height, Math.ceil(r.y + r.h)) - y;
  return { x, y, w: Math.max(0, w), h: Math.max(0, h) };
};

export interface GradientStop {
  at: number;
  color: string;
}

/** Builds a 4096-entry float LUT across stops, interpolated in OKLab. */
function gradientLut(stops: GradientStop[]): Float32Array {
  const N = 4096;
  const lut = new Float32Array(N * 3);
  const s = [...stops].sort((a, b) => a.at - b.at);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    let k = 0;
    while (k < s.length - 2 && t > s[k + 1].at) k++;
    const a = s[k], b = s[Math.min(k + 1, s.length - 1)];
    const span = b.at - a.at || 1;
    const u = Math.max(0, Math.min(1, (t - a.at) / span));
    const c = mixOklab(a.color, b.color, u);
    lut[i * 3] = c[0];
    lut[i * 3 + 1] = c[1];
    lut[i * 3 + 2] = c[2];
  }
  return lut;
}

/** Linear gradient at `angleDeg` (0 = top→bottom), dithered. */
export function fillLinearGradient(ctx: Ctx, rect: Rect, stops: GradientStop[], angleDeg = 0) {
  const r = clampRect(ctx, rect);
  if (!r.w || !r.h) return;
  const lut = gradientLut(stops);
  const img = ctx.createImageData(r.w, r.h);
  const d = img.data;
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(a), dy = Math.cos(a);
  const half = (Math.abs(dx) * r.w + Math.abs(dy) * r.h) / 2;
  const cx = r.w / 2, cy = r.h / 2;
  let p = 0, n = 0;
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const t = ((x - cx) * dx + (y - cy) * dy) / (2 * half);
      const li = Math.max(0, Math.min(4095, (t * 4095) | 0)) * 3;
      d[p] = lut[li] + DITHER[n++ & 65535];
      d[p + 1] = lut[li + 1] + DITHER[n++ & 65535];
      d[p + 2] = lut[li + 2] + DITHER[n++ & 65535];
      d[p + 3] = 255;
      p += 4;
    }
  }
  ctx.putImageData(img, r.x, r.y);
}

/**
 * Composites `color` over existing pixels with a per-pixel alpha function,
 * in float with dither. Used for scrims, vignettes and local contrast fixes.
 * Pass `base` when the area underneath is a known solid colour: the pixels
 * are then generated instead of read back, which is faster.
 */
export function compositeAlpha(ctx: Ctx, rect: Rect, color: string | RGB, alphaAt: (x: number, y: number) => number, base?: string) {
  const r = clampRect(ctx, rect);
  if (!r.w || !r.h) return;
  const [cr, cg, cb] = typeof color === "string" ? hexToRgb(color) : color;
  let img: ImageData;
  if (base) {
    img = ctx.createImageData(r.w, r.h);
    const [br, bg, bb] = hexToRgb(base);
    const d0 = img.data;
    for (let i = 0; i < d0.length; i += 4) {
      d0[i] = br;
      d0[i + 1] = bg;
      d0[i + 2] = bb;
      d0[i + 3] = 255;
    }
  } else img = ctx.getImageData(r.x, r.y, r.w, r.h);
  const d = img.data;
  let p = 0, n = (r.x * 7 + r.y * 13) & 65535;
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const al = alphaAt(r.x + x + 0.5, r.y + y + 0.5);
      if (al > 0) {
        const ia = 1 - al;
        d[p] = d[p] * ia + cr * al + DITHER[n++ & 65535];
        d[p + 1] = d[p + 1] * ia + cg * al + DITHER[n++ & 65535];
        d[p + 2] = d[p + 2] * ia + cb * al + DITHER[n++ & 65535];
      }
      p += 4;
    }
  }
  ctx.putImageData(img, r.x, r.y);
}

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Generated paper: base colour, fine grain and faint low-frequency fibre
 * mottling. Amplitudes are tiny so text stays crisp and contrast is stable.
 */
export function fillPaper(ctx: Ctx, rect: Rect, base: string, seed = 7, strength = 1) {
  const r = clampRect(ctx, rect);
  const [br, bg, bb] = hexToRgb(base);
  const rnd = mulberry32(seed);
  // Low-frequency value noise on a coarse grid.
  const cell = Math.max(24, Math.round(Math.min(r.w, r.h) / 18));
  const gw = Math.ceil(r.w / cell) + 2, gh = Math.ceil(r.h / cell) + 2;
  const grid = new Float32Array(gw * gh).map(() => rnd() * 2 - 1);
  const fineCell = Math.max(3, Math.round(cell / 9));
  const fw = Math.ceil(r.w / fineCell) + 2, fh = Math.ceil(r.h / fineCell) + 2;
  const fine = new Float32Array(fw * fh).map(() => rnd() * 2 - 1);
  const sample = (g: Float32Array, w: number, x: number, y: number) => {
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = g[y0 * w + x0], b = g[y0 * w + x0 + 1], c = g[(y0 + 1) * w + x0], e = g[(y0 + 1) * w + x0 + 1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + e) * sx * sy;
  };
  const img = ctx.createImageData(r.w, r.h);
  const d = img.data;
  const grainRnd = mulberry32(seed * 31 + 1);
  let p = 0;
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const mott = sample(grid, gw, x / cell, y / cell) * 3.2 + sample(fine, fw, x / fineCell, y / fineCell) * 1.4;
      const grain = (grainRnd() + grainRnd() - 1) * 2.4;
      const v = (mott + grain) * strength;
      d[p] = br + v;
      d[p + 1] = bg + v;
      d[p + 2] = bb + v * 0.92;
      d[p + 3] = 255;
      p += 4;
    }
  }
  ctx.putImageData(img, r.x, r.y);
}

export interface LumaStats {
  min: number;
  p02: number;
  p50: number;
  p98: number;
  max: number;
  mean: number;
  /** Standard deviation of relative luminance — "busyness" of the region. */
  sd: number;
}

/** Samples relative luminance under a rect (strided to ~60k samples). */
export function lumaStats(ctx: Ctx, rect: Rect): LumaStats {
  const r = clampRect(ctx, rect);
  if (!r.w || !r.h) return { min: 0, p02: 0, p50: 0, p98: 0, max: 0, mean: 0, sd: 0 };
  const d = ctx.getImageData(r.x, r.y, r.w, r.h).data;
  const total = r.w * r.h;
  const stride = Math.max(1, Math.floor(Math.sqrt(total / 60000)));
  const hist = new Uint32Array(1024);
  let n = 0, sum = 0, sum2 = 0;
  for (let y = 0; y < r.h; y += stride) {
    for (let x = 0; x < r.w; x += stride) {
      const i = (y * r.w + x) * 4;
      const L = 0.2126 * LINEAR_LUT[d[i]] + 0.7152 * LINEAR_LUT[d[i + 1]] + 0.0722 * LINEAR_LUT[d[i + 2]];
      hist[Math.min(1023, (L * 1023) | 0)]++;
      sum += L;
      sum2 += L * L;
      n++;
    }
  }
  const pct = (q: number) => {
    const target = q * n;
    let acc = 0;
    for (let i = 0; i < 1024; i++) {
      acc += hist[i];
      if (acc >= target) return (i + 0.5) / 1023;
    }
    return 1;
  };
  const mean = sum / n;
  return { min: pct(0), p02: pct(0.02), p50: pct(0.5), p98: pct(0.98), max: pct(1), mean, sd: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) };
}
