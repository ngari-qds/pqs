/**
 * Stack layout: a vertical list of text blocks fitted jointly into a box.
 * Auto-sized blocks share one scale factor `k` (so a hook stays proportionally
 * larger than its body), fixed blocks keep their size. Every format is
 * expressed as one or more stacks.
 *
 * Blocks can carry a margin marker (list numerals, "Q.", speaker names, the
 * left-hand side of an equation) and a rule above them.
 */
import { fontString, type Measurer } from "./env";
import { blockHeight, layoutAtSize, type FitParams } from "./typography/autofit";
import type { Line, Token } from "./typography/linebreak";
import { lineHeightFor, MEASURE, trackingFor, type TextRole } from "./typography/metrics";
import { OPENING_PUNCTUATION } from "./typography/smart";
import { tokenize } from "./typography/tokens";
import type { Ctx, FaceRef, Rect, RenderEnv } from "./types";


export type Align = "left" | "center" | "right";
export type EmStyle = "italic" | "color" | "underline" | "marker";

export interface MarkerSpec {
  text: string;
  face: FaceRef;
  color: string;
  /** Marker font size relative to the block's size. */
  sizeEm?: number;
  /** Width of the marker column, in em of the block's size. */
  widthEm: number;
  /** Space between the marker column and the text, in em. */
  gapEm?: number;
  align?: "left" | "right";
  uppercase?: boolean;
  trackingEm?: number;
}

export interface RuleSpec {
  color: string;
  alpha?: number;
  /** Fraction of the column width (1 = full). */
  width?: number;
  /** Thickness in px. */
  thickness: number;
}

export interface BlockSpec {
  id: string;
  role: TextRole;
  text: string;
  face: FaceRef;
  emFace?: FaceRef;
  color: string;
  align: Align;
  /** Fixed size in px, or a share of the jointly-fitted scale. */
  size: { fixed: number } | { ratio: number; min: number; max: number };
  maxLines?: number;
  /** Max column width in px (defaults to the box width). */
  maxWidth?: number;
  gapBefore?: number;
  uppercase?: boolean;
  trackingBase?: number;
  lineHeightFactor?: number;
  balance?: boolean;
  hangPunctuation?: boolean;
  emStyle?: EmStyle;
  emColor?: string;
  opacity?: number;
  /** Override target measure in characters. */
  measure?: [number, number];
  marker?: MarkerSpec;
  /** Drawn in the middle of the gap above this block. */
  ruleAbove?: RuleSpec;
}

export interface PlacedBlock {
  spec: BlockSpec;
  size: number;
  lineHeight: number;
  tracking: number;
  lines: Line[];
  /** Left edge of the column (marker included) and cap-top of the first line. */
  x: number;
  y: number;
  /** Column width, marker column included. */
  colW: number;
  /** Width of the marker column + gap (text starts at x + indent). */
  indent: number;
  /** Trimmed height (cap top → last descender). */
  h: number;
  /** Tight bounds of the ink (marker + widest line), for contrast and collisions. */
  rect: Rect;
  capHeight: number;
  fits: boolean;
}

export interface StackResult {
  blocks: PlacedBlock[];
  height: number;
  fits: boolean;
  /** The shared scale that was fitted (for size groups). */
  k: number;
}

const quant = (v: number) => Math.round(v * 1000) / 1000;

/** Emphasised words switch face only for the italic treatment; others restyle colour/marks. */
export const faceFor = (spec: BlockSpec, em: boolean): FaceRef =>
  em && spec.emFace && (spec.emStyle ?? "italic") === "italic" ? spec.emFace : spec.face;

const markerIndent = (spec: BlockSpec, size: number) => (spec.marker ? (spec.marker.widthEm + (spec.marker.gapEm ?? 0.5)) * size : 0);

function tokensFor(m: Measurer, spec: BlockSpec, tracking: number): Token[][] {
  const text = spec.uppercase ? spec.text.toUpperCase() : spec.text;
  return tokenize(text).map((para) => para.map((t) => ({ text: t.text, em: t.em, width: m.width(faceFor(spec, t.em), t.text, tracking) })));
}

interface Trial {
  size: number;
  tracking: number;
  lineHeight: number;
  lines: Line[];
  h: number;
  fits: boolean;
}

