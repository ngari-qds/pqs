/**
 * Hook / Body / Punchline, and its carousel version. The hook is large and
 * bold, the body calm and readable, the punchline set apart by a rule, a
 * colour shift or extra space.
 */
import type { Composition, LayoutContext, StackSpec } from "../compose";
import { hairline, rule, vrule } from "../draw";
import type { Ctx } from "../types";
import type { BlockSpec } from "../stack";
import { str, type QuoteContent } from "../template";
import { body, boldDisplay, display, gap, label, ruleAbove } from "./common";

export const HBP_LAYOUTS = ["stacked", "centered", "margin-rule", "split"] as const;

function hbpBlocks(lc: LayoutContext, c: QuoteContent, align: BlockSpec["align"], punchStyle: "rule" | "accent" | "space"): BlockSpec[] {
  const hook = str(c, "hook"), b = str(c, "body"), punch = str(c, "punchline");
  const out: BlockSpec[] = [];
  if (hook) out.push(display(lc, "hook", hook, 0.105, { face: boldDisplay(lc), align, hangPunctuation: align !== "center" }));
  if (b) out.push(body(lc, "body", b, 0.4, { align, gapBefore: gap(lc, 0.045) }));
  if (punch)
    out.push(
      display(lc, "punchline", punch, 0.075, {
        size: { ratio: 0.62, min: lc.ref * 0.03, max: lc.ref * 0.075 },
        align,
        face: lc.pairing.displayEm,
        color: punchStyle === "accent" ? lc.accent : lc.ink,
        gapBefore: gap(lc, punchStyle === "space" ? 0.1 : 0.075),
        ruleAbove: punchStyle === "rule" ? ruleAbove(lc, 0.5, align === "center" ? 0.12 : 0.16) : undefined,
        hangPunctuation: false,
      }),
    );
  return out;
}

export function composeHbp(lc: LayoutContext, c: QuoteContent, layout: string): Composition {
  const { box } = lc;
  switch (layout) {
    case "centered":
      return { stacks: [{ specs: hbpBlocks(lc, c, "center", "rule"), box, valign: "center", hAlign: "center" }] };
    case "margin-rule": {
      // A vertical hairline runs the height of the text; text sits to its right.
      const inset = gap(lc, 0.05);
      const inner = { ...box, x: box.x + inset, w: box.w - inset };
      return {
        stacks: [{ specs: hbpBlocks(lc, c, "left", "accent"), box: inner, valign: "optical" }],
        decorate: (ctx, placed) => {
          const bl = placed[0];
          if (!bl.length) return [];
          const top = bl[0].y, bottom = bl[bl.length - 1].y + bl[bl.length - 1].h;
          return [vrule(ctx, box.x, top, bottom - top, hairline(lc.ref) * 2, lc.accent, 0.9)];
        },
      };
    }
    case "split": {
      // Hook in the upper part, body and punchline below a full-width rule.
      const blocks = hbpBlocks(lc, c, "left", "space");
      const hook = blocks.filter((b) => b.id === "hook");
      const rest = blocks.filter((b) => b.id !== "hook").map((b, i) => (i === 0 ? { ...b, gapBefore: 0 } : b));
      const g = gap(lc, 0.05);
      const top = { ...box, h: box.h * 0.48 - g };
      const bottom = { ...box, y: box.y + box.h * 0.48 + g, h: box.h * 0.52 - g };
      const stacks: StackSpec[] = [{ specs: hook, box: top, valign: "bottom" }];
      if (rest.length) stacks.push({ specs: rest, box: bottom, valign: "top" });
      return {
        stacks,
        decorate: (ctx) => [ruleAt(ctx, lc, box.x, box.y + box.h * 0.48, box.w)],
      };
    }
    default:
      return { stacks: [{ specs: hbpBlocks(lc, c, "left", "rule"), box, valign: "optical" }] };
  }
}

const ruleAt = (ctx: Ctx, lc: LayoutContext, x: number, y: number, w: number) => rule(ctx, x, y, w, hairline(lc.ref), lc.ink, 0.35);

