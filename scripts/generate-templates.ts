/**
 * Builds templates/gallery.json: ranks rule-passing combinations per format
 * (lib/templates/generator.ts), renders every candidate at every preset, and
 * keeps the best ones that pass QA and set comfortably on phone formats.
 *   npm run templates
 */
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FORMAT_LIST } from "../lib/render/formats";
import type { TemplateConfig } from "../lib/render/template";
import { QUOTA, newGlobalUse, rankFormat, totalCombinations, validCombos } from "../lib/templates/generator";
import { ensureMockPhotos } from "./mock-photos";
import type { VerifyResult } from "./verify-worker";

/** Every gallery template must set comfortably on these. */
const REQUIRED = ["ig-portrait", "status", "square"];
const RESERVE = 2.6;
const BATCH = 16;
const root = path.resolve(import.meta.dirname, "..");

function verify(batch: TemplateConfig[]): Promise<VerifyResult[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--expose-gc", "--import", "tsx", path.join(import.meta.dirname, "verify-worker.ts")], { stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("exit", (code) => (code === 0 ? resolve(JSON.parse(out)) : reject(new Error(`verify worker exited ${code}`))));
    child.stdin.end(JSON.stringify(batch));
  });
}

async function main() {
  await ensureMockPhotos();
  const t0 = Date.now();
  const global = newGlobalUse();
  const candidates = FORMAT_LIST.map((f) => ({ f: f.id, list: rankFormat(f.id, Math.ceil(QUOTA[f.id] * RESERVE), global) }));
  const all = candidates.flatMap((c) => c.list);
  const valid = FORMAT_LIST.reduce((n, f) => n + validCombos(f.id).length, 0);
  console.log(`${totalCombinations()} combinations, ${valid} pass the rules, verifying ${all.length} ranked candidates…`);

  const batches: TemplateConfig[][] = [];
  for (let i = 0; i < all.length; i += BATCH) batches.push(all.slice(i, i + BATCH));
  const results = new Map<string, VerifyResult>();
  const parallel = Math.max(1, Math.min(3, os.cpus().length - 1));
  let done = 0;
  await Promise.all(
    Array.from({ length: parallel }, async () => {
      for (let b = batches.shift(); b; b = batches.shift()) {
        for (const r of await verify(b)) results.set(r.id, r);
        done += b.length;
        process.stdout.write(`\r  verified ${done}/${all.length}`);
      }
    }),
  );
  process.stdout.write("\n");

  const gallery: TemplateConfig[] = [];
  const rejected: Record<string, number> = {};
  for (const { f, list } of candidates) {
    const keep: TemplateConfig[] = [];
    // Photos are a supporting act: at most 40% of each format's gallery.
    const photoCap = Math.round(QUOTA[f] * 0.4);
    let photos = 0;
    for (const t of list) {
      if (keep.length >= QUOTA[f]) break;
      const isPhoto = t.background.kind.startsWith("photo");
      if (isPhoto && photos >= photoCap) continue;
      const r = results.get(t.id)!;
      const reason = !r.ok ? "fails QA" : !REQUIRED.every((p) => r.comfortable.includes(p)) ? "cramped on a phone format" : null;
      if (reason) {
        rejected[reason] = (rejected[reason] ?? 0) + 1;
        if (!r.ok) console.log(`  rejected ${t.id}: ${r.problems.slice(0, 2).join("; ")}`);
        continue;
      }
      keep.push({ ...t, presets: r.comfortable });
      if (isPhoto) photos++;
    }
    if (keep.length < QUOTA[f]) console.warn(`  ! ${f}: only ${keep.length}/${QUOTA[f]} passed`);
    gallery.push(...keep);
  }
  const body = "[\n" + gallery.map((t) => "  " + JSON.stringify(t)).join(",\n") + "\n]\n";
  await writeFile(path.join(root, "templates/gallery.json"), body);
  console.log(`Wrote ${gallery.length} gallery templates (rejected while filling: ${JSON.stringify(rejected)}) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
