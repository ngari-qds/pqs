/**
 * Renders every quote in public/quotes/cold-quotes.txt with its format's
 * first hero template at Stories and Instagram portrait (1x) and reports any
 * that overflow, need a fallback, or sit at the minimum type size.
 *   npx tsx scripts/check-quotes.ts
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderQuote } from "../lib/render";
import { slideCount } from "../lib/render/formats";
import { getPreset } from "../lib/render/presets";
import type { TemplateConfig } from "../lib/render/template";
import { parseBatch } from "../lib/studio/batch";
import { newCanvas, nodeEnv } from "./node-env";

const root = path.resolve(import.meta.dirname, "..");
const env = nodeEnv();
const heroes: TemplateConfig[] = ["classic", "hbp", "carousel", "one-liner", "highlight", "contrast", "myth-truth", "then-now", "paradox", "list", "qa", "definition", "equation", "stat", "law", "dialogue", "stanza", "field-note", "post-card", "pull-quote"].map(
  (f) => JSON.parse(readFileSync(path.join(root, "templates", `${f}.json`), "utf8")).find((t: TemplateConfig) => !t.background.kind.startsWith("photo")),
);
const items = parseBatch(readFileSync(path.join(root, "public/quotes/cold-quotes.txt"), "utf8"));
const CHUNK = 60;
const range = process.env.CHECK_RANGE;

if (!range) {
  // Parent: run chunks in short-lived processes (Skia's Node bindings leak
  // readback memory), then summarise.
  let problems = 0;
  for (let from = 0; from < items.length; from += CHUNK) {
    const r = spawnSync(process.execPath, ["--import", "tsx", import.meta.filename], { env: { ...process.env, CHECK_RANGE: `${from}:${from + CHUNK}` }, encoding: "utf8" });
    process.stdout.write(r.stdout);
    if (r.status !== 0 && r.status !== 1) throw new Error(`chunk ${from} crashed: ${r.stderr}`);
    problems += (r.stdout.match(/^ {2}line /gm) ?? []).length;
  }
  console.log(`${items.length} quotes checked at Stories and Instagram portrait, ${problems} issue(s).`);
  process.exit(problems ? 1 : 0);
}

// Child: check one range at half resolution (layout is resolution-independent).
const [from, to] = range.split(":").map(Number);
let problems = 0;
for (const item of items.slice(from, to)) {
  const t = heroes.find((h) => h.format === item.content.format)!;
  for (const pid of ["status", "ig-portrait"]) {
    const p = getPreset(pid);
    for (let s = 0; s < slideCount(item.content); s++) {
      const { ctx } = newCanvas(p.width / 2, p.height / 2);
      const r = renderQuote(ctx, env, { content: { ...item.content, slide: s }, template: t, signature: { enabled: true, style: "line" } });
      const main = r.blocks.reduce((a, b) => (b.size > a.size ? b : a), r.blocks[0]);
      const issue = r.overflow ? "OVERFLOW" : r.fallback ? `fallback: ${r.fallback}` : main?.atMin ? "at minimum size" : r.collisions.length ? r.collisions.join("; ") : null;
      if (issue) {
        problems++;
        console.log(`  line ${item.line} (${item.content.format}, ${pid}${slideCount(item.content) > 1 ? `, slide ${s + 1}` : ""}): ${issue}`);
      }
    }
  }
}
process.exit(problems ? 1 : 0);