// ---------------------------------------------------------------- carousel

export const CAROUSEL_LAYOUTS = ["left", "centered"] as const;

export interface Slide {
  kind: "hook" | "body" | "punchline";
  text: string;
}

/** Splits text into sentences, keeping common abbreviations intact. */
export function sentences(text: string): string[] {
  const protectedText = text
    .replace(/\b(Mr|Mrs|Ms|Dr|St|vs|etc|e\.g|i\.e)\./g, "$1\u0000")
    .replace(/\bNo\.(?=\s*\d)/g, "No\u0000");
  return protectedText
    .split(/(?<=[.!?…]["”’)]?)\s+(?=["“‘(]?[A-Z0-9])/)
    .map((s) => s.replace(/\u0000/g, ".").trim())
    .filter(Boolean);
}

/** Hook slide, 1–3 body slides of up to ~170 characters, punchline slide: 3 to 5 in total. */
export function carouselSlides(c: QuoteContent): Slide[] {
  const slides: Slide[] = [];
  const hook = str(c, "hook"), b = str(c, "body"), punch = str(c, "punchline");
  if (hook) slides.push({ kind: "hook", text: hook });
  if (b) {
    const chunks: string[] = [];
    let cur = "";
    for (const s of sentences(b)) {
      if (cur && (cur + " " + s).length > 170) {
        chunks.push(cur);
        cur = s;
      } else cur = cur ? `${cur} ${s}` : s;
    }
    if (cur) chunks.push(cur);
    while (chunks.length > 3) {
      // Merge the two shortest neighbours until at most three body slides remain.
      let best = 0;
      for (let i = 1; i < chunks.length - 1; i++) if (chunks[i].length + chunks[i + 1].length < chunks[best].length + chunks[best + 1].length) best = i;
      chunks.splice(best, 2, `${chunks[best]} ${chunks[best + 1]}`);
    }
    slides.push(...chunks.map((t) => ({ kind: "body" as const, text: t })));
  }
  if (punch) slides.push({ kind: "punchline", text: punch });
  return slides;
}

export function composeCarousel(lc: LayoutContext, c: QuoteContent, layout: string): Composition {
  const slides = carouselSlides(c);
  const n = Math.max(1, slides.length);
  const idx = Math.max(0, Math.min(n - 1, Number(c.slide ?? 0)));
  const slide = slides[idx] ?? { kind: "hook", text: " " };
  const align: BlockSpec["align"] = layout === "centered" ? "center" : "left";
  const { box } = lc;

  // Slide counter ("2/4") in its own band at the top of the text area.
  const counter = label(lc, "counter", `${idx + 1}/${n}`, { align: "left", trackingBase: 0.04 });
  const band = lc.ref * 0.022 * 1.3 + gap(lc, 0.05);
  const main = { ...box, y: box.y + band, h: box.h - band };

  let spec: BlockSpec;
  if (slide.kind === "hook") spec = display(lc, "hook", slide.text, 0.12, { face: boldDisplay(lc), align });
  else if (slide.kind === "body") spec = display(lc, "body", slide.text, 0.072, { align, measure: [18, 38] });
  else spec = display(lc, "punchline", slide.text, 0.095, { face: lc.pairing.displayEm, align, color: lc.ink });

  const stacks: StackSpec[] = [
    { specs: [counter], box: { ...box, h: band }, valign: "top" },
    { specs: [spec], box: main, valign: slide.kind === "body" ? "optical" : "center", hAlign: align === "center" ? "center" : "left" },
  ];
  return {
    stacks,
    decorate: (ctx, placed) => {
      // The punchline slide gets a short accent rule above it.
      if (slide.kind !== "punchline") return [];
      const p = placed[1][0];
      const w = lc.ref * 0.08;
      const x = align === "center" ? p.x + (p.colW - w) / 2 : p.x;
      return [rule(ctx, x, p.y - gap(lc, 0.05), w, hairline(lc.ref) * 2, lc.accent, 1)];
    },
  };
}
