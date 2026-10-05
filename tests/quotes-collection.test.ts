import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseBatch } from "@/lib/studio/batch";
import { FORMAT_IDS } from "@/lib/render/template";

const text = readFileSync(path.resolve(__dirname, "../public/quotes/cold-quotes.txt"), "utf8");
const items = parseBatch(text);

describe("cold-quotes collection", () => {
  it("parses without errors", () => {
    const bad = items.filter((i) => i.errors.length).map((i) => `line ${i.line}: ${i.errors.join(", ")}`);
    expect(bad).toEqual([]);
  });
  it("is long and covers every format", () => {
    expect(items.length).toBeGreaterThanOrEqual(400);
    for (const f of FORMAT_IDS) expect(items.filter((i) => i.content.format === f).length, f).toBeGreaterThanOrEqual(10);
  });
  it("tags every quote", () => {
    expect(items.filter((i) => !i.tags.length).map((i) => i.line)).toEqual([]);
  });
  it("has no duplicate quotes", () => {
    const keys = items.map((i) => JSON.stringify({ ...i.content }));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
