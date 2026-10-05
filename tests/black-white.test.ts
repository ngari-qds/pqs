import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { nodeEnv, newCanvas } from "@/scripts/node-env";
import { luminance } from "@/lib/render/color";
import { greyOf } from "@/lib/render/pixels";
import { renderQuote, type RenderInput } from "@/lib/render/render";
import type { TemplateConfig } from "@/lib/render/template";

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

const render = (template: TemplateConfig, blackWhite: boolean, extra: Partial<RenderInput> = {}) => {
  const { canvas, ctx } = newCanvas(540, 675);
  const report = renderQuote(ctx, env, {
    content: { format: "highlight", text: "We call it *patience* when it is only *fear* with better posture." },
    template,
    signature: { enabled: true, style: "line" },
    blackWhite,
    ...extra,
  });
  return { report, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
};

const colourful: TemplateConfig = { id: "t", name: "t", format: "highlight", layout: "", pairing: "fraunces-inter", palette: "terracotta", background: { kind: "solid" } };
const onPhoto: TemplateConfig = { ...colourful, palette: "deep-teal", background: { kind: "photo-scrim", scrim: "auto" } };

const isGrey = (d: Uint8ClampedArray) => {
  for (let i = 0; i < d.length; i += 4) if (d[i] !== d[i + 1] || d[i] !== d[i + 2]) return false;
  return true;
};

describe("black and white", () => {
  it("leaves colour alone when off", () => {
    expect(isGrey(render(colourful, false).data)).toBe(false);
  });

  it("turns every pixel grey, including photos", () => {
    expect(isGrey(render(colourful, true).data)).toBe(true);
    expect(isGrey(render(onPhoto, true, { photo: photo() }).data)).toBe(true);
  });

  it("keeps the layout and every contrast ratio", () => {
    for (const [t, extra] of [[colourful, {}], [onPhoto, { photo: photo() }]] as const) {
      const colour = render(t, false, extra).report;
      const bw = render(t, true, extra).report;
      expect(bw.blocks.map((b) => b.rect)).toEqual(colour.blocks.map((b) => b.rect));
      expect(bw.blocks.map((b) => b.contrast)).toEqual(colour.blocks.map((b) => b.contrast));
      expect(bw.overflow).toBe(false);
      for (const b of bw.blocks) expect(b.color).toMatch(/^#([0-9a-f]{2})\1\1$/);
    }
  });

  it("maps a colour to the grey of equal luminance", () => {
    for (const c of ["#c2603a", "#1d4f6b", "#f1e4c8", "#000000", "#ffffff"]) {
      expect(Math.abs(luminance(greyOf(c)) - luminance(c))).toBeLessThan(0.004);
    }
  });
});
