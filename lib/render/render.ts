/**
 * The one render function. Preview and export both call it; only the canvas
 * size differs. Layout decisions are resolution-independent, so the preview
 * is an exact miniature of the export.
 */
import { drawBackground } from "./background";
import { contrastFromLuminance, luminance } from "./color";
import type { Composition, LayoutContext } from "./compose";
import { Measurer } from "./env";
import { composeClassic } from "./formats/classic";
import { getPairing } from "./pairings";
import { getPalette } from "./palettes";
import type { PhotoInput } from "./photo";
import { compositeAlpha, lumaStats, smoothstep } from "./pixels";
import { chooseSignatureInk, layoutSignature } from "./signature";
import { drawBlock, fitStack, placeStack, type PlacedBlock } from "./stack";
import type { QuoteContent, SignatureStyle, TemplateConfig } from "./template";
import { inside, intersects, type Ctx, type Rect, type RenderEnv } from "./types";

export interface RenderInput {
  content: QuoteContent;
  template: TemplateConfig;
  signature: { enabled: boolean; style: SignatureStyle };
  photo?: PhotoInput;
  seed?: number;
}

export interface BlockReport {
  id: string;
  rect: Rect;
  size: number;
  color: string;
  contrast: number;
  /** How the contrast rule was satisfied, if it needed help. */
  fix?: "scrim" | "recolor";
}

export interface RenderReport {
  width: number;
  height: number;
  safe: Rect;
  blocks: BlockReport[];
  decorations: Rect[];
  signature?: { rect: Rect; color: string; alpha: number; contrast: number };
  overflow: boolean;
  collisions: string[];
  upscaled: boolean;
  photoScale?: number;
  background: string;
  ms: number;
}

const measurers = new WeakMap<RenderEnv, Measurer>();
export function measurerFor(env: RenderEnv) {
  let m = measurers.get(env);
  if (!m) measurers.set(env, (m = new Measurer(env)));
  return m;
}

export const MIN_CONTRAST = 4.5;

/** Safe area: at least 7% padding on every side. */
export function safeArea(W: number, H: number): Rect {
  const min = Math.min(W, H);
  const px = Math.max(W * 0.07, min * 0.085);
  const py = Math.max(H * 0.07, min * 0.085);
  return { x: px, y: py, w: W - px * 2, h: H - py * 2 };
}

function compose(lc: LayoutContext, content: QuoteContent): Composition {
  switch (content.format) {
    case "classic":
      return composeClassic(lc, content);
  }
}

const textContrast = (color: string, st: { p02: number; p98: number }) => {
  const L = luminance(color);
  return Math.min(contrastFromLuminance(L, st.p02), contrastFromLuminance(L, st.p98));
};

export function renderQuote(ctx: Ctx, env: RenderEnv, input: RenderInput): RenderReport {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const m = measurerFor(env);
  const { template } = input;
  const palette = getPalette(template.palette);
  const pairing = getPairing(template.pairing);
  const seed = input.seed ?? 1963;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const bg = drawBackground(ctx, env, W, H, template.background, palette, input.photo, seed);
  const safe = safeArea(W, H);

  const sig = input.signature.enabled ? layoutSignature(input.signature.style, W, H, safe, env, m, pairing) : null;
  const r = sig?.reserve ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const box: Rect = { x: safe.x + r.left, y: safe.y + r.top, w: safe.w - r.left - r.right, h: safe.h - r.top - r.bottom };

  const onPhoto = bg.isPhoto;
  const lc: LayoutContext = {
    W, H, ref: Math.min(W, H * 1.1), safe, box, palette, pairing, template, env, m, isPhoto: onPhoto,
    ink: onPhoto ? "#f6f3ee" : palette.ink,
    muted: onPhoto ? "#e4ded4" : palette.muted,
    accent: onPhoto ? "#f1e4c8" : palette.accent,
  };
  const comp = compose(lc, input.content);

  let overflow = false;
  const placed: PlacedBlock[][] = comp.stacks.map((st) => {
    const inner = { ...st.box, y: st.box.y + (st.padTop ?? 0), h: st.box.h - (st.padTop ?? 0) - (st.padBottom ?? 0) };
    const fitted = fitStack(m, st.specs, inner, lc.ref);
    if (!fitted.fits) overflow = true;
    return placeStack(fitted, inner, st.valign, st.hAlign);
  });

  comp.prepaint?.(ctx, placed);

  // Contrast enforcement: sample the real pixels under every block.
  const blocks: BlockReport[] = [];
  for (const b of placed.flat()) {
    const pad = b.size * 0.25;
    const region = { x: b.rect.x - pad, y: b.rect.y - pad, w: b.rect.w + pad * 2, h: b.rect.h + pad * 2 };
    let color = b.spec.color;
    let st = lumaStats(ctx, region);
    let c = textContrast(color, st);
    let fix: BlockReport["fix"];
    if (c < MIN_CONTRAST && onPhoto) {
      // Strengthen a soft local scrim behind the text until it passes.
      const darkText = luminance(color) < 0.4;
      const scrimColor = darkText ? "#f4f1ea" : "#000000";
      const feather = b.size * 1.6;
      const outer = { x: region.x - feather, y: region.y - feather, w: region.w + feather * 2, h: region.h + feather * 2 };
      for (let k = 0; k < 8 && c < MIN_CONTRAST; k++) {
        const strength = 0.18;
        compositeAlpha(ctx, outer, scrimColor, (x, y) => {
          const dx = Math.max(region.x - x, 0, x - (region.x + region.w));
          const dy = Math.max(region.y - y, 0, y - (region.y + region.h));
          return strength * (1 - smoothstep(0, feather, Math.hypot(dx, dy)));
        });
        st = lumaStats(ctx, region);
        c = textContrast(color, st);
        fix = "scrim";
      }
    }
    if (c < MIN_CONTRAST) {
      const candidates = [palette.ink, palette.bg, "#111111", "#f6f3ee", "#000000", "#ffffff"];
      const best = candidates.reduce((a, x) => (textContrast(x, st) > textContrast(a, st) ? x : a), color);
      if (best !== color) {
        color = best;
        c = textContrast(color, st);
        fix = fix ?? "recolor";
      }
    }
    blocks.push({ id: b.spec.id, rect: b.rect, size: b.size, color, contrast: c, fix });
    drawBlock(ctx, env, m, b, color);
  }

  const decorations = comp.decorate?.(ctx, placed) ?? [];

  let signature: RenderReport["signature"];
  if (sig) {
    const ink = chooseSignatureInk(ctx, sig.rect, palette, sig.size * 0.4);
    sig.draw(ctx, ink.color, ink.alpha);
    signature = { rect: sig.rect, ...ink };
  }
  ctx.restore();

  // Geometry checks used by the QA script.
  const collisions: string[] = [];
  for (const b of blocks) {
    if (!inside(b.rect, safe)) collisions.push(`${b.id} leaves the safe area`);
    if (signature && intersects(b.rect, signature.rect)) collisions.push(`${b.id} overlaps signature`);
  }
  for (const d of decorations) if (signature && intersects(d, signature.rect)) collisions.push(`decoration overlaps signature`);
  if (signature && !inside(signature.rect, safe, 1)) collisions.push("signature leaves the safe area");

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    width: W, height: H, safe, blocks, decorations, signature, overflow, collisions,
    upscaled: bg.upscaled, photoScale: bg.photoScale, background: bg.drawn.kind, ms: t1 - t0,
  };
}