function trialBlock(m: Measurer, spec: BlockSpec, size: number, boxW: number, boxH: number, ref: number): Trial {
  const ratio = size / ref;
  const tracking = quant(trackingFor(spec.role, ratio, spec.trackingBase ?? 0));
  const metrics = m.metrics(spec.face);
  const paragraphs = tokensFor(m, spec, tracking);
  const [minChars, maxChars] = spec.measure ?? MEASURE[spec.role];
  const auto = "ratio" in spec.size;
  const params: FitParams = {
    paragraphs,
    space: metrics.space + tracking,
    maxWidthPx: Math.min(boxW, spec.maxWidth ?? Infinity) - markerIndent(spec, size),
    maxHeightPx: boxH,
    minSize: size,
    maxSize: size,
    maxLines: spec.maxLines,
    minCharsPerLine: auto ? minChars : undefined,
    maxCharsPerLine: auto ? maxChars : undefined,
    avgCharWidth: metrics.avgChar + tracking,
    capHeight: metrics.capHeight,
    descent: spec.uppercase ? 0.02 : metrics.descent,
    lineHeight: (s) => lineHeightFor(spec.role, s / ref, spec.lineHeightFactor ?? 1),
    balance: spec.balance ?? spec.role === "display",
  };
  const r = layoutAtSize(params, size);
  return { size, tracking, lineHeight: r.lineHeight, lines: r.lines, h: r.lines.length ? r.height : 0, fits: r.fits };
}

/**
 * Fits the blocks into `box.w × box.h`; positions are relative to (0,0) until
 * placed. `kMax` caps the shared scale (used to give grouped stacks one size).
 */
export function fitStack(m: Measurer, specs: BlockSpec[], box: Rect, ref: number, kMax = Infinity): StackResult {
  const auto = specs.filter((s) => "ratio" in s.size) as (BlockSpec & { size: { ratio: number; min: number; max: number } })[];
  const sizeAt = (s: BlockSpec, k: number) => ("fixed" in s.size ? s.size.fixed : Math.max(s.size.min, Math.min(s.size.max, k * s.size.ratio)));

  const run = (k: number) => {
    let total = 0;
    let ok = true;
    const trials = specs.map((s, i) => {
      const t = trialBlock(m, s, sizeAt(s, k), box.w, box.h, ref);
      if (!t.fits) ok = false;
      total += t.h + (i > 0 ? s.gapBefore ?? 0 : 0);
      return t;
    });
    if (total > box.h + 0.01) ok = false;
    return { trials, total, ok, k };
  };

  let lo = auto.length ? Math.min(...auto.map((s) => s.size.min / s.size.ratio)) : 1;
  let hi = auto.length ? Math.min(kMax, Math.max(...auto.map((s) => s.size.max / s.size.ratio))) : 1;
  if (hi < lo) hi = lo;
  let best = run(hi);
  if (!best.ok && auto.length) {
    const low = run(lo);
    best = low;
    if (low.ok) {
      for (let i = 0; i < 24 && hi - lo > 0.002; i++) {
        const mid = (lo + hi) / 2;
        const r = run(mid);
        if (r.ok) {
          best = r;
          lo = mid;
        } else hi = mid;
      }
    }
  }

  const blocks: PlacedBlock[] = [];
  let y = 0;
  best.trials.forEach((t, i) => {
    const spec = specs[i];
    if (i > 0) y += spec.gapBefore ?? 0;
    const capHeight = m.metrics(spec.face).capHeight * t.size;
    const widest = Math.max(0, ...t.lines.map((l) => l.width * t.size));
    const colW = Math.min(box.w, spec.maxWidth ?? Infinity);
    const indent = markerIndent(spec, t.size);
    const textW = colW - indent;
    const offset = indent + (spec.align === "center" ? (textW - widest) / 2 : spec.align === "right" ? textW - widest : 0);
    const rx = spec.marker ? 0 : offset;
    blocks.push({
      spec, size: t.size, lineHeight: t.lineHeight, tracking: t.tracking, lines: t.lines,
      x: 0, y, colW, indent, h: t.h,
      rect: { x: rx, y, w: offset + widest - rx, h: t.h },
      capHeight, fits: t.fits,
    });
    y += t.h;
  });
  return { blocks, height: best.total, fits: best.ok, k: best.k };
}

