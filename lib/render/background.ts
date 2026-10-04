import { hexToRgb } from "./color";
import type { Palette } from "./palettes";
import { compositeAlpha, fillLinearGradient, fillPaper, smoothstep } from "./pixels";
import { drawPhotoCover, monoTint, type PhotoInput } from "./photo";
import type { BackgroundConfig } from "./template";
import type { Ctx, RenderEnv } from "./types";

export interface BackgroundResult {
  /** The config actually drawn (photo kinds fall back to generated ones offline). */
  drawn: BackgroundConfig;
  isPhoto: boolean;
  upscaled: boolean;
  photoScale?: number;
}

/** Fallback when a photo template has no photo (offline / API failure). */
const OFFLINE_FALLBACK: BackgroundConfig = { kind: "gradient", angle: 12 };

export function drawBackground(
  ctx: Ctx,
  env: RenderEnv,
  W: number,
  H: number,
  bg: BackgroundConfig,
  palette: Palette,
  photo: PhotoInput | undefined,
  seed: number,
): BackgroundResult {
  const full = { x: 0, y: 0, w: W, h: H };
  if (bg.kind.startsWith("photo") && !photo) bg = OFFLINE_FALLBACK;

  switch (bg.kind) {
    case "solid":
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);
      return { drawn: bg, isPhoto: false, upscaled: false };
    case "gradient":
      fillLinearGradient(ctx, full, [{ at: 0, color: palette.bg }, { at: 1, color: palette.bg2 }], bg.angle ?? 0);
      return { drawn: bg, isPhoto: false, upscaled: false };
    case "paper":
      fillPaper(ctx, full, palette.bg, seed, bg.strength ?? 1);
      return { drawn: bg, isPhoto: false, upscaled: false };
    case "vignette": {
      const s = bg.strength ?? 0.45;
      const cx = W / 2, cy = H / 2, R = Math.hypot(W, H) / 2;
      compositeAlpha(ctx, full, "#000000", (x, y) => s * smoothstep(0.35, 1.05, Math.hypot(x - cx, y - cy) / R), palette.bg);
      return { drawn: bg, isPhoto: false, upscaled: false };
    }
    case "photo-scrim": {
      const r = drawPhotoCover(ctx, env, photo!, full);
      const s = bg.strength ?? 0.62;
      const side = bg.scrim ?? "bottom";
      compositeAlpha(ctx, full, "#000000", (x, y) => {
        switch (side) {
          case "bottom":
            return s * smoothstep(0.25, 1.0, y / H);
          case "top":
            return s * smoothstep(0.75, 0.0, y / H);
          case "left":
            return s * smoothstep(0.8, 0.0, x / W);
          default:
            return s * 0.75;
        }
      });
      return { drawn: bg, isPhoto: true, upscaled: r.upscaled, photoScale: r.scale };
    }
    case "photo-mono-tint": {
      const r = drawPhotoCover(ctx, env, photo!, full);
      const dark = hexToRgb(palette.dark ? palette.bg : palette.ink);
      const light = hexToRgb(palette.dark ? palette.muted : palette.bg);
      monoTint(ctx, full, dark, light, bg.strength ?? 0.92);
      return { drawn: bg, isPhoto: true, upscaled: r.upscaled, photoScale: r.scale };
    }
  }
}
