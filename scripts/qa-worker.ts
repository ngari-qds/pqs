/**
 * QA worker: renders one (template, preset) group and prints a JSON result.
 * Runs in its own short-lived process because Skia's Node bindings leak the
 * native memory behind getImageData; process exit hands it back.
 */
import { MIN_CONTRAST, renderQuote, type TemplateConfig } from "../lib/render";
import { getPreset } from "../lib/render/presets";
import { newCanvas, nodeEnv } from "./node-env";
import { QA_TEXTS, QA_STYLES } from "./qa-config";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export interface WorkerJob {
  template: TemplateConfig;
  templateIndex: number;
  preset: string;
  scale: number;
  keepDir?: string;
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

Object.entries(QA_TEXTS).forEach(([kind, text], ki) => {
  const style = QA_STYLES[(job.templateIndex + ki) % QA_STYLES.length];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const r = renderQuote(ctx, env, {
    content: { format: t.format, text, author: ki === 1 ? "Fred M" : undefined },
    template: t,
    signature: { enabled: true, style },
  });
  out.runs++;
  const problems: string[] = [];
  if (r.overflow) problems.push("text overflow");
  problems.push(...r.collisions);
  if (r.upscaled) problems.push(`photo upscaled (${r.photoScale?.toFixed(2)}x)`);
  for (const b of r.blocks) {
    out.worst = Math.min(out.worst, b.contrast);
    if (b.contrast < MIN_CONTRAST) problems.push(`${b.id} contrast ${b.contrast.toFixed(2)}:1`);
  }
  if (r.signature && r.signature.contrast < 3) problems.push(`signature contrast ${r.signature.contrast.toFixed(2)}:1`);
  if (problems.length) out.failures.push(`${t.id} @ ${p.id} ${canvas.width}x${canvas.height} [${kind}, sig:${style}]: ${problems.join("; ")}`);
  if (job.keepDir) {
    mkdirSync(job.keepDir, { recursive: true });
    writeFileSync(path.join(job.keepDir, `${t.id}_${p.id}_${kind}.png`), canvas.toBuffer("image/png"));
  }
});
out.ms = Date.now() - t0;
process.stdout.write(JSON.stringify(out));
