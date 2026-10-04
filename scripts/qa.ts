/**
 * Automated QA. Renders every template in templates/*.json at every export
 * preset (default 3x) with short, medium and long sample text, cycling all six
 * signature styles, and fails if:
 *   - text overflows its box or leaves the safe area
 *   - any text block is below WCAG 4.5:1 against the pixels behind it
 *   - text or decorations collide with the signature
 *   - a photo is upscaled
 *
 *   npm run qa                         3x, all presets
 *   npm run qa -- --scale 1            faster pass
 *   npm run qa -- --keep               also write PNGs to qa-report/
 *   npm run qa -- --only classic-ink   filter templates by id substring
 */
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TemplateConfig } from "../lib/render/template";
import { PRESETS } from "../lib/render/presets";
import type { WorkerJob, WorkerResult } from "./qa-worker";

const args = process.argv.slice(2);
const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const scale = Number(flag("--scale")) || 3;
const only = flag("--only");
const root = path.resolve(import.meta.dirname, "..");
const keepDir = args.includes("--keep") ? path.join(root, "qa-report") : undefined;
const parallel = Math.max(1, Math.min(4, os.cpus().length - 1));

async function loadTemplates(): Promise<TemplateConfig[]> {
  const dir = path.join(root, "templates");
  const all: TemplateConfig[] = [];
  for (const f of (await readdir(dir)).filter((f) => f.endsWith(".json")).sort())
    all.push(...JSON.parse(await readFile(path.join(dir, f), "utf8")));
  return only ? all.filter((t) => t.id.includes(only)) : all;
}

function runWorker(job: WorkerJob): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", path.join(import.meta.dirname, "qa-worker.ts"), JSON.stringify(job)], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`worker for ${job.template.id} @ ${job.preset} exited with ${code}`));
      resolve(JSON.parse(out));
    });
  });
}

async function main() {
  const templates = await loadTemplates();
  const jobs: WorkerJob[] = templates.flatMap((template, templateIndex) =>
    PRESETS.map((p) => ({ template, templateIndex, preset: p.id, scale, keepDir })),
  );
  const t0 = Date.now();
  const failures: string[] = [];
  let runs = 0, worst = Infinity, done = 0;
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: parallel }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const r = await runWorker(job);
        runs += r.runs;
        worst = Math.min(worst, r.worst);
        failures.push(...r.failures);
        done++;
        process.stdout.write(`  [${String(done).padStart(3)}/${jobs.length}] ${job.template.id} @ ${job.preset}  ${r.failures.length ? "FAIL" : "ok"}  ${(r.ms / 1000).toFixed(1)}s\n`);
      }
    }),
  );

  console.log(`\n${runs} renders of ${templates.length} templates at ${scale}x in ${((Date.now() - t0) / 1000).toFixed(1)}s · lowest text contrast ${worst.toFixed(2)}:1`);
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
