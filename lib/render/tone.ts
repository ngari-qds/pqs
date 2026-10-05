/**
 * Monochrome renderings.
 *
 *   mono  — analog black and white: neutral greys pushed to deep blacks and
 *           bright paper, contrasty film-curve photos, film grain and a soft
 *           print vignette.
 *   pure  — strict two-tone: type and shapes in solid black or white, photos
 *           as 1-bit error-diffusion dither, like an old photocopy or zine.
 *
 * The palette is mapped before layout, so the contrast checks run on the
 * monochrome inks; photos are converted before they are drawn, so scrims are
 * judged on the final photo. The finishing pass only adds grain/vignette
 * (mono) or quantises to two tones (pure).
 */
import { LINEAR_LUT, contrastRatio, luminance } from "./color";
import type { Palette } from "./palettes";
import { drawPhotoCover, type PhotoInput } from "./photo";
import { greyFromLuminance, toGreyscale } from "./pixels";
import { mulberry32 } from "./random";
import type { Ctx, Drawable, RenderEnv } from "./types";

export type Tone = "color" | "mono" | "pure";
export const TONES: { id: Tone; name: string }[] = [
  { id: "color", name: "Colour" },
  { id: "mono", name: "Mono" },
  { id: "pure", name: "Pure B&W" },
];

/** The grey at relative luminance `l`. */
const grey = (l: number) => greyFromLuminance(Math.max(0, Math.min(1, l)));

/** Moves `c` away from `bg` (darker on light grounds, lighter on dark) until it reaches `min` contrast. */
function ensureContrast(l: number, bg: string, dark: boolean, min: number) {
  let c = grey(l);
  for (let i = 0; i < 40 && contrastRatio(c, bg) < min; i++) {
    l = dark ? l + (1 - l) * 0.12 + 0.004 : l * 0.88;
    c = grey(l);
  }
  return c;
}

/** The palette as monochrome inks. */
export function tonePalette(p: Palette, tone: Tone): Palette {
  if (tone === "color") return p;
  if (tone === "pure") {
    const bg = p.dark ? "#000000" : "#ffffff", ink = p.dark ? "#ffffff" : "#000000";
    return { ...p, bg, bg2: bg, ink, muted: ink, accent: ink };
  }
  // Mono: deep blacks and bright paper; light inks near white on dark grounds.
  const push = (c: string) => {
    const l = luminance(c);
    return grey(p.dark ? l * 0.45 : 1 - (1 - l) * 0.55);
  };
  const bg = push(p.bg), bg2 = push(p.bg2);
  const ink = p.dark ? "#f2f2f2" : "#0d0d0d";
  // Secondary text gets headroom (7:1) so grain and vignette never threaten 4.5:1.
  const muted = ensureContrast(luminance(p.muted), bg, p.dark, 7);
  const accent = ensureContrast(luminance(p.accent), bg, p.dark, 4.5);
  return { ...p, bg, bg2, ink, muted, accent };
}

/** sRGB grey value (0..1) of a pixel, by linear luminance. */
const greyValue = (r: number, g: number, b: number) => toSrgb(0.2126 * LINEAR_LUT[r] + 0.7152 * LINEAR_LUT[g] + 0.0722 * LINEAR_LUT[b]);

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Film curve: lifted contrast, crushed blacks, clean highlights. */
function filmCurve(strength: number) {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let g = i / 255;
    g = Math.max(0, Math.min(1, (g - 0.035) / (0.965 - 0.035)));
    g = g + (smooth(g) - g) * strength;
    lut[i] = Math.round(g * 255);
  }
  return lut;
}

const photoCache = new WeakMap<Drawable, Map<string, Drawable>>();

/**
 * A monochrome copy of the photo, cached per source image, tone and size.
 * Photos much larger than the canvas are first reduced to just cover it (no
 * layout ever needs more), which keeps the conversion fast; a photo that is
 * too small is left as it is, so upscaling is still reported.
 */
export function tonePhoto(env: RenderEnv, photo: PhotoInput | undefined, tone: Tone, W: number, H: number): PhotoInput | undefined {
  if (!photo || tone === "color") return photo;
  const iw = photo.image.width, ih = photo.image.height;
  const f = Math.max(W / iw, H / ih);
  const [w, h] = f < 0.8 ? [Math.ceil(iw * f), Math.ceil(ih * f)] : [iw, ih];
  let cache = photoCache.get(photo.image);
  if (!cache) photoCache.set(photo.image, (cache = new Map()));
  const key = `${tone}:${w}x${h}`;
  let image = cache.get(key);
  if (!image) {
    const c = env.createCanvas(w, h);
    const ctx = c.getContext("2d")!;
    if (w === iw) ctx.drawImage(photo.image as CanvasImageSource, 0, 0);
    else drawPhotoCover(ctx, env, { image: photo.image }, { x: 0, y: 0, w, h });
    const curve = filmCurve(tone === "pure" ? 0.85 : 0.6);
    const band = Math.max(1, Math.floor(4_000_000 / w));
    for (let y0 = 0; y0 < h; y0 += band) {
      const bh = Math.min(band, h - y0);
      const img = ctx.getImageData(0, y0, w, bh);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = curve[Math.round(greyValue(d[i], d[i + 1], d[i + 2]) * 255)];
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      ctx.putImageData(img, 0, y0);
    }
    cache.set(key, (image = c));
  }
  return { ...photo, image };
}

