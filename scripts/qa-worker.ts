/**
 * QA worker: renders one (template, preset) group and prints a JSON result.
 * Runs in its own short-lived process because Skia's Node bindings leak the
 * native memory behind getImageData; process exit hands it back.
 */
import { MIN_CONTRAST, renderQuote, type TemplateConfig } from "../lib/render";
import { getPreset } from "../lib/render/presets";
import { newCanvas, nodeEnv } from "./node-env";
import { QA_STYLES, qaContent } from "./qa-config";
import { slideCount } from "../lib/render/formats";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadImage } from "@napi-rs/canvas";
import type { PhotoInput } from "../lib/render/photo";
import { coversTarget } from "../lib/images/resolution";
import { contrastFromLuminance } from "../lib/render/color";
import { lumaStats } from "../lib/render/pixels";
import type { Tone } from "../lib/render/tone";

export interface WorkerJob {
  template: TemplateConfig;
  templateIndex: number;
  preset: string;
  scale: number;
  keepDir?: string;
  tone?: Tone;
}
export interface WorkerResult {
  runs: number;
  worst: number;
  failures: string[];
  ms: number;
}

const job: WorkerJob = JSON.parse(process.argv[2]);
const env = nodeEnv();
const p = getPreset(job.preset);
const t = job.template;
const { canvas, ctx } = newCanvas(p.width * job.scale, p.height * job.scale);
const out: WorkerResult = { runs: 0, worst: Infinity, failures: [], ms: 0 };
const t0 = Date.now();

// Photo templates are tested against the hardest mock photos that are large
// enough for this export (the app rejects smaller ones before rendering).
const PHOTO_ORDER = ["fog-field.jpg", "stone-wall.jpg", "night-city.jpg", "desert-dunes.jpg", "sea-horizon.jpg", "concrete-stairs.jpg", "dark-forest.jpg"];
const mockDir = path.resolve(import.meta.dirname, "../.mock-photos");
const manifest: { file: string; width: number; height: number; author: string }[] = JSON.parse(readFileSync(path.join(mockDir, "manifest.json"), "utf8"));
const fitting = PHOTO_ORDER.map((f) => manifest.find((m) => m.file === f)!).filter((m) => m && coversTarget(m, { width: canvas.width, height: canvas.height }));
const isPhoto = t.background.kind.startsWith("photo");
if (isPhoto && !fitting.length) throw new Error(`No mock photo covers ${canvas.width}x${canvas.height}`);

// Generated gallery templates: the sample (required) and the long stress text.
const variants = qaContent(t.format).filter((v) => t.hero !== false || v.kind !== "short");
for (const [ki, { kind, content }] of variants.entries()) {
  let photo: PhotoInput | undefined;
  let photoName = "";
  if (isPhoto) {
    const m = fitting[(job.templateIndex + ki) % fitting.length];
    photo = { image: await loadImage(path.join(mockDir, m.file)), credit: { name: m.author, source: "Test" } };
    photoName = `, photo:${m.file}`;
  }
  const style = QA_STYLES[(job.templateIndex + ki) % QA_STYLES.length];
  // Every slide of a carousel is checked.
  for (let slide = 0; slide < slideCount(content); slide++) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const r = renderQuote(ctx, env, {
      content: { ...content, slide },
      template: t,
      signature: { enabled: true, style },
      photo,
      showCredit: isPhoto && ki === 2,
      tone: job.tone,
    });
    out.runs++;
    const problems: string[] = [];
    if (r.overflow) problems.push("text overflow");
    problems.push(...r.collisions);
    if (r.upscaled) problems.push(`photo upscaled (${r.photoScale?.toFixed(2)}x)`);
    if (isPhoto && !r.photoUsed) problems.push("photo not used");
    for (const b of r.blocks) {
      out.worst = Math.min(out.worst, b.contrast);
      if (b.contrast < MIN_CONTRAST) problems.push(`${b.id} contrast ${b.contrast.toFixed(2)}:1`);
    }
    // Black and white modes change pixels after layout (grain, vignette,
    // dither): re-read the contrast under every block from the finished image.
    if (job.tone && job.tone !== "color") {
      for (const b of r.blocks) {
        const st = lumaStats(ctx, b.rect);
        const c = contrastFromLuminance(st.p02, st.p98);
        out.worst = Math.min(out.worst, c);
        if (c < MIN_CONTRAST) problems.push(`${b.id} finished contrast ${c.toFixed(2)}:1`);
      }
    }
    if (r.signature && r.signature.contrast < 3) problems.push(`signature contrast ${r.signature.contrast.toFixed(2)}:1`);
    const slideTag = slideCount(content) > 1 ? ` slide ${slide + 1}` : "";
    if (problems.length) out.failures.push(`${t.id} @ ${p.id} ${canvas.width}x${canvas.height} [${kind}${slideTag}, sig:${style}${photoName}]: ${problems.join("; ")}`);
    if (job.keepDir) {
      mkdirSync(job.keepDir, { recursive: true });
      writeFileSync(path.join(job.keepDir, `${t.id}_${p.id}_${kind}${slideTag.replace(" slide ", "_s")}.png`), canvas.toBuffer("image/png"));
    }
  }
}
out.ms = Date.now() - t0;
process.stdout.write(JSON.stringify(out));
