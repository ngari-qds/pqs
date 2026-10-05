import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { nodeEnv, newCanvas } from "@/scripts/node-env";
import { contrastFromLuminance, luminance } from "@/lib/render/color";
import { PALETTES } from "@/lib/render/palettes";
import { greyOf, lumaStats } from "@/lib/render/pixels";
import { renderQuote, type RenderInput } from "@/lib/render/render";
import type { TemplateConfig } from "@/lib/render/template";
import { tonePalette, type Tone } from "@/lib/render/tone";
import type { Ctx } from "@/lib/render/types";

const env = nodeEnv();

const photo = () => {
  const c = createCanvas(1400, 1800);
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 1400, 1800);
  g.addColorStop(0, "#c2603a");
  g.addColorStop(1, "#1d4f6b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1400, 1800);
  return { image: c };
};

const render = (template: TemplateConfig, tone: Tone, extra: Partial<RenderInput> = {}) => {
  const { canvas, ctx } = newCanvas(540, 675);
  const report = renderQuote(ctx, env, {
    content: { format: "highlight", text: "We call it *patience* when it is only *fear* with better posture." },
    template,
    signature: { enabled: true, style: "line" },
    tone,
    ...extra,
  });
  return { report, ctx: ctx as unknown as Ctx, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
};

const light: TemplateConfig = { id: "t", name: "t", format: "highlight", layout: "", pairing: "fraunces-inter", palette: "sandstone", background: { kind: "solid" } };
const dark: TemplateConfig = { ...light, palette: "terracotta" };
const onPhoto: TemplateConfig = { ...light, palette: "deep-teal", background: { kind: "photo-scrim", scrim: "auto" } };
const cases = [
  ["light", light, {}],
  ["dark", dark, {}],
  ["photo", onPhoto, { photo: photo() }],
] as const;

const isGrey = (d: Uint8ClampedArray) => {
  for (let i = 0; i < d.length; i += 4) if (d[i] !== d[i + 1] || d[i] !== d[i + 2]) return false;
  return true;
};
const levels = (d: Uint8ClampedArray) => {
  const s = new Set<number>();
  for (let i = 0; i < d.length; i += 4) s.add(d[i]);
  return s;
};
/** Contrast read back from the finished pixels under each text block. */
const finishedContrast = (ctx: Ctx, rects: { x: number; y: number; w: number; h: number }[]) =>
  rects.map((r) => {
    const st = lumaStats(ctx, r);
    return contrastFromLuminance(st.p02, st.p98);
  });

describe("tones", () => {
  it("leaves colour alone by default", () => {
    expect(isGrey(render(dark, "color").data)).toBe(false);
  });

  for (const [name, t, extra] of cases) {
    it(`mono (${name}): neutral greys, same layout, readable after grain and vignette`, () => {
      const colour = render(t, "color", extra).report;
      const { report, ctx, data } = render(t, "mono", extra);
      expect(isGrey(data)).toBe(true);
      expect(levels(data).size).toBeGreaterThan(20);
      expect(report.overflow).toBe(false);
      expect(report.blocks.map((b) => b.id)).toEqual(colour.blocks.map((b) => b.id));
      for (const c of finishedContrast(ctx, report.blocks.map((b) => b.rect))) expect(c).toBeGreaterThanOrEqual(4.5);
    });

    it(`pure (${name}): only black and white, type stays readable`, () => {
      const { report, ctx, data } = render(t, "pure", extra);
      expect([...levels(data)].sort((a, b) => a - b)).toEqual([0, 255]);
      expect(report.overflow).toBe(false);
      for (const c of finishedContrast(ctx, report.blocks.map((b) => b.rect))) expect(c).toBeGreaterThan(15);
    });
  }

  it("mono palettes keep ink and muted at 7:1, accent at 4.5:1", () => {
    for (const p of PALETTES) {
      const m = tonePalette(p, "mono");
      for (const c of [m.bg, m.bg2, m.ink, m.muted, m.accent]) expect(c).toMatch(/^#([0-9a-f]{2})\1\1$/);
      const L = luminance(m.bg);
      expect(contrastFromLuminance(luminance(m.ink), L), p.id).toBeGreaterThanOrEqual(7);
      expect(contrastFromLuminance(luminance(m.muted), L), p.id).toBeGreaterThanOrEqual(7);
      expect(contrastFromLuminance(luminance(m.accent), L), p.id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("pure palettes are black on white or white on black", () => {
    for (const p of PALETTES) {
      const m = tonePalette(p, "pure");
      expect(new Set([m.bg, m.ink])).toEqual(new Set(["#000000", "#ffffff"]));
      expect(m.muted).toBe(m.ink);
    }
  });

  it("maps a colour to the grey of equal luminance", () => {
    for (const c of ["#c2603a", "#1d4f6b", "#f1e4c8", "#000000", "#ffffff"]) {
      expect(Math.abs(luminance(greyOf(c)) - luminance(c))).toBeLessThan(0.004);
    }
  });
});
