/**
 * Writes public/quotes/index.json: the sampler plus one file per format,
 * with quote counts, for the studio's collection picker.
 *   npx tsx scripts/quotes-index.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FORMAT_LIST } from "../lib/render/formats";
import { parseBatch } from "../lib/studio/batch";

const root = path.resolve(import.meta.dirname, "../public/quotes");
const count = (file: string) => parseBatch(readFileSync(path.join(root, file), "utf8")).filter((i) => !i.errors.length).length;
const files = [{ id: "sampler", name: "Sampler (every format)", file: "cold-quotes.txt", count: count("cold-quotes.txt") }];
for (const f of FORMAT_LIST) {
  const file = `formats/${f.id}.txt`;
  if (existsSync(path.join(root, file))) files.push({ id: f.id, name: f.name, file, count: count(file) });
}
const total = files.reduce((n, f) => n + f.count, 0);
writeFileSync(path.join(root, "index.json"), JSON.stringify({ total, files }, null, 2) + "\n");
console.log(`${files.length} files, ${total} quotes`);
