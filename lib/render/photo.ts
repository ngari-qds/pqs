/**
 * Photo placement. Photos are only ever scaled down: the renderer records an
 * `upscaled` violation (QA fails) if the source is smaller than the target.
 * Large reductions are done in successive halving steps for clean results.
 */
import type { Ctx, Drawable, Rect, RenderEnv } from "./types";

export interface PhotoInput {
  image: Drawable;
  /** Focal point 0..1 for cover cropping (defaults to centre). */
  focusX?: number;
  focusY?: number;
  credit?: { name: string; url?: string; source: string };
}

export interface PhotoDrawResult {
  /** Source pixels per output pixel (> 1 means downscaled, < 1 means upscaled). */
  scale: number;
  upscaled: boolean;
}

export function drawPhotoCover(ctx: Ctx, env: RenderEnv, photo: PhotoInput, dest: Rect): PhotoDrawResult {
  const iw = photo.image.width, ih = photo.image.height;
  const factor = Math.max(dest.w / iw, dest.h / ih); // output px per source px
  const upscaled = factor > 1.0001;
  // Crop rect in source space.
  const sw = dest.w / factor, sh = dest.h / factor;
  const fx = photo.focusX ?? 0.5, fy = photo.focusY ?? 0.5;
  const sx = Math.max(0, Math.min(iw - sw, iw * fx - sw / 2));
  const sy = Math.max(0, Math.min(ih - sh, ih * fy - sh / 2));

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  let src: Drawable = photo.image;
  let cx = sx, cy = sy, cw = sw, ch = sh;
  // Successive halving while the remaining reduction exceeds 2x.
  while (cw / dest.w > 2 && ch / dest.h > 2) {
    const nw = Math.ceil(cw / 2), nh = Math.ceil(ch / 2);
    const tmp = env.createCanvas(nw, nh);
    const t = tmp.getContext("2d")!;
    t.imageSmoothingEnabled = true;
    t.imageSmoothingQuality = "high";
    t.drawImage(src as CanvasImageSource, cx, cy, cw, ch, 0, 0, nw, nh);
    src = tmp;
    cx = 0;
    cy = 0;
    cw = nw;
    ch = nh;
  }
  ctx.drawImage(src as CanvasImageSource, cx, cy, cw, ch, dest.x, dest.y, dest.w, dest.h);
  ctx.restore();
  return { scale: 1 / factor, upscaled };
}

/** In-place grayscale + tint toward a colour (used for "grayscale photo with tint"). */
export function monoTint(ctx: Ctx, rect: Rect, dark: [number, number, number], light: [number, number, number], amount = 1) {
  const x = Math.round(rect.x), y = Math.round(rect.y), w = Math.round(rect.w), h = Math.round(rect.h);
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    const r = dark[0] + (light[0] - dark[0]) * l, g = dark[1] + (light[1] - dark[1]) * l, b = dark[2] + (light[2] - dark[2]) * l;
    d[i] = d[i] * (1 - amount) + r * amount;
    d[i + 1] = d[i + 1] * (1 - amount) + g * amount;
    d[i + 2] = d[i + 2] * (1 - amount) + b * amount;
  }
  ctx.putImageData(img, x, y);
}