/** Moves a fitted stack into `box` with vertical alignment; returns placed blocks. */
export function placeStack(stack: StackResult, box: Rect, valign: "top" | "center" | "bottom" | "optical", hAlign: Align = "left"): PlacedBlock[] {
  let top = box.y;
  if (valign === "center") top = box.y + (box.h - stack.height) / 2;
  else if (valign === "bottom") top = box.y + box.h - stack.height;
  else if (valign === "optical") top = box.y + Math.max(0, (box.h - stack.height) * 0.44);
  return stack.blocks.map((b) => {
    const colX = hAlign === "center" ? box.x + (box.w - b.colW) / 2 : hAlign === "right" ? box.x + box.w - b.colW : box.x;
    return { ...b, x: colX, y: top + b.y, rect: { ...b.rect, x: colX + b.rect.x, y: top + b.rect.y } };
  });
}

/** Draws a placed block line by line, with emphasis runs, marker and hanging punctuation. */
export function drawBlock(ctx: Ctx, env: RenderEnv, m: Measurer, b: PlacedBlock, colorOverride?: string) {
  const { spec, size, tracking } = b;
  const color = colorOverride ?? spec.color;
  const lhPx = b.lineHeight * size;
  const supportsLs = "letterSpacing" in ctx;
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.globalAlpha = spec.opacity ?? 1;

  if (spec.marker && b.lines.length) {
    const mk = spec.marker;
    const ms = size * (mk.sizeEm ?? 1);
    const mt = mk.uppercase ? mk.text.toUpperCase() : mk.text;
    const tr = mk.trackingEm ?? 0;
    const mw = m.width(mk.face, mt, tr) * ms;
    const mx = mk.align === "right" ? b.x + mk.widthEm * size - mw : b.x;
    ctx.font = fontString(env, mk.face, ms);
    if (supportsLs) ctx.letterSpacing = `${(tr * ms).toFixed(3)}px`;
    ctx.fillStyle = mk.color;
    ctx.fillText(mt, mx, b.y + b.capHeight);
  }

  if (supportsLs) ctx.letterSpacing = `${(tracking * size).toFixed(3)}px`;
  const space = (m.metrics(spec.face).space + tracking) * size;
  const textX = b.x + b.indent;
  const textW = b.colW - b.indent;

  b.lines.forEach((line, li) => {
    if (!line.tokens.length) return;
    // Group consecutive tokens with the same emphasis into runs (keeps kerning).
    const runs: { text: string; em: boolean }[] = [];
    for (const t of line.tokens) {
      const em = !!t.em;
      const last = runs[runs.length - 1];
      if (last && last.em === em) last.text += " " + t.text;
      else runs.push({ text: t.text, em });
    }
    const runW = runs.map((r) => m.width(faceFor(spec, r.em), r.text, tracking) * size);
    const lineW = runW.reduce((a, w) => a + w, 0) + space * (runs.length - 1);
    let x = textX;
    if (spec.align === "center") x = textX + (textW - lineW) / 2;
    else if (spec.align === "right") x = textX + textW - lineW;

    // Hanging punctuation: let an opening quote sit outside the text edge.
    const first = line.tokens[0].text;
    if (li === 0 && spec.hangPunctuation !== false && OPENING_PUNCTUATION.test(first) && spec.align !== "right" && !spec.marker) {
      const qw = m.width(spec.face, first[0], tracking) * size;
      x -= spec.align === "center" ? qw / 2 : qw;
    }

    const baseline = b.y + b.capHeight + li * lhPx;
    runs.forEach((r, ri) => {
      const face = faceFor(spec, r.em);
      const w = runW[ri];
      if (r.em && spec.emStyle === "marker") {
        // emColor is an opaque highlighter tint chosen for this palette.
        ctx.fillStyle = spec.emColor ?? "#efe3b8";
        const pad = size * 0.06;
        ctx.fillRect(x - pad, baseline - b.capHeight * 0.62, w + pad * 2, b.capHeight * 0.82);
      }
      ctx.font = fontString(env, face, size);
      ctx.fillStyle = r.em && (spec.emStyle === "color" || spec.emStyle === "underline") && spec.emColor ? spec.emColor : color;
      ctx.fillText(r.text, x, baseline);
      if (r.em && spec.emStyle === "underline") {
        const th = Math.max(1, Math.round(size * 0.05));
        ctx.fillRect(Math.round(x), Math.round(baseline + size * 0.12), Math.round(w), th);
      }
      x += w + space;
    });
  });
  ctx.restore();
}

export { blockHeight };
