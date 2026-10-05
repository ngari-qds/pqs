/** Building blocks shared by every format composer. */
import { findFamily } from "../../fonts/registry";
import type { LayoutContext } from "../compose";
import type { BlockSpec, MarkerSpec, RuleSpec } from "../stack";
import { hairline } from "../draw";
import { mixOklab, rgbToHex } from "../color";
import { mathSymbols, smartQuotes } from "../typography/smart";
import type { FaceRef } from "../types";

type Opts = Partial<BlockSpec>;

export const sq = (s: string) => smartQuotes(s);

/** Large display text (quotes, hooks). `max`/`min` are fractions of ref. */
export function display(lc: LayoutContext, id: string, text: string, max = 0.1, opts: Opts = {}): BlockSpec {
  const { pairing, ref, template } = lc;
  return {
    id,
    role: "display",
    text: sq(text),
    face: pairing.display,
    emFace: pairing.displayEm,
    color: lc.ink,
    align: "left",
    size: { ratio: 1, min: ref * 0.032, max: ref * max },
    uppercase: pairing.uppercaseDisplay,
    trackingBase: pairing.displayTracking,
    lineHeightFactor: pairing.lineHeightFactor,
    hangPunctuation: true,
    emStyle: template.emphasis ?? "italic",
    emColor: emColorFor(lc, template.emphasis ?? "italic"),
    ...opts,
  };
}

/**
 * Emphasis colour: the accent for coloured words; for the marker treatment a
 * pale (or, on dark palettes, deep) opaque tint of it, like a highlighter.
 */
export function emColorFor(lc: LayoutContext, style: string): string {
  if (style !== "marker") return lc.accent;
  const base = lc.isPhoto ? "#1a1a1a" : lc.palette.bg;
  return rgbToHex(mixOklab(base, lc.isPhoto ? "#c9a96a" : lc.palette.accent, lc.palette.dark || lc.isPhoto ? 0.45 : 0.24));
}

/** Readable body copy, sized relative to the display scale. */
export function body(lc: LayoutContext, id: string, text: string, ratio = 0.42, opts: Opts = {}): BlockSpec {
  const { pairing, ref, template } = lc;
  return {
    id,
    role: "body",
    text: sq(text),
    face: pairing.text,
    emFace: pairing.textEm,
    color: lc.ink,
    align: "left",
    size: { ratio, min: ref * 0.026, max: ref * 0.046 },
    balance: false,
    emStyle: template.emphasis === "italic" || !template.emphasis ? "color" : template.emphasis,
    emColor: emColorFor(lc, template.emphasis ?? "color"),
    ...opts,
  };
}

/**
 * Small tracked capitals: labels, kickers, attributions. Sized with the stack
 * (about a quarter of the display size) within readable bounds, so labels
 * stay in proportion to large statements.
 */
export function label(lc: LayoutContext, id: string, text: string, opts: Opts = {}): BlockSpec {
  return {
    id,
    role: "caps",
    text: sq(text),
    uppercase: true,
    face: lc.pairing.label,
    color: lc.muted,
    align: "left",
    size: { ratio: 0.3, min: lc.ref * 0.025, max: lc.ref * 0.034 },
    ...opts,
  };
}

/** Author/source line in the template's attribution style. */
export function attribution(lc: LayoutContext, text: string, align: BlockSpec["align"], gap = 0.055): BlockSpec | null {
  if (!text) return null;
  const caps = (lc.template.attribution ?? "caps") === "caps";
  return caps
    ? label(lc, "author", text, { align, gapBefore: lc.ref * gap })
    : {
        id: "author",
        role: "body",
        text: `— ${sq(text)}`,
        face: lc.pairing.mono ? lc.pairing.text : lc.pairing.displayEm,
        color: lc.muted,
        align,
        size: { fixed: lc.ref * 0.034 },
        gapBefore: lc.ref * (gap - 0.01),
      };
}

export const gap = (lc: LayoutContext, k: number) => lc.ref * k;

export const ruleAbove = (lc: LayoutContext, alpha = 0.35, width = 1, color = lc.ink): RuleSpec => ({
  color, alpha, width, thickness: hairline(lc.ref),
});

/** A margin marker whose column fits the widest of `texts` (in em of the block size). */
export function marker(lc: LayoutContext, text: string, texts: string[], face: FaceRef, opts: Partial<MarkerSpec> = {}): MarkerSpec {
  const sizeEm = opts.sizeEm ?? 1;
  const tr = opts.trackingEm ?? 0;
  const up = (t: string) => (opts.uppercase ? t.toUpperCase() : t);
  const widest = Math.max(...texts.map((t) => lc.m.width(face, up(t), tr)));
  return { text, face, color: lc.muted, widthEm: widest * sizeEm, gapEm: 0.6, ...opts };
}

/** Faces for equations: the pairing's mono family, or JetBrains Mono. */
export function mathFace(lc: LayoutContext, weight = 400): FaceRef {
  if (lc.pairing.mono) return { ...lc.pairing.text, weight: weight >= 600 ? lc.pairing.textEm.weight : lc.pairing.text.weight };
  return { family: "JetBrains Mono", weight: weight >= 600 ? 600 : 400, style: "normal" };
}

export const math = (s: string) => mathSymbols(sq(s));

/** Default kicker shown above formats that name themselves (e.g. "Myth"). */
export const pad2 = (n: number) => String(n).padStart(2, "0");

/** Heaviest upright weight of the display family (for bold hooks), never synthetic. */
export function boldDisplay(lc: LayoutContext): FaceRef {
  const fam = findFamily(lc.pairing.display.family);
  const w = Math.max(...(fam?.faces.filter((f) => f.style === "normal").map((f) => f.weight) ?? [lc.pairing.display.weight]));
  return { ...lc.pairing.display, weight: w, style: "normal" };
}
