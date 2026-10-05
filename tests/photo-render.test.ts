import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { nodeEnv, newCanvas } from "@/scripts/node-env";
import { drawPhotoCover, type PhotoInput } from "@/lib/render/photo";
import { renderQuote, type RenderInput } from "@/lib/render/render";
import type { BackgroundConfig, TemplateConfig } from "@/lib/render/template";
import { intersects, type Ctx } from "@/lib/render/types";

const env = nodeEnv();

/** A synthetic "photo": vertical gradient with some structure. */
function photo(w: number, h: number): PhotoInput {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#9fb0bf");
  g.addColorStop(1, "#2b3540");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#e8e2d4";
  ctx.fillRect(w * 0.6, h * 0.2, w * 0.1, h * 0.5);
  return { image: c, credit: { name: "Ana Example", source: "Unsplash" } };
}

const template = (background: BackgroundConfig, layout: TemplateConfig["layout"] = "bottom"): TemplateConfig => ({
  id: "t", name: "t", format: "classic", layout, pairing: "fraunces-inter", palette: "ink", background,
});

const render = (input: Partial<RenderInput> & { template: TemplateConfig }, w = 1080, h = 1350) => {
  const { ctx } = newCanvas(w, h);
  return renderQuote(ctx, env, {
    content: { format: "classic", text: "Most people don't want the truth. They want a quieter version of it." },
    signature: { enabled: true, style: "line" },
    ...input,
  });
};

describe("photo placement", () => {
  it("flags an upscaled photo and accepts a large one", () => {
    const { ctx } = newCanvas(1080, 1350);
    expect(drawPhotoCover(ctx as Ctx, env, photo(800, 1000), { x: 0, y: 0, w: 1080, h: 1350 }).upscaled).toBe(true);
    const big = drawPhotoCover(ctx as Ctx, env, photo(4000, 5000), { x: 0, y: 0, w: 1080, h: 1350 });
    expect(big.upscaled).toBe(false);
    expect(big.scale).toBeGreaterThan(3);
  });

  it("reports upscaling through the full render (QA hook)", () => {
    expect(render({ template: template({ kind: "photo-scrim" }), photo: photo(900, 1100) }).upscaled).toBe(true);
    expect(render({ template: template({ kind: "photo-scrim" }), photo: photo(2400, 3000) }).upscaled).toBe(false);
  });

  it("falls back to a generated background when no photo is available", () => {
    const r = render({ template: template({ kind: "photo-duotone" }) });
    expect(r.photoUsed).toBe(false);
    expect(r.background).toBe("gradient");
  });

  for (const kind of ["photo-scrim", "photo-mono-tint", "photo-duotone", "photo-blur"] as const) {
    it(`${kind}: text passes 4.5:1 on the photo`, () => {
      const r = render({ template: template({ kind }), photo: photo(2400, 3000) });
      expect(r.photoUsed).toBe(true);
      for (const b of r.blocks) expect(b.contrast).toBeGreaterThanOrEqual(4.5);
      expect(r.collisions).toEqual([]);
    });
  }

  for (const kind of ["photo-split", "photo-frame"] as const) {
    it(`${kind}: keeps text off the photo`, () => {
      for (const [w, h] of [[1080, 1920], [1200, 675]]) {
        const r = render({ template: template({ kind }, "editorial"), photo: photo(4000, 5000) }, w, h);
        expect(r.overflow).toBe(false);
        expect(r.collisions).toEqual([]);
        // The photo occupies the top (portrait) or left (landscape); text must be outside it.
        const q = r.blocks[0].rect;
        if (h > w) expect(q.y).toBeGreaterThan(h * 0.45);
        else expect(q.x).toBeGreaterThan(w * 0.4);
      }
    });
  }

  it("draws the photo credit in the margin without collisions", () => {
    for (const style of ["line", "stacked", "caps", "rule", "monogram", "vertical"] as const) {
      const r = render({ template: template({ kind: "photo-scrim" }), photo: photo(2400, 3000), showCredit: true, signature: { enabled: true, style } });
      expect(r.credit?.text).toBe("Photo: Ana Example / Unsplash");
      expect(r.collisions).toEqual([]);
      expect(intersects(r.credit!.rect, r.safe)).toBe(false);
    }
  }, 20_000);
});
