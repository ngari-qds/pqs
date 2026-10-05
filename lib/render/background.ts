import { hexToRgb, luminance } from "./color";
import { hairline } from "./draw";
import type { Palette } from "./palettes";
import { compositeAlpha, fillLinearGradient, fillPaper, smoothstep } from "./pixels";
import { drawBlurredPhoto, drawPhotoCover, mapLuminance, type PhotoDrawResult, type PhotoInput } from "./photo";
import type { BackgroundConfig, LayoutId } from "./template";
import type { Ctx, Rect, RenderEnv } from "./types";

export interface BackgroundResult {
  /** The config actually drawn (photo kinds fall back to generated ones offline). */
  drawn: BackgroundConfig;
  /** Text will sit on photographic pixels (affects colours and contrast fixes). */
  textOnPhoto: boolean;
  photoUsed: boolean;
  upscaled: boolean;
  photoScale?: number;
  /** Restricts where text may go (split and frame keep text off the photo). */
  textArea?: Rect;
  photoRect?: Rect;
}

/** Fallback when a photo template has no photo (offline / API failure). */
export const OFFLINE_FALLBACK: BackgroundConfig = { kind: "gradient", angle: 12 };

/** Scrim direction that matches where a layout puts its text. */
export function scrimFor(layout: LayoutId): "bottom" | "top" | "left" | "full" {
  switch (layout) {
    case "bottom":
    case "corner":
      return "bottom";
    case "top":
      return "top";
    case "editorial":
      return "left";
    default:
      return "full";
  }
}

const rgb = (hex: string) => hexToRgb(hex);

export function drawBackground(
  ctx: Ctx,
  env: RenderEnv,
  W: number,
  H: number,
  bg: BackgroundConfig,
  palette: Palette,
  photo: PhotoInput | undefined,
  seed: number,
  layout: LayoutId,
  safe: Rect,
): BackgroundResult {
  const full = { x: 0, y: 0, w: W, h: H };
  if (bg.kind.startsWith("photo") && !photo) bg = OFFLINE_FALLBACK;
  const generated = (): BackgroundResult => ({ drawn: bg, textOnPhoto: false, photoUsed: false, upscaled: false });
  const photoResult = (r: PhotoDrawResult, extra: Partial<BackgroundResult> = {}): BackgroundResult => ({
    drawn: bg, textOnPhoto: true, photoUsed: true, upscaled: r.upscaled, photoScale: r.scale, ...extra,
  });
  // Dark and light ends of the palette, whichever way round it is.
  const darkHex = palette.dark ? palette.bg : palette.ink;
  const lightHex = palette.dark ? palette.ink : palette.bg;

  switch (bg.kind) {
    case "solid":
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);
      return generated();
    case "gradient":
      fillLinearGradient(ctx, full, [{ at: 0, color: palette.bg }, { at: 1, color: palette.bg2 }], bg.angle ?? 0);
      return generated();
    case "paper":
      fillPaper(ctx, full, palette.bg, seed, bg.strength ?? 1);
      return generated();
    case "vignette": {
      const s = bg.strength ?? 0.45;
      const cx = W / 2, cy = H / 2, R = Math.hypot(W, H) / 2;
      compositeAlpha(ctx, full, "#000000", (x, y) => s * smoothstep(0.35, 1.05, Math.hypot(x - cx, y - cy) / R), palette.bg);
      return generated();
    }
    case "photo-scrim": {
      const r = drawPhotoCover(ctx, env, photo!, full);
      const s = bg.strength ?? 0.62;
      const side = !bg.scrim || bg.scrim === "auto" ? scrimFor(layout) : bg.scrim;
      compositeAlpha(ctx, full, "#000000", (x, y) => {
        switch (side) {
          case "bottom":
            return s * smoothstep(0.3, 1.0, y / H);
          case "top":
            return s * smoothstep(0.7, 0.0, y / H);
          case "left":
            return s * smoothstep(0.85, 0.0, x / W) * 0.9 + s * 0.12;
          default:
            return s * 0.72;
        }
      });
      return photoResult(r);
    }
    case "photo-mono-tint": {
      // Grayscale, then a gentle tint toward the palette's dark tone.
      const r = drawPhotoCover(ctx, env, photo!, full);
      mapLuminance(ctx, full, [10, 10, 10], [245, 245, 245], 1, 1.05);
      compositeAlpha(ctx, full, darkHex, () => bg.strength ?? 0.38);
      return photoResult(r);
    }
    case "photo-duotone": {
      const r = drawPhotoCover(ctx, env, photo!, full);
      const lightEnd = luminance(palette.accent) > luminance(darkHex) + 0.2 ? palette.accent : lightHex;
      mapLuminance(ctx, full, rgb(darkHex), rgb(lightEnd), 1, 1.1);
      // Keep it restrained: pull the light end down so text still reads.
      compositeAlpha(ctx, full, darkHex, () => 0.32);
      return photoResult(r);
    }
    case "photo-blur": {
      const r = drawBlurredPhoto(ctx, env, photo!, full, bg.radius ?? 0.03);
      compositeAlpha(ctx, full, "#000000", () => 0.3);
      return photoResult(r);
    }
    case "photo-split": {
      // Photo on one side, solid palette colour where the text goes.
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);
      // Tall canvases stack photo over text; square and wide ones go side by side.
      const portrait = H / W > 1.15;
      const ratio = bg.ratio ?? (portrait ? 0.5 : 0.42);
      const photoRect = portrait ? { x: 0, y: 0, w: W, h: Math.round(H * ratio) } : { x: 0, y: 0, w: Math.round(W * ratio), h: H };
      const r = drawPhotoCover(ctx, env, photo!, photoRect);
      const gap = Math.min(W, H) * 0.07;
      const textArea = portrait
        ? { x: 0, y: photoRect.h + gap, w: W, h: H - photoRect.h - gap }
        : { x: photoRect.w + gap, y: 0, w: W - photoRect.w - gap, h: H };
      return photoResult(r, { textOnPhoto: false, textArea, photoRect });
    }
    case "photo-frame": {
      // Photo set inside a frame on the page colour, text beneath (or beside).
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);
      const portrait = H >= W * 1.05;
      const ratio = bg.ratio ?? (portrait ? 0.5 : 0.45);
      const photoRect = portrait
        ? { x: safe.x, y: safe.y, w: safe.w, h: Math.round(safe.h * ratio) }
        : { x: safe.x, y: safe.y, w: Math.round(safe.w * ratio), h: safe.h };
      const r = drawPhotoCover(ctx, env, photo!, photoRect);
      const th = hairline(Math.min(W, H));
      ctx.save();
      ctx.strokeStyle = palette.ink;
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = th;
      const o = th % 2 ? 0.5 : 0;
      ctx.strokeRect(Math.round(photoRect.x) + o, Math.round(photoRect.y) + o, Math.round(photoRect.w) - th, Math.round(photoRect.h) - th);
      ctx.restore();
      const gap = Math.min(W, H) * 0.07;
      const textArea = portrait
        ? { x: 0, y: photoRect.y + photoRect.h + gap, w: W, h: H - (photoRect.y + photoRect.h + gap) }
        : { x: photoRect.x + photoRect.w + gap, y: 0, w: W - (photoRect.x + photoRect.w + gap), h: H };
      // Photo dimensions must still not be upscaled relative to the frame.
      return photoResult(r, { textOnPhoto: false, textArea, photoRect });
    }
  }
}
