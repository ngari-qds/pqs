/**
 * Owner branding. Six signature styles, sized at 1.6–2.2% of canvas height,
 * always inside the safe area, with colour chosen from the actual pixels
 * underneath for contrast. Layouts reserve the space a signature needs, so
 * quote text can never collide with it.
 */
import { contrastFromLuminance, hexToRgb, LINEAR_LUT, luminance } from "./color";
import { hairline, rule } from "./draw";
import { fontString, type Measurer } from "./env";
import type { Palette } from "./palettes";
import type { Pairing } from "./pairings";
import { lumaStats } from "./pixels";
import type { SignatureStyle } from "./template";
import type { Ctx, FaceRef, Rect, RenderEnv } from "./types";

export const OWNER = { name: "Fred M", tag: "1963ke", handle: "@ngariq_" } as const;
export const SIGNATURE_LINE = `${OWNER.name} | ${OWNER.tag}`;
export const SIGNATURE_FULL = `${SIGNATURE_LINE}  ·  ${OWNER.handle}`;

export const SIGNATURE_STYLES: { id: SignatureStyle; name: string }[] = [
  { id: "line", name: "Bottom centred line" },
  { id: "stacked", name: "Bottom-left stacked" },
  { id: "caps", name: "Top-right small caps" },
  { id: "rule", name: "Rule above" },
  { id: "monogram", name: "FM monogram" },
  { id: "vertical", name: "Vertical edge" },
];

