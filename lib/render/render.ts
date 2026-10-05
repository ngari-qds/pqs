/**
 * The one render function. Preview and export both call it; only the canvas
 * size differs. Layout decisions are resolution-independent, so the preview
 * is an exact miniature of the export.
 */
import { drawBackground } from "./background";
import { contrastFromLuminance, luminance } from "./color";
import type { Composition, LayoutContext } from "./compose";
import { Measurer, fontString } from "./env";
import { FORMATS, composeFormat, layoutArea, resolveLayout } from "./formats";
import { rule } from "./draw";
import { getPairing } from "./pairings";
import { getPalette, type Palette } from "./palettes";
import type { PhotoInput } from "./photo";
import { compositeAlpha, lumaStats, smoothstep, type LumaStats } from "./pixels";
import { chooseSignatureInk, layoutSignature } from "./signature";
import { drawBlock, fitStack, placeStack, type PlacedBlock } from "./stack";
import type { QuoteContent, SignatureStyle, TemplateConfig } from "./template";
import { inside, intersects, type Ctx, type FaceRef, type Rect, type RenderEnv } from "./types";

export interface RenderInput {
  content: QuoteContent;
  template: TemplateConfig;
  signature: { enabled: boolean; style: SignatureStyle };
  photo?: PhotoInput;
  /** Tiny "Photo: Name / Unsplash" line in the bottom margin. */
  showCredit?: boolean;
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
  /** An auto-sized block that could only fit at (or near) its minimum size. */
  atMin?: boolean;
}

export interface RenderReport {
  width: number;
  height: number;
  safe: Rect;
  blocks: BlockReport[];
  decorations: Rect[];
  signature?: { rect: Rect; color: string; alpha: number; contrast: number };
  credit?: { rect: Rect; text: string };
  overflow: boolean;
  collisions: string[];
  upscaled: boolean;
  photoUsed: boolean;
  photoScale?: number;
  background: string;
  /** Set when the design had to adapt to fit long text. */
  fallback?: string;
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
  return composeFormat(lc, content);
}

function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) };
}

/**
 * Photo credit: a small line right-aligned in the bottom margin, outside the
 * safe area where quote text and the signature live, so it can never collide.
 */
