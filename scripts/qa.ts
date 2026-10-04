/**
 * Automated QA. Renders every template in templates/*.json at every export
 * preset (default 3x) with short, medium and long sample text, cycling all six
 * signature styles, and fails if:
 *   - text overflows its box or leaves the safe area
 *   - any text block is below WCAG 4.5:1 against the pixels behind it
 *   - text or decorations collide with the signature
 *   - a photo is upscaled
 *   npm run qa                 (3x, all presets)
 *   npm run qa -- --scale 1    (faster)
 */
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MIN_CONTRAST, renderQuote, type TemplateConfig } from "../lib/render";
import { PRESETS } from "../lib/render/presets";
import { newCanvas, nodeEnv } from "./node-env";

const args = process.argv.slice(2);
const scale = Number(args[args.indexOf("--scale") + 1]) || 3;
const keep = args.includes("--keep");
const root = path.resolve(import.meta.dirname, "..");

const TEXTS = {
  short: "Silence is not empty.",
  medium: "Most people don't want the truth. They want a *quieter* version of it they can live next to.",
  long: "The city does not care about your plans, and that is its gift. Nobody is watching closely enough to stop you, and nobody is coming to save you either. Walk anyway; the streets were built by people who stopped waiting for permission.",
};
const STYLES = ["line", "stacked", "caps", "rule", "monogram", "vertical"] as const;

async function loadTemplates(): Promise<TemplateConfig[]> {
  const dir = path.join(root, "templates");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const all: TemplateConfig[] = [];
  for (const f of files) all.push(...JSON.parse(await readFile(path.join(dir, f), "utf8")));
  return all;
}

async function main() {
  const env = nodeEnv();
  const templates = await loadTemplates();
  const failures: string[] = [];
  let runs = 0, worst = Infinity;
  const t0 = Date.now();
  if (keep) await mkdir(path.join(root, "qa-report"), { recursive: true });

  for (const [ti, t] of templates.entries()) {
    for (const p of PRESETS) {
      for (const [ki, [kind, text]] of Object.entries(TEXTS).entries()) {
        const style = STYLES[(ti + ki) % STYLES.length];
        const { canvas, ctx } = newCanvas(p.width * scale, p.height * scale);
        const r = renderQuote(ctx, env, {
          content: { format: t.format, text, author: ki === 1 ? "Fred M" : undefined },
          template: t,
          signature: { enabled: true, style },
        });
        runs++;
        const id = `${t.id} @ ${p.id} ${canvas.width}x${canvas.height} [${kind}, sig:${style}]`;
        const problems: string[] = [];
        if (r.overflow) problems.push("text overflow");
        problems.push(...r.collisions);
        if (r.upscaled) problems.push(`photo upscaled (${r.photoScale?.toFixed(2)}x)`);
        for (const b of r.blocks) {
          worst = Math.min(worst, b.contrast);
          if (b.contrast < MIN_CONTRAST) problems.push(`${b.id} contrast ${b.contrast.toFixed(2)}:1`);
        }
        if (r.signature && r.signature.contrast < 3) problems.push(`signature contrast ${r.signature.contrast.toFixed(2)}:1`);
        if (problems.length) failures.push(`${id}: ${problems.join("; ")}`);
        if (keep) await writeFile(path.join(root, "qa-report", `${t.id}_${p.id}_${kind}.png`), canvas.toBuffer("image/png"));
      }
    }
    process.stdout.write(`  ${t.id.padEnd(32)} ok\n`);
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n${runs} renders at ${scale}x in ${secs}s · lowest text contrast ${worst.toFixed(2)}:1`);
  if (failures.length) {
    console.error(`\nFAILED (${failures.length}):\n` + failures.map((f) => "  ✗ " + f).join("\n"));
    process.exit(1);
  }
  console.log("QA passed: no overflow, no collisions, contrast ≥ 4.5:1 everywhere, no upscaling.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