export interface Reserve {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface SignatureLayout {
  style: SignatureStyle;
  size: number;
  rect: Rect;
  reserve: Reserve;
  draw(ctx: Ctx, color: string, alpha: number): void;
}

/** Signature size: 1.6% of height on tall canvases up to 2.2% on wide ones. */
export function signatureSize(W: number, H: number): number {
  const aspect = H / W;
  const pts: [number, number][] = [
    [0.5, 0.022],
    [1.0, 0.0195],
    [1.25, 0.018],
    [1.78, 0.016],
  ];
  let f = pts[pts.length - 1][1];
  if (aspect <= pts[0][0]) f = pts[0][1];
  else
    for (let i = 0; i < pts.length - 1; i++) {
      const [a0, f0] = pts[i], [a1, f1] = pts[i + 1];
      if (aspect >= a0 && aspect <= a1) f = f0 + ((aspect - a0) / (a1 - a0)) * (f1 - f0);
    }
  return H * f;
}

export function layoutSignature(
  style: SignatureStyle,
  W: number,
  H: number,
  safe: Rect,
  env: RenderEnv,
  m: Measurer,
  pairing: Pairing,
): SignatureLayout {
  const s = signatureSize(W, H);
  const label: FaceRef = pairing.label;
  const strong: FaceRef = { ...pairing.label, weight: Math.max(pairing.label.weight, 500) };
  const met = m.metrics(label);
  const cap = met.capHeight * s;
  const desc = met.descent * s;
  const gap = Math.max(s * 2.4, H * 0.028);
  const tr = 0.04;
  const textW = (face: FaceRef, t: string, track = tr, size = s) => m.width(face, t, track) * size;
  const right = safe.x + safe.w, bottom = safe.y + safe.h;
  const none: Reserve = { top: 0, bottom: 0, left: 0, right: 0 };

  const text = (ctx: Ctx, face: FaceRef, t: string, x: number, y: number, size: number, track: number, color: string, alpha: number) => {
    ctx.save();
    ctx.font = fontString(env, face, size);
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${(track * size).toFixed(3)}px`;
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(t, x, y);
    ctx.restore();
  };

  switch (style) {
    case "line": {
      const w = textW(label, SIGNATURE_FULL);
      const base = bottom - desc;
      const rect = { x: safe.x + (safe.w - w) / 2, y: base - cap, w, h: cap + desc };
      return {
        style, size: s, rect,
        reserve: { ...none, bottom: rect.h + gap },
        draw: (ctx, c, a) => text(ctx, label, SIGNATURE_FULL, rect.x, base, s, tr, c, a),
      };
    }
    case "stacked": {
      const lh = s * 1.42;
      const w = Math.max(textW(strong, SIGNATURE_LINE), textW(label, OWNER.handle));
      const base2 = bottom - desc;
      const base1 = base2 - lh;
      const rect = { x: safe.x, y: base1 - cap, w, h: lh + cap + desc };
      return {
        style, size: s, rect,
        reserve: { ...none, bottom: rect.h + gap },
        draw: (ctx, c, a) => {
          text(ctx, strong, SIGNATURE_LINE, safe.x, base1, s, tr, c, a);
          text(ctx, label, OWNER.handle, safe.x, base2, s, tr, c, a * 0.82);
        },
      };
    }
    case "caps": {
      const cs = s * 0.88;
      const t = SIGNATURE_FULL.toUpperCase();
      const track = 0.14;
      const w = textW(label, t, track, cs);
      const ccap = met.capHeight * cs;
      const base = safe.y + ccap;
      const rect = { x: right - w, y: safe.y, w, h: ccap };
      return {
        style, size: cs, rect,
        reserve: { ...none, top: rect.h + gap },
        draw: (ctx, c, a) => text(ctx, label, t, rect.x, base, cs, track, c, a),
      };
    }
    case "rule": {
      const w = textW(label, SIGNATURE_FULL);
      const base = bottom - desc;
      const ruleGap = s * 1.1;
      const th = hairline(Math.min(W, H));
      const ruleW = Math.min(w, Math.max(s * 6, w * 0.4));
      const ruleY = base - cap - ruleGap;
      const rect = { x: safe.x + (safe.w - w) / 2, y: ruleY - th, w, h: base + desc - ruleY + th };
      return {
        style, size: s, rect,
        reserve: { ...none, bottom: rect.h + gap },
        draw: (ctx, c, a) => {
          rule(ctx, safe.x + (safe.w - ruleW) / 2, ruleY, ruleW, th, c, a);
          text(ctx, label, SIGNATURE_FULL, rect.x, base, s, tr, c, a);
        },
      };
    }
    case "monogram": {
      const D = s * 2.7;
      const mono: FaceRef = pairing.mono ? pairing.display : { ...pairing.display, style: "normal" };
      const ms = s * 1.05;
      const mm = m.metrics(mono);
      const mw = m.width(mono, "FM", 0.02) * ms;
      const cx = safe.x + D / 2, cy = bottom - D / 2;
      const handleX = safe.x + D + s * 0.75;
      const handleBase = cy + cap / 2;
      const w = D + s * 0.75 + textW(label, OWNER.handle);
      const rect = { x: safe.x, y: bottom - D, w, h: D };
      const th = Math.max(1, Math.round(s * 0.07));
      return {
        style, size: s, rect,
        reserve: { ...none, bottom: rect.h + gap },
        draw: (ctx, c, a) => {
          ctx.save();
          ctx.globalAlpha = a;
          ctx.strokeStyle = c;
          ctx.lineWidth = th;
          ctx.beginPath();
          ctx.arc(cx, cy, D / 2 - th / 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          text(ctx, mono, "FM", cx - mw / 2, cy + (mm.capHeight * ms) / 2, ms, 0.02, c, a);
          text(ctx, label, OWNER.handle, handleX, handleBase, s, tr, c, a);
        },
      };
    }
    case "vertical": {
      const w = textW(label, SIGNATURE_FULL); // runs vertically
      const thickness = cap + desc;
      const x = right - thickness; // left edge of the rotated text's box
      const rect = { x, y: bottom - w, w: thickness, h: w };
      return {
        style, size: s, rect,
        reserve: { ...none, right: thickness + gap },
        draw: (ctx, c, a) => {
          ctx.save();
          // Reads bottom-to-top; baseline sits on the right side of the strip.
          ctx.translate(right - desc, bottom);
          ctx.rotate(-Math.PI / 2);
          text(ctx, label, SIGNATURE_FULL, 0, 0, s, tr, c, a);
          ctx.restore();
        },
      };
    }
  }
}

/** sRGB grey level whose luminance equals L (inverse of the WCAG curve). */
const greyForLuminance = (L: number) => {
  let lo = 0, hi = 255;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (LINEAR_LUT[mid] < L) lo = mid;
    else hi = mid;
  }
  return hi;
};

/**
 * Picks a light or dark ink and an opacity in [0.60, 0.85] from the pixels
 * under the signature, preferring the lowest opacity that reaches 4.5:1.
 */
export function chooseSignatureInk(ctx: Ctx, rect: Rect, palette: Palette, pad: number) {
  const st = lumaStats(ctx, { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 });
  const light = palette.dark ? palette.ink : "#f4f1ea";
  const dark = palette.dark ? "#141414" : palette.ink;
  // Worst case uses the extremes; blend against the median as background.
  const score = (ink: string, alpha: number) => {
    const g = greyForLuminance(st.p50);
    const [r, gg, b] = hexToRgb(ink);
    const Lm = luminance([r * alpha + g * (1 - alpha), gg * alpha + g * (1 - alpha), b * alpha + g * (1 - alpha)]);
    return Math.min(contrastFromLuminance(Lm, st.p02), contrastFromLuminance(Lm, st.p98));
  };
  const ink = score(light, 0.85) >= score(dark, 0.85) ? light : dark;
  let alpha = 0.6;
  while (alpha < 0.85 && score(ink, alpha) < 4.5) alpha += 0.05;
  alpha = Math.min(0.85, alpha);
  return { color: ink, alpha, contrast: score(ink, alpha) };
}