/** Mono's faded-print curve on an sRGB grey (0..1): blacks lift, whites sit below paper white. */
const fade = (g: number) => 0.045 + g * 0.925;

/** Vignette factor (≤ 1) at distance `r` from the centre (1 = the corners). */
const falloff = (r: number) => (r > 0.45 ? 1 - 0.2 * smooth(Math.min(1, (r - 0.45) / 0.6)) : 1);

/** Mono's print vignette factor at a point. */
export const monoVignette = (x: number, y: number, W: number, H: number) => falloff(Math.hypot(x - W / 2, y - H / 2) / Math.hypot(W / 2, H / 2));

/** The darkest vignette factor over a rectangle (at its corner farthest from the centre). */
export function monoVignetteOver(rect: { x: number; y: number; w: number; h: number }, W: number, H: number) {
  const x = Math.abs(rect.x - W / 2) > Math.abs(rect.x + rect.w - W / 2) ? rect.x : rect.x + rect.w;
  const y = Math.abs(rect.y - H / 2) > Math.abs(rect.y + rect.h - H / 2) ? rect.y : rect.y + rect.h;
  return monoVignette(x, y, W, H);
}

function toSrgb(l: number) {
  return l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
}
const toLinear = (g: number) => (g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4));

/**
 * Where a relative luminance lands after Mono's finish (fade and vignette
 * factor `v`; grain is zero-mean and left out). The renderer judges contrast
 * in this space, so text meets 4.5:1 in the finished image.
 */
export const monoFinished = (l: number, v: number) => toLinear(Math.max(0, Math.min(1, fade(toSrgb(l)) * v)));

/**
 * Mono finish: neutral greys, a faded-print tone curve, film grain over the
 * whole frame (heaviest in the midtones) and a print vignette.
 */
function finishMono(ctx: Ctx, seed: number) {
  toGreyscale(ctx);
  const W = ctx.canvas.width, H = ctx.canvas.height;
  // Grain clumps scale with the canvas so a preview and its export look alike.
  const cell = Math.max(1, Math.round(Math.min(W, H) / 1100));
  const cols = Math.ceil(W / cell) + 1;
  const rand = mulberry32(seed ^ 0x6a1);
  const noiseRow = new Float32Array(cols);
  const cx = W / 2, cy = H / 2, half = Math.hypot(cx, cy);
  const band = Math.max(cell, Math.floor(4_000_000 / W / cell) * cell);
  for (let y0 = 0; y0 < H; y0 += band) {
    const bh = Math.min(band, H - y0);
    const img = ctx.getImageData(0, y0, W, bh);
    const d = img.data;
    for (let y = 0; y < bh; y++) {
      const gy = y0 + y;
      const dy2 = ((gy - cy) / half) ** 2;
      if (gy % cell === 0) for (let i = 0; i < cols; i++) noiseRow[i] = rand() + rand() - 1; // triangular −1..1
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const dx = (x - cx) / half;
        let g = fade(d[i] / 255) * falloff(Math.sqrt(dx * dx + dy2));
        // Grain everywhere, heaviest in the midtones.
        g += noiseRow[(x / cell) | 0] * (0.03 + 0.1 * g * (1 - g));
        const v = Math.max(0, Math.min(255, Math.round(g * 255)));
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    }
    ctx.putImageData(img, 0, y0);
  }
}

/**
 * Pure finish: two tones only. Solid areas (and type) snap to black or white;
 * everything in between is Atkinson-dithered, which drops a quarter of the
 * error for the punchy look of early 1-bit print. Snapped and edge pixels
 * neither give nor take error, so dither never speckles into type.
 */
function finishPure(ctx: Ctx) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const lum = new Float32Array(W * H);
  for (let p = 0, i = 0; p < lum.length; p++, i += 4) lum[p] = greyValue(d[i], d[i + 1], d[i + 2]);
  const err = new Float32Array(W * H);
  const LO = 0.18, HI = 0.82;
  const solid = (q: number) => lum[q] <= LO || lum[q] >= HI;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const g = lum[p];
      let out: number;
      // Edge pixels (anti-aliasing next to a solid pixel) are thresholded,
      // so type and rules keep clean outlines; only open midtones dither.
      const edge = (x > 0 && solid(p - 1)) || (x + 1 < W && solid(p + 1)) || (y > 0 && solid(p - W)) || (y + 1 < H && solid(p + W));
      if (g <= LO || g >= HI) out = g >= HI ? 1 : 0;
      else if (edge) out = g >= 0.5 ? 1 : 0;
      else {
        const v = g + err[p];
        out = v >= 0.5 ? 1 : 0;
        const e = (v - out) / 8;
        if (x + 1 < W) err[p + 1] += e;
        if (x + 2 < W) err[p + 2] += e;
        if (y + 1 < H) {
          if (x > 0) err[p + W - 1] += e;
          err[p + W] += e;
          if (x + 1 < W) err[p + W + 1] += e;
        }
        if (y + 2 < H) err[p + 2 * W] += e;
      }
      const i = p * 4;
      d[i] = d[i + 1] = d[i + 2] = out * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function finishTone(ctx: Ctx, tone: Tone, seed = 1963) {
  if (tone === "mono") finishMono(ctx, seed);
  else if (tone === "pure") finishPure(ctx);
}
