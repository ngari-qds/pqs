import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/render/color";
import { PALETTES } from "@/lib/render/palettes";
import { PAIRINGS } from "@/lib/render/pairings";
import { findFamily } from "@/lib/fonts/registry";

describe("palettes", () => {
  it("has 16 named palettes", () => expect(PALETTES).toHaveLength(16));
  for (const p of PALETTES) {
    it(`${p.name}: ink ≥ 7:1 and muted ≥ 4.5:1 on both gradient stops`, () => {
      for (const bg of [p.bg, p.bg2]) {
        expect(contrastRatio(p.ink, bg)).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(p.muted, bg)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe("pairings", () => {
  it("has 14 pairings, each using at most two families, all registered", () => {
    expect(PAIRINGS).toHaveLength(14);
    for (const p of PAIRINGS) {
      const fams = new Set([p.display, p.displayEm, p.text, p.textEm, p.label].map((f) => f.family));
      expect(fams.size).toBeLessThanOrEqual(2);
      for (const f of fams) expect(findFamily(f), f).toBeDefined();
    }
  });
});