function drawCredit(
  ctx: Ctx, env: RenderEnv, m: Measurer, credit: { name: string; source: string },
  W: number, H: number, safe: Rect, face: FaceRef, palette: Palette, sigSize: number,
) {
  const size = Math.max(sigSize * 0.62, Math.min(W, H) * 0.0105);
  const text = `Photo: ${credit.name} / ${credit.source}`;
  const tracking = 0.02;
  const w = m.width(face, text, tracking) * size;
  const met = m.metrics(face);
  const marginTop = safe.y + safe.h;
  const base = marginTop + (H - marginTop) / 2 + (met.capHeight * size) / 2;
  const rect = { x: safe.x + safe.w - w, y: base - met.capHeight * size, w, h: (met.capHeight + met.descent) * size };
  const ink = chooseSignatureInk(ctx, rect, palette, size * 0.4);
  ctx.save();
  ctx.font = fontString(env, face, size);
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${(tracking * size).toFixed(3)}px`;
  ctx.fillStyle = ink.color;
  ctx.globalAlpha = Math.min(0.85, ink.alpha);
  ctx.fillText(text, rect.x, base);
  ctx.restore();
  return { rect, text };
}

/**
 * Darkens (or lightens) a full-width horizontal band behind `region` with a
 * tall, soft fade above and below, a step at a time, until `measure` reaches
 * 4.5:1 (at most 8 steps). A full-width band reads as part of the photo's
 * scrim rather than a box behind the text. Dark ink gets a light band.
 */
function strengthenScrim(ctx: Ctx, region: Rect, ink: string, feather: number, measure: (st: LumaStats) => number) {
  const W = ctx.canvas.width;
  const scrimColor = luminance(ink) < 0.4 ? "#f4f1ea" : "#000000";
  const outer = { x: 0, y: region.y - feather, w: W, h: region.h + feather * 2 };
  let st = lumaStats(ctx, region);
  let c = measure(st);
  for (let k = 0; k < 8 && c < MIN_CONTRAST; k++) {
    compositeAlpha(ctx, outer, scrimColor, (_x, y) => {
      const dy = Math.max(region.y - y, 0, y - (region.y + region.h));
      return 0.16 * (1 - smoothstep(0, feather, dy));
    });
    st = lumaStats(ctx, region);
    c = measure(st);
  }
  return { st, c };
}

const textContrast = (color: string, st: { p02: number; p98: number }) => {
  const L = luminance(color);
  return Math.min(contrastFromLuminance(L, st.p02), contrastFromLuminance(L, st.p98));
};

/**
 * Renders a quote. If the text cannot fit at the minimum readable size, the
 * design adapts instead of shrinking further: split/framed photos give up
 * space in steps, then the format's most compact layout is used. The report
 * says which fallback was applied.
 */
export function renderQuote(ctx: Ctx, env: RenderEnv, input: RenderInput): RenderReport {
  let r = renderOnce(ctx, env, input);
  if (!r.overflow) return r;
  const bg = input.template.background;
  if (bg.kind === "photo-split" || bg.kind === "photo-frame") {
    for (const ratio of [0.36, 0.26]) {
      const t = { ...input.template, background: { ...bg, ratio } };
      r = renderOnce(ctx, env, { ...input, template: t });
      if (!r.overflow) return { ...r, fallback: `photo reduced to ${Math.round(ratio * 100)}%` };
    }
  }
  const compact = FORMATS[input.content.format]?.layouts[0]?.id;
  if (compact && resolveLayout(input.content.format, input.template.layout) !== compact) {
    const t = { ...input.template, layout: compact };
    const r2 = renderOnce(ctx, env, { ...input, template: t });
    if (!r2.overflow) return { ...r2, fallback: `layout changed to ${compact}` };
  }
  if (bg.kind === "photo-split" || bg.kind === "photo-frame") {
    // Last resort: the photo moves behind the text (blurred), freeing the whole canvas.
    const t = { ...input.template, background: { kind: "photo-blur" as const } };
    const r3 = renderOnce(ctx, env, { ...input, template: t });
    if (!r3.overflow) return { ...r3, fallback: "photo moved behind the text" };
  }
  return r;
}

function renderOnce(ctx: Ctx, env: RenderEnv, input: RenderInput): RenderReport {
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

  const safe = safeArea(W, H);
  const bg = drawBackground(ctx, env, W, H, template.background, palette, input.photo, seed, template.layout, safe);

  // Split and frame backgrounds keep text (and the signature) on the solid
  // panel, so one ink colour always reads against a uniform background.
  let area = bg.textArea ? intersect(safe, bg.textArea) : safe;
  const confined = layoutArea(input.content.format, template.layout, W, H);
  if (confined) area = intersect(area, confined);
  // In a narrow column the chosen signature may not fit: step down to the
  // stacked style, then the monogram, so it always stays inside the safe area.
  let sig = input.signature.enabled ? layoutSignature(input.signature.style, W, H, area, env, m, pairing) : null;
  for (const style of ["stacked", "monogram"] as const)
    if (sig && sig.rect.w > area.w + 0.5 && input.signature.style !== style) sig = layoutSignature(style, W, H, area, env, m, pairing);
  const r = sig?.reserve ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const box: Rect = { x: area.x + r.left, y: area.y + r.top, w: area.w - r.left - r.right, h: area.h - r.top - r.bottom };

  const onPhoto = bg.textOnPhoto;
  const lc: LayoutContext = {
    W, H, ref: Math.min(W, H * 1.1), safe, box, palette, pairing, template, env, m, isPhoto: onPhoto,
    ink: onPhoto ? "#f6f3ee" : palette.ink,
    muted: onPhoto ? "#e4ded4" : palette.muted,
    accent: onPhoto ? "#f1e4c8" : palette.accent,
  };
  const comp = compose(lc, input.content);

  let overflow = false;
  const inners = comp.stacks.map((st) => ({ ...st.box, y: st.box.y + (st.padTop ?? 0), h: st.box.h - (st.padTop ?? 0) - (st.padBottom ?? 0) }));
  let fitted = comp.stacks.map((st, i) => fitStack(m, st.specs, inners[i], lc.ref));
  // Grouped stacks share the smallest fitted scale, so paired panels match.
  const groups = new Map<string, number>();
  comp.stacks.forEach((st, i) => st.group && groups.set(st.group, Math.min(groups.get(st.group) ?? Infinity, fitted[i].k)));
  fitted = fitted.map((f, i) => {
    const g = comp.stacks[i].group;
    return g && f.k > groups.get(g)! + 1e-6 ? fitStack(m, comp.stacks[i].specs, inners[i], lc.ref, groups.get(g)!) : f;
  });
  const placed: PlacedBlock[][] = fitted.map((f, i) => {
    if (!f.fits) overflow = true;
    return placeStack(f, inners[i], comp.stacks[i].valign, comp.stacks[i].hAlign);
  });

  comp.prepaint?.(ctx, placed);

  // Contrast enforcement: sample the real pixels under every block.
  const blocks: BlockReport[] = [];
  for (const b of placed.flat()) {
    // Sample just around the ink, but never beyond the text area: for very
    // large type the padding would otherwise reach pixels the text never
    // touches (e.g. the photo beside a split layout).
    const pad = Math.min(b.size * 0.25, lc.ref * 0.03);
    const region = intersect({ x: b.rect.x - pad, y: b.rect.y - pad, w: b.rect.w + pad * 2, h: b.rect.h + pad * 2 }, { x: area.x - pad, y: area.y - pad, w: area.w + pad * 2, h: area.h + pad * 2 });
    let color = b.spec.color;
    let st = lumaStats(ctx, region);
    let c = textContrast(color, st);
    let fix: BlockReport["fix"];
    if (c < MIN_CONTRAST && onPhoto) {
      ({ st, c } = strengthenScrim(ctx, region, color, Math.max(b.size * 3, H * 0.08), (s2) => textContrast(color, s2)));
      fix = "scrim";
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
    const atMin = "ratio" in b.spec.size ? b.size <= b.spec.size.min * 1.08 : undefined;
    blocks.push({ id: b.spec.id, rect: b.rect, size: b.size, color, contrast: c, fix, atMin });
    drawBlock(ctx, env, m, b, color);
  }

  const decorations = comp.decorate?.(ctx, placed) ?? [];
  // Rules requested by blocks, centred in the gap above them.
  for (const stack of placed)
    stack.forEach((b, i) => {
      const r = b.spec.ruleAbove;
      if (!r || i === 0) return;
      const prev = stack[i - 1];
      const y = (prev.y + prev.h + b.y) / 2;
      const w = b.colW * (r.width ?? 1);
      const x = b.spec.align === "center" ? b.x + (b.colW - w) / 2 : b.spec.align === "right" ? b.x + b.colW - w : b.x;
      decorations.push(rule(ctx, x, y, w, r.thickness, r.color, r.alpha ?? 0.35));
    });

  let signature: RenderReport["signature"];
  if (sig) {
    let ink = chooseSignatureInk(ctx, sig.rect, palette, sig.size * 0.4);
    if (ink.contrast < MIN_CONTRAST && bg.photoUsed) {
      // Busy photo under the signature: soften it locally, then re-pick the ink.
      const pad = sig.size * 0.6;
      const region = { x: sig.rect.x - pad, y: sig.rect.y - pad, w: sig.rect.w + pad * 2, h: sig.rect.h + pad * 2 };
      const chosen = ink.color;
      strengthenScrim(ctx, region, chosen, Math.max(sig.size * 4, H * 0.06), () => chooseSignatureInk(ctx, sig.rect, palette, sig.size * 0.4).contrast);
      ink = chooseSignatureInk(ctx, sig.rect, palette, sig.size * 0.4);
    }
    sig.draw(ctx, ink.color, ink.alpha);
    signature = { rect: sig.rect, ...ink };
  }

  let credit: RenderReport["credit"];
  if (input.showCredit && bg.photoUsed && input.photo?.credit) {
    credit = drawCredit(ctx, env, m, input.photo.credit, W, H, safe, pairing.label, palette, sig?.size ?? H * 0.018);
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
  if (credit) {
    if (signature && intersects(credit.rect, signature.rect)) collisions.push("credit overlaps signature");
    for (const b of blocks) if (intersects(credit.rect, b.rect)) collisions.push(`credit overlaps ${b.id}`);
  }

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    width: W, height: H, safe, blocks, decorations, signature, credit, overflow, collisions,
    upscaled: bg.upscaled, photoUsed: bg.photoUsed, photoScale: bg.photoScale, background: bg.drawn.kind, ms: t1 - t0,
  };
}
