/**
 * Extra layout archetypes for quote-style formats: frosted glass panel,
 * oversized single word, Swiss grid poster and vertical strip.
 */
import type { Composition, LayoutContext } from "../compose";
import { mixOklab, rgbToHex } from "../color";
import { hairline, rule } from "../draw";
import { frostedPanel } from "../photo";
import type { BlockSpec, PlacedBlock } from "../stack";
import { str, type QuoteContent } from "../template";
import { boldDisplay, display, gap, label } from "./common";

export const ARCHETYPE_LAYOUTS = ["glass", "big-word", "swiss", "strip"] as const;

/** The strip's width; text and signature stay inside it. */
export const stripWidth = (W: number, H: number) => Math.round(W * (H >= W ? 0.56 : 0.42));

/** Layouts that confine text and signature to part of the canvas. */
export function archetypeArea(layout: string, W: number, H: number) {
  return layout === "strip" ? { x: 0, y: 0, w: stripWidth(W, H) - Math.min(W, H) * 0.06, h: H } : undefined;
}

const authorOf = (c: QuoteContent) => str(c, "author") || str(c, "source");

/** The word that carries the quote: the first *emphasised* word, else the longest. */
export function keyWord(text: string): string {
  const em = text.match(/\*([^*]+)\*/);
  const pick = em ? em[1].trim().split(/\s+/)[0] : text.replace(/\*/g, "").split(/\s+/).reduce((a, w) => (w.replace(/[^\p{L}]/gu, "").length > a.replace(/[^\p{L}]/gu, "").length ? w : a), "");
  return pick.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

const bounds = (bl: PlacedBlock[], pad: number, box: { x: number; w: number }) => {
  const top = bl[0].y - pad, last = bl[bl.length - 1];
  return { x: box.x, y: top, w: box.w, h: last.y + last.h - bl[0].y + pad * 2 };
};

export function composeArchetype(lc: LayoutContext, c: QuoteContent, layout: string): Composition {
  const { box, ref, palette } = lc;
  const text = str(c, "text");
  const author = authorOf(c);

  switch (layout) {
    case "glass": {
      // Frosted panel over the photo; text sits on the softened area.
      const pad = gap(lc, 0.07);
      const inner = { x: box.x + pad, y: box.y + pad, w: box.w - pad * 2, h: box.h - pad * 2 };
      const specs: BlockSpec[] = [display(lc, "quote", text, 0.085, { align: "center" })];
      if (author) specs.push(label(lc, "author", author, { align: "center", gapBefore: gap(lc, 0.05), color: lc.muted }));
      const dark = lc.isPhoto || palette.dark;
      return {
        stacks: [{ specs, box: inner, valign: "center", hAlign: "center" }],
        prepaint: (ctx, placed) => {
          const r = bounds(placed[0], pad, box);
          frostedPanel(ctx, lc.env, r, dark ? "#000000" : "#ffffff", dark ? 0.32 : 0.45, ref * 0.024);
          ctx.save();
          ctx.strokeStyle = dark ? "#ffffff" : palette.ink;
          ctx.globalAlpha = 0.22;
          ctx.lineWidth = hairline(ref);
          ctx.beginPath();
          ctx.roundRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w) - 1, Math.round(r.h) - 1, ref * 0.024);
          ctx.stroke();
          ctx.restore();
        },
      };
    }
    case "big-word": {
      // One word set very large, the full line quietly beneath it.
      const word = keyWord(text) || text.split(/\s+/)[0];
      const specs: BlockSpec[] = [
        display(lc, "word", word, 0.34, {
          face: boldDisplay(lc),
          maxLines: 1,
          measure: [0, 16],
          size: { ratio: 1, min: ref * 0.07, max: ref * 0.34 },
          trackingBase: (lc.pairing.displayTracking ?? 0) - 0.015,
          hangPunctuation: false,
          emStyle: "italic",
        }),
        display(lc, "quote", text, 0.06, {
          size: { ratio: 0.24, min: ref * 0.032, max: ref * 0.058 },
          gapBefore: gap(lc, 0.05),
          measure: [16, 36],
          ruleAbove: { color: lc.accent, alpha: 1, width: 0.12, thickness: hairline(ref) * 2 },
        }),
      ];
      if (author) specs.push(label(lc, "author", author, { gapBefore: gap(lc, 0.04) }));
      return { stacks: [{ specs, box, valign: "optical" }] };
    }
    case "swiss": {
      // Hard grid: heavy top rule, flush-left grotesk, a thin rule above the credit.
      const top = gap(lc, 0.06);
      const inner = { ...box, y: box.y + top, h: box.h - top };
      const specs: BlockSpec[] = [display(lc, "quote", text, 0.11, { maxWidth: box.w * 0.88, hangPunctuation: true, lineHeightFactor: (lc.pairing.lineHeightFactor ?? 1) * 0.94 })];
      if (author) specs.push(label(lc, "author", author, { gapBefore: gap(lc, 0.08), color: lc.ink, ruleAbove: { color: lc.ink, alpha: 0.9, width: 0.3, thickness: hairline(ref) } }));
      return {
        stacks: [{ specs, box: inner, valign: "top" }],
        decorate: (ctx) => [rule(ctx, box.x, box.y, box.w, hairline(ref) * 4, lc.ink, 1)],
      };
    }
    case "strip":
    default: {
      // A vertical strip of solid colour holding the text; photo or tone beside it.
      const stripW = stripWidth(lc.W, lc.H);
      const inner = box; // already confined to the strip by archetypeArea
      const specs: BlockSpec[] = [display(lc, "quote", text, 0.08, { measure: [12, 28], color: palette.ink, emColor: palette.accent })];
      if (author) specs.push(label(lc, "author", author, { gapBefore: gap(lc, 0.05), color: palette.muted }));
      const stripColor = lc.isPhoto ? palette.bg : rgbToHex(mixOklab(palette.bg, palette.ink, palette.dark ? 0.06 : 0.045));
      return {
        stacks: [{ specs, box: inner, valign: "optical" }],
        prepaint: (ctx) => {
          ctx.save();
          ctx.fillStyle = stripColor;
          ctx.fillRect(0, 0, stripW, lc.H);
          ctx.restore();
        },
      };
    }
  }
}
