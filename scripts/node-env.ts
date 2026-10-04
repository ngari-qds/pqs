/** Node rendering environment (QA + samples) backed by Skia via @napi-rs/canvas. */
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import path from "node:path";
import { FONT_FAMILIES, fontFile } from "../lib/fonts/registry";
import type { CanvasLike, Ctx, RenderEnv } from "../lib/render/types";

let registered = false;
export function registerFonts() {
  if (registered) return;
  const dir = path.resolve(import.meta.dirname, "../assets/fonts");
  for (const fam of FONT_FAMILIES)
    for (const face of fam.faces) {
      const ok = GlobalFonts.registerFromPath(path.join(dir, fontFile(fam, face)), fam.family);
      if (!ok) throw new Error(`Failed to register ${fontFile(fam, face)}`);
    }
  registered = true;
}

export function nodeEnv(): RenderEnv {
  registerFonts();
  return {
    createCanvas: (w, h) => createCanvas(w, h) as unknown as CanvasLike,
    fontFamily: (family) => `"${family}"`,
  };
}

export function newCanvas(w: number, h: number) {
  const canvas = createCanvas(w, h);
  return { canvas, ctx: canvas.getContext("2d") as unknown as Ctx };
}
