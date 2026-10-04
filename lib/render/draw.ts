import type { Ctx } from "./types";

/** Pixel-snapped horizontal rule: integer position and thickness, always crisp. */
export function rule(ctx: Ctx, x: number, y: number, w: number, thickness: number, color: string, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const t = Math.max(1, Math.round(thickness));
  ctx.fillRect(Math.round(x), Math.round(y - t / 2), Math.round(w), t);
  ctx.restore();
  return { x: Math.round(x), y: Math.round(y - t / 2), w: Math.round(w), h: t };
}

export function vrule(ctx: Ctx, x: number, y: number, h: number, thickness: number, color: string, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const t = Math.max(1, Math.round(thickness));
  ctx.fillRect(Math.round(x - t / 2), Math.round(y), t, Math.round(h));
  ctx.restore();
  return { x: Math.round(x - t / 2), y: Math.round(y), w: t, h: Math.round(h) };
}

/** Hairline thickness for a canvas: ~1px at 1080 wide, scales with resolution. */
export const hairline = (ref: number) => Math.max(1, Math.round(ref / 900));
