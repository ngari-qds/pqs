/** Text-led formats: One-liner, Highlight, Stanza, Pull Quote. */
import type { Composition, LayoutContext } from "../compose";
import { fontString } from "../env";
import { str, type QuoteContent } from "../template";
import { composeClassic } from "./classic";
import { attribution, display, gap, label } from "./common";

// ---------------------------------------------------------------- one-liner

export const ONE_LINER_LAYOUTS = ["center", "low", "corner"] as const;

/** A single sharp sentence with maximum whitespace: modest size, wide margins. */
export function composeOneLiner(lc: LayoutContext, c: QuoteContent, layout: string): Composition {
  const { box } = lc;
  const text = str(c, "text");
  if (layout === "low") {
    const lowBox = { ...box, y: box.y + box.h * 0.55, h: box.h * 0.45 };
    return { stacks: [{ specs: [display(lc, "quote", text, 0.068, { maxWidth: box.w * 0.85, measure: [12, 30] })], box: lowBox, valign: "bottom" }] };
  }
  if (layout === "corner") {
    return { stacks: [{ specs: [display(lc, "quote", text, 0.05, { maxWidth: box.w * 0.6, measure: [10, 28] })], box, valign: "bottom" }] };
  }
  return {
    stacks: [{ specs: [display(lc, "quote", text, 0.075, { align: "center", maxWidth: box.w * 0.8, measure: [12, 30] })], box, valign: "center", hAlign: "center" }],
  };
}

// ---------------------------------------------------------------- highlight

export const HIGHLIGHT_LAYOUTS = ["centered", "editorial", "bottom", "big-word", "glass"] as const;

/** Emphasised words get the template's treatment (marker by default). */
export function composeHighlight(lc: LayoutContext, c: QuoteContent, layout: string): Composition {
  const template = { ...lc.template, emphasis: lc.template.emphasis ?? "marker" };
  return composeClassic({ ...lc, template }, c, layout);
}

// ------------------------------------------------------------------- stanza

export const STANZA_LAYOUTS = ["left", "centered"] as const;

/** Poetry: line breaks are the poet's, so they are preserved exactly. */
export function composeStanza(lc: LayoutContext, c: QuoteContent, layout: string): Composition {
  const title = str(c, "title");
  const align = layout === "centered" ? "center" : "left";
  const specs = [];
  if (title) specs.push(label(lc, "title", title, { align }));
  // Keep the poet's lines intact: no re-wrapping unless a line is too long to
  // fit even at a small size.
  const verse = str(c, "text");
  const lines = verse.split("\n");
  const longest = Math.max(...lines.map((l) => l.trim().length));
  specs.push(
    display(lc, "stanza", verse, 0.07, {
      maxLines: longest <= 46 ? lines.length : undefined,
      align,
      balance: false,
      measure: [0, 60],
      lineHeightFactor: (lc.pairing.lineHeightFactor ?? 1) * 1.1,
      gapBefore: title ? gap(lc, 0.05) : 0,
      hangPunctuation: false,
    }),
  );
  const author = attribution(lc, str(c, "author"), align);
  if (author) specs.push(author);
  return { stacks: [{ specs, box: lc.box, valign: "optical", hAlign: align === "center" ? "center" : "left" }] };
}

// --------------------------------------------------------------- pull quote

export const PULL_QUOTE_LAYOUTS = ["rules", "hanging", "centered"] as const;

/** Magazine pull quote: thin rules and an oversized opening quotation mark. */
export function composePullQuote(lc: LayoutContext, c: QuoteContent, layout: string): Composition {
  if (layout === "hanging") {
    // A fixed-size oversized mark hangs in its own margin column; the quote
    // and its attribution share the indented edge.
    const markSize = lc.ref * 0.24;
    const g = lc.m.glyphBox(lc.pairing.display, "\u201C");
    const column = g.width * markSize * 1.25;
    const inner = { ...lc.box, x: lc.box.x + column, w: lc.box.w - column };
    const text = str(c, "text").replace(/^[\u201C"]+|[\u201D"]+$/g, "");
    const specs = [display(lc, "quote", text, 0.085, { hangPunctuation: false })];
    const a = attribution(lc, str(c, "source"), "left");
    if (a) specs.push(a);
    return {
      stacks: [{ specs, box: inner, valign: "optical" }],
      decorate: (ctx, placed) => {
        const q = placed[0][0];
        if (!q) return [];
        const baseline = q.y + g.ascent * markSize * 0.92;
        ctx.save();
        ctx.font = fontString(lc.env, lc.pairing.display, markSize);
        ctx.fillStyle = lc.template.accentMarks === false ? lc.muted : lc.accent;
        ctx.fillText("\u201C", lc.box.x, baseline);
        ctx.restore();
        return [{ x: lc.box.x, y: baseline - g.ascent * markSize, w: g.width * markSize, h: (g.ascent + Math.min(0, g.descent)) * markSize }];
      },
    };
  }
  return composeClassic({ ...lc, template: { ...lc.template, accentMarks: lc.template.accentMarks ?? true } }, c, layout === "centered" ? "centered" : "pull-quote");
}
