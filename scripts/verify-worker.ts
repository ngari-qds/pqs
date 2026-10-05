/**
 * Verification worker for the template generator: renders each template at
 * every preset (1x) with the format's sample and a long variant, and reports
 * hard failures plus the presets where the sample sets comfortably.
 * Reads a JSON array of templates on stdin; writes JSON results to stdout.
 * Short-lived on purpose (Skia's Node bindings leak getImageData memory).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createCanvas, loadImage, type Canvas, type Image } from "@napi-rs/canvas";
import { MIN_CONTRAST, renderQuote, type TemplateConfig } from "../lib/render";
import { PRESETS } from "../lib/render/presets";
import { coversTarget } from "../lib/images/resolution";
import { newCanvas, nodeEnv } from "./node-env";
import { QA_STYLES, qaContent } from "./qa-config";

export interface VerifyResult {
  id: string;
  ok: boolean;
  problems: string[];
  comfortable: string[];
}

const env = nodeEnv();
const SCALE = 0.5;
const templates: TemplateConfig[] = JSON.parse(readFileSync(0, "utf8"));
const mockDir = path.resolve(import.meta.dirname, "../.mock-photos");
const manifest: { file: string; width: number; height: number }[] = JSON.parse(readFileSync(path.join(mockDir, "manifest.json"), "utf8"));
const hard = ["fog-field.jpg", "stone-wall.jpg", "night-city.jpg", "sea-horizon.jpg"];
// Half-size verification only needs ~2000px photos: downsized once and cached,
// which keeps each worker's memory small.
const images = new Map<string, Image | Canvas>();
const photoFor = async (w: number, h: number, i: number) => {
  const fits = hard.map((f) => manifest.find((m) => m.file === f)!).filter((m) => coversTarget(m, { width: w, height: h }));
  const m = fits[i % fits.length];
  if (!images.has(m.file)) {
    const full = await loadImage(path.join(mockDir, m.file));
    const s = 2000 / Math.max(full.width, full.height);
    const c = createCanvas(Math.round(full.width * s), Math.round(full.height * s));
    const x = c.getContext("2d");
    x.imageSmoothingQuality = "high";
    x.drawImage(full, 0, 0, c.width, c.height);
    images.set(m.file, c);
  }
  return { image: images.get(m.file)!, credit: { name: "Test", source: "Test" } };
};
const gc = (globalThis as { gc?: () => void }).gc;

const results: VerifyResult[] = [];
for (const [ti, t] of templates.entries()) {
  const problems: string[] = [];
  const comfortable: string[] = [];
  const isPhoto = t.background.kind.startsWith("photo");
  const contents = qaContent(t.format).filter((c) => c.kind !== "short");
  // Layout is resolution-independent, so verify at half size; "print" has the
  // same 4:5 shape as Instagram portrait and inherits its result.
  for (const [pi, p] of PRESETS.filter((x) => x.id !== "print").entries()) {
    const W = Math.round(p.width * SCALE), H = Math.round(p.height * SCALE);
    const { ctx } = newCanvas(W, H);
    let comfy = true;
    for (const [ci, { kind, content }] of contents.entries()) {
      const r = renderQuote(ctx, env, {
        content: { ...content, slide: 0 },
        template: t,
        signature: { enabled: true, style: QA_STYLES[(ti + pi + ci) % QA_STYLES.length] },
        photo: isPhoto ? await photoFor(W, H, ti + pi + ci) : undefined,
      });
      const tag = `${p.id}/${kind}`;
      if (r.overflow) problems.push(`${tag}: overflow`);
      for (const c of r.collisions) problems.push(`${tag}: ${c}`);
      for (const b of r.blocks) if (b.contrast < MIN_CONTRAST) problems.push(`${tag}: ${b.id} contrast ${b.contrast.toFixed(2)}`);
      if (r.signature && r.signature.contrast < 3) problems.push(`${tag}: signature contrast`);
      if (r.upscaled) problems.push(`${tag}: upscaled`);
      // Comfort: the sample sets without any fallback and its main text is above the minimum.
      if (kind === "sample") {
        const main = r.blocks.reduce((a, b) => (b.size > a.size ? b : a), r.blocks[0]);
        if (r.fallback || main?.atMin) comfy = false;
      }
    }
    if (comfy) comfortable.push(p.id);
    if (comfy && p.id === "ig-portrait") comfortable.push("print");
  }
  results.push({ id: t.id, ok: problems.length === 0, problems, comfortable });
  gc?.();
}
process.stdout.write(JSON.stringify(results));
