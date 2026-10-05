/** Field Note (notebook / margin note) and Post Card (a clean social post). */
import type { Composition, LayoutContext } from "../compose";
import { hairline, vrule } from "../draw";
import { fontString } from "../env";
import { mixOklab, rgbToHex } from "../color";
import { OWNER } from "../signature";
import type { BlockSpec } from "../stack";
import { str, type QuoteContent } from "../template";
import type { FaceRef, Rect } from "../types";
import { body, display, gap, label } from "./common";

// --------------------------------------------------------------- field note

export const FIELD_NOTE_LAYOUTS = ["notebook", "margin"] as const;

/** Date stamp face: the pairing's label face (monospace in mono pairings). */
const stampFace = (lc: LayoutContext): FaceRef => lc.pairing.label;

export function composeFieldNote(lc: LayoutContext, c: QuoteContent, layout: string): Composition {
  const { box, ref } = lc;
  const stamp = [str(c, "date"), str(c, "place")].filter(Boolean).join("  ·  ");
  if (layout === "margin") {
    // A narrow note set to the right, like writing in a book's margin.
    const colW = box.w * 0.62;
    const specs: BlockSpec[] = [];
    if (stamp) specs.push(label(lc, "stamp", stamp, { face: stampFace(lc), trackingBase: 0.02 }));
    specs.push(
      display(lc, "note", str(c, "text"), 0.06, {
        face: lc.pairing.displayEm,
        maxWidth: colW,
        measure: [14, 34],
        gapBefore: stamp ? gap(lc, 0.035) : 0,
        ruleAbove: stamp ? { color: lc.accent, alpha: 0.9, width: 0.18, thickness: hairline(ref) * 2 } : undefined,
        hangPunctuation: false,
      }),
    );
    return { stacks: [{ specs: specs.map((s) => ({ ...s, maxWidth: colW })), box, valign: "optical", hAlign: "right" }] };
  }

  // notebook: faint ruled lines behind the text at its own line spacing, and a margin rule.
  const margin = gap(lc, 0.07);
  const inner: Rect = { ...box, x: box.x + margin, w: box.w - margin };
  const specs: BlockSpec[] = [];
  if (stamp) specs.push(label(lc, "stamp", stamp, { face: stampFace(lc), trackingBase: 0.02 }));
  specs.push(
    body(lc, "note", str(c, "text"), 1, {
      face: lc.pairing.mono ? lc.pairing.text : lc.pairing.display,
      emFace: lc.pairing.mono ? lc.pairing.textEm : lc.pairing.displayEm,
      emStyle: "italic",
      size: { ratio: 1, min: ref * 0.03, max: ref * 0.058 },
      measure: [16, 38],
      lineHeightFactor: 1.12,
      gapBefore: stamp ? gap(lc, 0.05) : 0,
    }),
  );
  const ruleColor = rgbToHex(mixOklab(lc.palette.bg, lc.palette.ink, 0.16));
  return {
    stacks: [{ specs, box: inner, valign: "optical" }],
    prepaint: (ctx, placed) => {
      const note = placed[0].find((b) => b.spec.id === "note");
      if (!note || lc.isPhoto) return;
      const lh = note.lineHeight * note.size;
      const th = hairline(ref);
      // Rules sit just under each baseline and continue to the bottom of the text area.
      const first = note.y + note.capHeight + note.size * 0.28;
      ctx.save();
      ctx.fillStyle = ruleColor;
      for (let y = first - Math.floor((first - box.y) / lh) * lh; y <= box.y + box.h; y += lh) ctx.fillRect(Math.round(box.x), Math.round(y), Math.round(box.w), th);
      ctx.restore();
      vrule(ctx, box.x + margin * 0.45, box.y, box.h, th, lc.accent, 0.55);
    },
  };
}

// ---------------------------------------------------------------- post card

export const POST_CARD_LAYOUTS = ["card", "flat"] as const;

