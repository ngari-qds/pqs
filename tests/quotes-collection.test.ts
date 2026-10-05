import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseBatch } from "@/lib/studio/batch";
import { FORMAT_IDS } from "@/lib/render/template";

const dir = path.resolve(__dirname, "../public/quotes");
const files = ["cold-quotes.txt", ...readdirSync(path.join(dir, "formats")).filter((f) => f.endsWith(".txt")).map((f) => `formats/${f}`)];
const byFile = new Map(files.map((f) => [f, parseBatch(readFileSync(path.join(dir, f), "utf8"))]));
const all = [...byFile.values()].flat();
const index = JSON.parse(readFileSync(path.join(dir, "index.json"), "utf8"));

describe("quote collections", () => {
  it("parse without errors", () => {
    const bad = [...byFile].flatMap(([f, items]) => items.filter((i) => i.errors.length).map((i) => `${f}:${i.line}: ${i.errors.join(", ")}`));
    expect(bad).toEqual([]);
  });
  it("sampler covers every format", () => {
    const sampler = byFile.get("cold-quotes.txt")!;
    expect(sampler.length).toBeGreaterThanOrEqual(400);
    for (const f of FORMAT_IDS) expect(sampler.filter((i) => i.content.format === f).length, f).toBeGreaterThanOrEqual(10);
  });
  it("each format file holds only its own format", () => {
    for (const [f, items] of byFile) {
      if (!f.startsWith("formats/")) continue;
      const id = path.basename(f, ".txt");
      expect(FORMAT_IDS, f).toContain(id);
      expect(items.filter((i) => i.content.format !== id).length, f).toBe(0);
    }
  });
  it("tags every quote", () => {
    const untagged = [...byFile].flatMap(([f, items]) => items.filter((i) => !i.tags.length).map((i) => `${f}:${i.line}`));
    expect(untagged).toEqual([]);
  });
  it("has no duplicate quotes across files", () => {
    const keys = all.map((i) => JSON.stringify(i.content).toLowerCase().replace(/[^a-z0-9]+/g, ""));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("index.json matches the files", () => {
    expect(index.total).toBe(all.length);
    for (const f of index.files) expect(byFile.get(f.file)?.length, f.file).toBe(f.count);
    expect(index.files.length).toBe(files.length);
  });
});
