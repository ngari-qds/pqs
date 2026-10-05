/**
 * Classic: quote text with an optional author, across seven layouts.
 */
import type { Composition, LayoutContext, StackSpec } from "../compose";
import { hairline, rule } from "../draw";
import { fontString } from "../env";
import type { BlockSpec, PlacedBlock } from "../stack";
import { str, type QuoteContent } from "../template";
import { smartQuotes } from "../typography/smart";
import { emColorFor, label } from "./common";
import { ARCHETYPE_LAYOUTS, composeArchetype } from "./archetypes";
import type { Rect } from "../types";

export const CLASSIC_LAYOUTS = ["centered", "editorial", "bottom", "top", "pull-quote", "corner", "framed-card", ...ARCHETYPE_LAYOUTS] as const;

export function composeClassic(lc: LayoutContext, content: QuoteContent, layout: string = lc.template.layout): Composition {
  if ((ARCHETYPE_LAYOUTS as readonly string[]).includes(layout)) return composeArchetype(lc, content, layout);
  const { ref, box, pairing, template, palette } = lc;
  const author = str(content, "author") || str(content, "source");
  const align = layout === "centered" || layout === "framed-card" ? "center" : "left";

  const maxSize: Record<string, number> = {
    centered: 0.115, editorial: 0.1, bottom: 0.095, top: 0.095, "pull-quote": 0.085, corner: 0.052, "framed-card": 0.082,
  };

  const display = (ink: string): BlockSpec => ({
    id: "quote",
    role: "display",
    text: smartQuotes(str(content, "text")),
    face: pairing.display,
    emFace: pairing.displayEm,
    color: ink,
    align,
    size: { ratio: 1, min: ref * (layout === "corner" ? 0.03 : 0.034), max: ref * (maxSize[layout] ?? 0.1) },
    uppercase: pairing.uppercaseDisplay,
    trackingBase: pairing.displayTracking,
    lineHeightFactor: pairing.lineHeightFactor,
    hangPunctuation: true,
    emStyle: template.emphasis ?? "italic",
    emColor: emColorFor(lc, template.emphasis ?? "italic"),
    maxWidth: layout === "corner" ? box.w * 0.64 : layout === "editorial" ? box.w * 0.9 : undefined,
  });

  const attribution = (muted: string): BlockSpec | null => {
    if (!author) return null;
    const caps = (template.attribution ?? "caps") === "caps";
    return caps
      ? label(lc, "author", author, { color: muted, align, gapBefore: ref * 0.06 })
      : { id: "author", role: "body", text: `— ${smartQuotes(author)}`, face: pairing.mono ? pairing.text : pairing.displayEm, color: muted, align, size: { fixed: ref * 0.034 }, gapBefore: ref * 0.045 };
  };

  const blocks = (ink: string, muted: string) => [display(ink), attribution(muted)].filter(Boolean) as BlockSpec[];
  const markColor = template.accentMarks ? lc.accent : lc.muted;
  const th = hairline(ref);

  switch (layout) {
    case "centered": {
      const stacks: StackSpec[] = [{ specs: blocks(lc.ink, lc.muted), box, valign: "center", hAlign: "center" }];
      return {
        stacks,
        decorate: (ctx, placed) => {
          const a = placed[0].find((b) => b.spec.id === "author");
          const q = placed[0][0];
          if (!a || a.spec.role !== "caps") return [];
          const y = (q.y + q.h + a.y) / 2;
          const w = ref * 0.05;
          return [rule(ctx, box.x + (box.w - w) / 2, y, w, th, markColor, 0.8)];
        },
      };
    }
    default:
    case "editorial":
      return { stacks: [{ specs: blocks(lc.ink, lc.muted), box, valign: "optical" }] };
    case "bottom":
      return { stacks: [{ specs: blocks(lc.ink, lc.muted), box: { ...box, w: box.w * 0.94 }, valign: "bottom" }] };
    case "top":
      return { stacks: [{ specs: blocks(lc.ink, lc.muted), box: { ...box, w: box.w * 0.94 }, valign: "top" }] };
    case "corner":
      return { stacks: [{ specs: blocks(lc.ink, lc.muted), box, valign: "bottom" }] };
    case "pull-quote": {
      // Oversized opening mark + thin rules above and below.
      const markSize = ref * 0.26;
      const g = lc.m.glyphBox(pairing.display, "“");
      const markH = (g.ascent + Math.min(0, g.descent)) * markSize; // glyph sits above baseline
      const ruleGap = ref * 0.045;
      const padTop = ruleGap + markH + ref * 0.03;
      const padBottom = ruleGap;
      const spec = blocks(lc.ink, lc.muted).map((b) => (b.id === "quote" ? { ...b, hangPunctuation: false } : b));
      return {
        stacks: [{ specs: spec, box, valign: "center", padTop, padBottom }],
        decorate: (ctx, placed) => {
          const blocksP = placed[0];
          const top = blocksP[0].y - padTop;
          const last = blocksP[blocksP.length - 1];
          const bottom = last.y + last.h + padBottom;
          const rects: Rect[] = [rule(ctx, box.x, top, box.w, th, lc.ink, 0.55), rule(ctx, box.x, bottom, box.w, th, lc.ink, 0.55)];
          const baseline = top + ruleGap + g.ascent * markSize;
          ctx.save();
          ctx.font = fontString(lc.env, pairing.display, markSize);
          ctx.fillStyle = template.accentMarks === false ? lc.muted : lc.accent;
          ctx.textBaseline = "alphabetic";
          const gx = box.x - (lc.m.width(pairing.display, "“") * 0.06) * markSize;
          ctx.fillText("“", gx, baseline);
          ctx.restore();
          rects.push({ x: gx, y: baseline - g.ascent * markSize, w: g.width * markSize, h: markH });
          return rects;
        },
      };
    }
    case "framed-card": {
      // Card sized to its content, centred in the box.
      const pad = ref * 0.075;
      const cardInk = palette.ink, cardMuted = palette.muted;
      const inner = { x: box.x + pad, y: box.y + pad, w: box.w - pad * 2, h: box.h - pad * 2 };
      const card = (placed: PlacedBlock[][]) => {
        const bl = placed[0];
        const top = bl[0].y - pad;
        const last = bl[bl.length - 1];
        return { x: box.x, y: top, w: box.w, h: last.y + last.h - bl[0].y + pad * 2 };
      };
      return {
        stacks: [{ specs: blocks(cardInk, cardMuted).map((b) => ({ ...b, emColor: template.emphasis === "marker" ? b.emColor : palette.accent })), box: inner, valign: "center", hAlign: "center" }],
        prepaint: (ctx, placed) => {
          const r = card(placed);
          ctx.save();
          ctx.fillStyle = lc.isPhoto ? palette.bg : palette.dark ? palette.bg2 : "#ffffff";
          ctx.globalAlpha = lc.isPhoto ? 0.96 : 1;
          ctx.fillRect(Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h));
          ctx.restore();
          if (!lc.isPhoto) {
            ctx.save();
            ctx.strokeStyle = palette.muted;
            ctx.globalAlpha = 0.35;
            ctx.lineWidth = th;
            const o = th % 2 ? 0.5 : 0;
            ctx.strokeRect(Math.round(r.x) + o, Math.round(r.y) + o, Math.round(r.w) - th, Math.round(r.h) - th);
            ctx.restore();
          }
        },
      };
    }
  }
}
