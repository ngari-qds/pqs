/**
 * Photo placement. Photos are only ever scaled down: the renderer records an
 * `upscaled` violation (QA fails) if the source is smaller than the target.
 * Large reductions are done in successive halving steps for clean results.
 */
import { ditherTable } from "./random";
import type { Ctx, Drawable, Rect, RenderEnv } from "./types";

export interface PhotoInput {
  image: Drawable;
  /** Focal point 0..1 for cover cropping (defaults to centre). */
  focusX?: number;
  focusY?: number;
  credit?: { name: string; source: string };
}

export interface PhotoDrawResult {
  /** Source pixels per output pixel (> 1 means downscaled, < 1 means upscaled). */
  scale: number;
  upscaled: boolean;
}

/** Source crop for covering `dest` with `img`. */
function coverCrop(photo: PhotoInput, dest: { w: number; h: number }) {
  const iw = photo.image.width, ih = photo.image.height;
  const factor = Math.max(dest.w / iw, dest.h / ih); // output px per source px
  const sw = dest.w / factor, sh = dest.h / factor;
  const fx = photo.focusX ?? 0.5, fy = photo.focusY ?? 0.5;
  return {
    factor,
    sx: Math.max(0, Math.min(iw - sw, iw * fx - sw / 2)),
    sy: Math.max(0, Math.min(ih - sh, ih * fy - sh / 2)),
    sw,
    sh,
  };
}

export function drawPhotoCover(ctx: Ctx, env: RenderEnv, photo: PhotoInput, dest: Rect): PhotoDrawResult {
  const { factor, sx, sy, sw, sh } = coverCrop(photo, dest);
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
  return { scale: 1 / factor, upscaled: factor > 1.0001 };
}

/** In-place luminance mapping between two colours (grayscale tint / duotone). */
export function mapLuminance(ctx: Ctx, rect: Rect, dark: [number, number, number], light: [number, number, number], amount = 1, contrast = 1) {
  const x = Math.round(rect.x), y = Math.round(rect.y), w = Math.round(rect.w), h = Math.round(rect.h);
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    if (contrast !== 1) l = Math.max(0, Math.min(1, (l - 0.5) * contrast + 0.5));
    const r = dark[0] + (light[0] - dark[0]) * l, g = dark[1] + (light[1] - dark[1]) * l, b = dark[2] + (light[2] - dark[2]) * l;
    d[i] = d[i] * (1 - amount) + r * amount;
    d[i + 1] = d[i + 1] * (1 - amount) + g * amount;
    d[i + 2] = d[i + 2] * (1 - amount) + b * amount;
  }
  ctx.putImageData(img, x, y);
}

/** Three-pass box blur on RGBA (approximates a Gaussian). */
function boxBlur(d: Uint8ClampedArray, w: number, h: number, r: number) {
  const tmp = new Float32Array(w * h * 4);
  const pass = (src: ArrayLike<number>, dst: Float32Array | Uint8ClampedArray, horizontal: boolean) => {
    const len = horizontal ? w : h, lines = horizontal ? h : w;
    const step = horizontal ? 4 : w * 4;
    for (let line = 0; line < lines; line++) {
      const base = horizontal ? line * w * 4 : line * 4;
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += src[base + Math.max(0, Math.min(len - 1, k)) * step + c];
        for (let i = 0; i < len; i++) {
          dst[base + i * step + c] = acc / (2 * r + 1);
          const out = Math.max(0, i - r), inn = Math.min(len - 1, i + r + 1);
          acc += src[base + inn * step + c] - src[base + out * step + c];
        }
      }
    }
  };
  for (let k = 0; k < 3; k++) {
    pass(d, tmp, true);
    pass(tmp, d, false);
  }
}

const DITHER = ditherTable(0xb1a5, 65536, 1.2);

/**
 * Blurred photo: blur a reduced copy (blur removes all detail, so working at
 * 1/8 size loses nothing), scale it back up, then dither so the smooth result
 * cannot band. The upscale check uses the original photo, not this copy.
 */
export function drawBlurredPhoto(ctx: Ctx, env: RenderEnv, photo: PhotoInput, dest: Rect, radiusFrac = 0.025): PhotoDrawResult {
  const down = 8;
  const sw = Math.max(32, Math.round(dest.w / down)), sh = Math.max(32, Math.round(dest.h / down));
  const small = env.createCanvas(sw, sh);
  const sctx = small.getContext("2d")!;
  const result = drawPhotoCover(sctx, env, photo, { x: 0, y: 0, w: sw, h: sh });
  const img = sctx.getImageData(0, 0, sw, sh);
  boxBlur(img.data, sw, sh, Math.max(1, Math.round(Math.min(sw, sh) * radiusFrac)));
  sctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(small as unknown as CanvasImageSource, dest.x, dest.y, dest.w, dest.h);
  ctx.restore();
  addDither(ctx, dest);
  // Report against the full-size cover requirement.
  const factor = Math.max(dest.w / photo.image.width, dest.h / photo.image.height);
  return { scale: 1 / factor, upscaled: factor > 1.0001 || result.upscaled };
}

export function addDither(ctx: Ctx, rect: Rect) {
  const x = Math.round(rect.x), y = Math.round(rect.y), w = Math.round(rect.w), h = Math.round(rect.h);
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    d[i] += DITHER[n++ & 65535];
    d[i + 1] += DITHER[n++ & 65535];
    d[i + 2] += DITHER[n++ & 65535];
  }
  ctx.putImageData(img, x, y);
}

/**
 * Frosted glass: blurs what is already drawn inside `rect` (via a reduced
 * copy, since blur removes detail anyway), clips it to a rounded panel and
 * lays a light or dark tint over it, then dithers so the smooth fill cannot band.
 */
export function frostedPanel(ctx: Ctx, env: RenderEnv, rect: Rect, tint: string, tintAlpha: number, radius: number) {
  const r = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) };
  const down = 6;
  const sw = Math.max(16, Math.round(r.w / down)), sh = Math.max(16, Math.round(r.h / down));
  const small = env.createCanvas(sw, sh);
  const sctx = small.getContext("2d")!;
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(ctx.canvas as unknown as CanvasImageSource, r.x, r.y, r.w, r.h, 0, 0, sw, sh);
  const img = sctx.getImageData(0, 0, sw, sh);
  boxBlur(img.data, sw, sh, Math.max(2, Math.round(Math.min(sw, sh) * 0.06)));
  sctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(small as unknown as CanvasImageSource, r.x, r.y, r.w, r.h);
  ctx.globalAlpha = tintAlpha;
  ctx.fillStyle = tint;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
  addDither(ctx, r);
}
