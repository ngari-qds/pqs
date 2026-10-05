/** Counts quotes per collection file and reports parse errors and duplicates. */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseBatch } from "../lib/studio/batch";

const root = path.resolve(import.meta.dirname, "../public/quotes");
const files = ["cold-quotes.txt", ...readdirSync(path.join(root, "formats")).sort().map((f) => `formats/${f}`)];
const seen = new Map<string, string>();
let total = 0;
for (const f of files) {
  const items = parseBatch(readFileSync(path.join(root, f), "utf8"));
  const bad = items.filter((i) => i.errors.length);
  const untagged = items.filter((i) => !i.tags.length).length;
  const formats = [...new Set(items.map((i) => i.content.format))].join(",");
  let dupes = 0;
  for (const i of items) {
    const key = JSON.stringify(Object.entries(i.content).filter(([k]) => k !== "format").map(([, v]) => v)).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(key)) {
      dupes++;
      console.log(`  duplicate in ${f} line ${i.line} (first in ${seen.get(key)})`);
    } else seen.set(key, `${f}:${i.line}`);
  }
  total += items.length - bad.length;
  console.log(`${f.padEnd(28)} ${String(items.length).padStart(4)}  [${formats}]${bad.length ? `  ${bad.length} errors: ${bad.slice(0, 3).map((b) => `l${b.line} ${b.errors[0]}`).join("; ")}` : ""}${untagged ? `  ${untagged} untagged` : ""}${dupes ? `  ${dupes} dupes` : ""}`);
}
console.log(`total ${total}`);
