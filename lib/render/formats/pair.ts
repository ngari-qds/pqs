/**
 * Paired statements: Contrast ("Most people think…" / "In reality…"),
 * Myth vs Truth, Then / Now, and Paradox.
 */
import type { Composition, LayoutContext } from "../compose";
import { hairline, rule, vrule } from "../draw";
import { mixOklab, rgbToHex } from "../color";
import type { BlockSpec } from "../stack";
import { str, type FormatId, type QuoteContent } from "../template";
import { display, gap, label, ruleAbove } from "./common";

export const PAIR_LAYOUTS = ["stacked", "panels", "split"] as const;

export const PAIR_DEFAULT_LABELS: Partial<Record<FormatId, [string, string]>> = {
  contrast: ["Most people think", "In reality"],
  "myth-truth": ["Myth", "Truth"],
  "then-now": ["Then", "Now"],
};

function side(lc: LayoutContext, c: QuoteContent, which: "a" | "b", align: BlockSpec["align"]): BlockSpec[] {
  const [da, db] = PAIR_DEFAULT_LABELS[c.format] ?? ["", ""];
  const lab = str(c, which === "a" ? "labelA" : "labelB") || (which === "a" ? da : db);
  const text = str(c, which);
  // The second statement carries the weight: ink, and the accent on its label.
  // Myths are set in the muted colour (still ≥ 4.5:1) so the truth reads as the answer.
  const mutedFirst = c.format === "myth-truth" && which === "a";
  const out: BlockSpec[] = [];
  if (lab) out.push(label(lc, `label-${which}`, lab, { align, color: which === "b" ? lc.accent : lc.muted }));
  out.push(
    display(lc, which, text, 0.085, {
      align,
      gapBefore: lab ? gap(lc, 0.028) : 0,
      color: mutedFirst ? lc.muted : lc.ink,
    }),
  );
  return out;
}

export function composePair(lc: LayoutContext, c: QuoteContent, layout: string): Composition {
  const { box, W, H } = lc;
  const wide = W / H > 0.9;
  if (layout === "split" && wide) {
    // Side by side with a vertical hairline; both halves share one type size.
    const g = gap(lc, 0.06);
    const half = (box.w - g) / 2;
    const left = { ...box, w: half }, right = { ...box, x: box.x + half + g, w: half };
    return {
      stacks: [
        { specs: side(lc, c, "a", "left"), box: left, valign: "center", group: "pair" },
        { specs: side(lc, c, "b", "left"), box: right, valign: "center", group: "pair" },
      ],
      decorate: (ctx) => [vrule(ctx, box.x + half + g / 2, box.y + box.h * 0.15, box.h * 0.7, hairline(lc.ref), lc.ink, 0.3)],
    };
  }
  if (layout === "panels" || layout === "split") {
    // Two stacked panels: the first on a slightly shifted tone.
    const g = gap(lc, 0.07);
    const topH = (box.h - g) / 2;
    const top = { ...box, h: topH }, bottom = { ...box, y: box.y + topH + g, h: topH };
    const panelTone = rgbToHex(mixOklab(lc.palette.bg, lc.palette.ink, lc.palette.dark ? 0.07 : 0.05));
    return {
      stacks: [
        { specs: side(lc, c, "a", "left"), box: top, valign: "center", group: "pair" },
        { specs: side(lc, c, "b", "left"), box: bottom, valign: "center", group: "pair" },
      ],
      prepaint: (ctx) => {
        if (lc.isPhoto) return;
        // Full-bleed band behind the first statement.
        ctx.save();
        ctx.fillStyle = panelTone;
        ctx.fillRect(0, 0, W, Math.round(box.y + topH + g / 2));
        ctx.restore();
      },
    };
  }
  // stacked: one stack, so both statements share a size automatically.
  const a = side(lc, c, "a", "left");
  const b = side(lc, c, "b", "left");
  b[0] = { ...b[0], gapBefore: gap(lc, 0.11), ruleAbove: ruleAbove(lc, 0.3, 1) };
  return { stacks: [{ specs: [...a, ...b], box, valign: "center" }] };
}

// ------------------------------------------------------------------ paradox

export const PARADOX_LAYOUTS = ["mirror", "axis"] as const;

export function composeParadox(lc: LayoutContext, c: QuoteContent, layout: string): Composition {
  const { box } = lc;
  const first = str(c, "first"), second = str(c, "second");
  if (layout === "axis") {
    // Centred lines either side of a full-width axis; the second in italic.
    return {
      stacks: [
        {
          specs: [
            display(lc, "first", first, 0.085, { align: "center" }),
            display(lc, "second", second, 0.085, { align: "center", face: lc.pairing.displayEm, gapBefore: gap(lc, 0.16), ruleAbove: ruleAbove(lc, 0.4, 1) }),
          ],
          box,
          valign: "center",
          hAlign: "center",
        },
      ],
    };
  }
  // mirror: the first line hangs upper-left, the second answers lower-right,
  // at one shared size.
  const col = box.w * 0.82;
  const g = gap(lc, 0.1);
  const upper = { ...box, h: (box.h - g) / 2 };
  const lower = { ...box, y: box.y + (box.h + g) / 2, h: (box.h - g) / 2 };
  return {
    stacks: [
      { specs: [display(lc, "first", first, 0.09, { align: "left", maxWidth: col })], box: upper, valign: "bottom", group: "mirror" },
      {
        specs: [display(lc, "second", second, 0.09, { align: "right", maxWidth: col, hangPunctuation: false })],
        box: lower,
        valign: "top",
        hAlign: "right",
        group: "mirror",
      },
    ],
    decorate: (ctx) => {
      const w = lc.ref * 0.06;
      return [rule(ctx, box.x + (box.w - w) / 2, box.y + box.h / 2, w, hairline(lc.ref), lc.accent, 0.9)];
    },
  };
}