/** A clean social post: avatar, name, handle and text. No fake likes or metrics. */
export function composePostCard(lc: LayoutContext, c: QuoteContent, layout: string): Composition {
  const { ref, palette } = lc;
  const card = layout !== "flat";
  const pad = gap(lc, 0.07);
  const box = card ? { ...lc.box, x: lc.box.x + pad, w: lc.box.w - pad * 2, y: lc.box.y + pad, h: lc.box.h - pad * 2 } : lc.box;
  const cardInk = card ? palette.ink : lc.ink;
  const cardMuted = card ? palette.muted : lc.muted;
  const nameFace: FaceRef = { ...lc.pairing.label, weight: Math.max(600, lc.pairing.label.weight) };
  const avatarEm = 2.5;
  const nameSize = ref * 0.032;
  const avatar = { text: "", face: nameFace, color: cardMuted, widthEm: avatarEm, gapEm: 0.55 };
  const specs: BlockSpec[] = [
    { id: "name", role: "label", text: OWNER.name, face: nameFace, color: cardInk, align: "left", size: { fixed: nameSize }, marker: avatar },
    { id: "handle", role: "label", text: OWNER.handle, face: lc.pairing.label, color: cardMuted, align: "left", size: { fixed: nameSize }, gapBefore: nameSize * 0.45, marker: avatar },
    body(lc, "post", str(c, "text"), 1, {
      color: cardInk,
      emColor: card ? palette.accent : lc.accent,
      size: { ratio: 1, min: ref * 0.03, max: ref * 0.062 },
      measure: [18, 44],
      gapBefore: gap(lc, 0.055),
    }),
  ];
  const date = str(c, "date");
  if (date) specs.push(label(lc, "date", date, { color: cardMuted, role: "label", uppercase: false, gapBefore: gap(lc, 0.05), size: { fixed: ref * 0.024 } }));

  const cardRect = (placed: { y: number; h: number }[]) => {
    const top = placed[0].y - pad, last = placed[placed.length - 1];
    return { x: lc.box.x, y: top, w: lc.box.w, h: last.y + last.h - placed[0].y + pad * 2 };
  };
  return {
    stacks: [{ specs, box, valign: "center" }],
    prepaint: (ctx, placed) => {
      if (!card) return;
      const r = cardRect(placed[0]);
      const radius = ref * 0.022;
      ctx.save();
      ctx.fillStyle = palette.dark ? rgbToHex(mixOklab(palette.bg, palette.ink, 0.08)) : "#ffffff";
      ctx.globalAlpha = lc.isPhoto ? 0.97 : 1;
      ctx.beginPath();
      ctx.roundRect(Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h), radius);
      ctx.fill();
      if (!lc.isPhoto && !palette.dark) {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = rgbToHex(mixOklab(palette.bg, palette.ink, 0.18));
        ctx.lineWidth = hairline(ref);
        ctx.stroke();
      }
      ctx.restore();
    },
    decorate: (ctx, placed) => {
      // Avatar: a monogram circle spanning the name and handle lines.
      const [name, handle] = placed[0];
      const D = avatarEm * nameSize;
      const cy = (name.y + handle.y + handle.capHeight) / 2;
      const cx = name.x + D / 2;
      ctx.save();
      ctx.fillStyle = cardInk;
      ctx.beginPath();
      ctx.arc(cx, cy, D / 2, 0, Math.PI * 2);
      ctx.fill();
      const mono = lc.pairing.display;
      const ms = D * 0.4;
      ctx.font = fontString(lc.env, mono, ms);
      const mw = lc.m.width(mono, "FM") * ms;
      // Monogram knocked out of the avatar in the colour behind it.
      ctx.fillStyle = card ? (palette.dark ? rgbToHex(mixOklab(palette.bg, palette.ink, 0.08)) : "#ffffff") : lc.isPhoto ? "#111111" : palette.bg;
      ctx.fillText("FM", cx - mw / 2, cy + (lc.m.metrics(mono).capHeight * ms) / 2);
      ctx.restore();
      return [{ x: cx - D / 2, y: cy - D / 2, w: D, h: D }];
    },
  };
}
