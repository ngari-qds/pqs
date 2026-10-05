import { describe, expect, it } from "vitest";
import { FORMAT_LIST } from "@/lib/render/formats";
import { getPairing } from "@/lib/render/pairings";
import { getPalette } from "@/lib/render/palettes";
import type { BackgroundConfig, FormatId, TemplateConfig } from "@/lib/render/template";
import { QUOTA, rankFormat, scoreCombo, totalCombinations, validCombos, violations, type Combo } from "@/lib/templates/generator";
import { filterTemplates, shuffleTemplate, surpriseMe, type GalleryFilter } from "@/lib/studio/gallery";
import { keyWord } from "@/lib/render/formats/archetypes";
import { mulberry32 } from "@/lib/render/random";

const combo = (format: FormatId, layout: string, pairing: string, palette: string, background: BackgroundConfig): Combo => ({
  format, layout, pairing: getPairing(pairing), palette: getPalette(palette), background,
});

describe("combination rules", () => {
  it("allows monospace pairings only in equation, field note and post formats", () => {
    expect(violations(combo("classic", "centered", "jetbrains", "ink", { kind: "solid" }))).toContain("mono-only-in-equation-note-post");
    expect(violations(combo("field-note", "notebook", "plex-serif-mono", "paper-ink", { kind: "paper" }))).toEqual([]);
    expect(violations(combo("equation", "centered", "fraunces-inter", "ink", { kind: "solid" }))).toContain("equation-needs-mono");
  });
  it("keeps delicate display serifs off busy photos without a scrim", () => {
    expect(violations(combo("classic", "centered", "cormorant-work", "ink", { kind: "photo-duotone" }))).toContain("delicate-serif-needs-scrim");
    expect(violations(combo("classic", "bottom", "cormorant-work", "ink", { kind: "photo-scrim", scrim: "auto" }))).toEqual([]);
  });
  it("rejects grounds that do not suit the palette", () => {
    expect(violations(combo("classic", "centered", "fraunces-inter", "paper-ink", { kind: "vignette" }))).toContain("vignette-needs-dark-palette");
    expect(violations(combo("classic", "centered", "fraunces-inter", "ink", { kind: "paper" }))).toContain("paper-needs-light-palette");
  });
  it("rejects layouts that clash with the background", () => {
    expect(violations(combo("classic", "glass", "fraunces-inter", "ink", { kind: "solid" }))).toContain("glass-needs-photo");
    expect(violations(combo("contrast", "panels", "fraunces-inter", "ink", { kind: "photo-scrim" }))).toContain("layout-paints-own-page");
    expect(violations(combo("classic", "framed-card", "fraunces-inter", "fog", { kind: "photo-split" }))).toContain("layout-already-divides-canvas");
    expect(violations(combo("classic", "swiss", "fraunces-inter", "fog", { kind: "solid" }))).toContain("swiss-needs-grotesk");
  });
  it("keeps all-capital display faces away from long text", () => {
    expect(violations(combo("stanza", "left", "bebas-inter", "ink", { kind: "solid" }))).toContain("no-caps-for-long-text");
    expect(violations(combo("stat", "hero", "bebas-inter", "ink", { kind: "solid" }))).toEqual([]);
  });
  it("every valid combination uses at most two font families", () => {
    for (const f of FORMAT_LIST)
      for (const c of validCombos(f.id).slice(0, 400)) {
        const p = c.pairing;
        const fams = new Set([p.display.family, p.displayEm.family, p.text.family, p.textEm.family, p.label.family]);
        expect(fams.size).toBeLessThanOrEqual(2);
      }
  });
});

describe("generation", () => {
  it("enumerates every combination and keeps a large valid set", () => {
    expect(totalCombinations()).toBeGreaterThan(100_000);
    const valid = FORMAT_LIST.reduce((n, f) => n + validCombos(f.id).length, 0);
    expect(valid).toBeGreaterThan(20_000);
  });
  it("quotas add up to more than 400", () => {
    expect(Object.values(QUOTA).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(400);
  });
  it("is deterministic and picks unique, rule-passing, varied templates", () => {
    const a = rankFormat("classic", 40), b = rankFormat("classic", 40);
    expect(a.map((t) => t.id)).toEqual(b.map((t) => t.id));
    expect(new Set(a.map((t) => t.id)).size).toBe(40);
    expect(new Set(a.map((t) => t.palette)).size).toBeGreaterThanOrEqual(12);
    expect(new Set(a.map((t) => t.pairing)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(a.map((t) => t.layout)).size).toBeGreaterThanOrEqual(8);
    const photos = a.filter((t) => t.background.kind.startsWith("photo")).length;
    expect(photos).toBeLessThanOrEqual(Math.ceil(40 * 0.35));
  });
  it("scores fitting pairings higher", () => {
    expect(scoreCombo(combo("stat", "hero", "bebas-inter", "ink", { kind: "solid" }))).toBeGreaterThan(scoreCombo(combo("stat", "hero", "spectral-manrope", "ink", { kind: "solid" })));
  });
});

const T = (id: string, extra: Partial<TemplateConfig> = {}): TemplateConfig => ({
  id, name: id, format: "classic", layout: "centered", pairing: "fraunces-inter", palette: "ink", background: { kind: "solid" }, ...extra,
});

describe("gallery logic", () => {
  const pool = [
    T("a", { tags: ["dark", "stark"], presets: ["ig-portrait", "status"] }),
    T("b", { palette: "fog", tags: ["light", "cool"], layout: "editorial", presets: ["ig-portrait"] }),
    T("c", { background: { kind: "photo-scrim" }, tags: ["dark", "photographic"], layout: "big-word" }),
    T("d", { format: "stat", layout: "hero" }),
  ];
  const base: GalleryFilter = { format: "classic", moods: [], palettes: [], layout: null, photo: "all", favoritesOnly: false, mineOnly: false, preset: null };
  it("filters by format, mood, palette, layout, photo, favourites and preset", () => {
    const ids = (f: Partial<GalleryFilter>, fav = new Set<string>()) => filterTemplates(pool, { ...base, ...f }, fav, new Set()).map((t) => t.id);
    expect(ids({})).toEqual(["a", "b", "c"]);
    expect(ids({ moods: ["dark"] })).toEqual(["a", "c"]);
    expect(ids({ palettes: ["fog"] })).toEqual(["b"]);
    expect(ids({ layout: "editorial" })).toEqual(["b"]);
    expect(ids({ photo: "photo" })).toEqual(["c"]);
    expect(ids({ favoritesOnly: true }, new Set(["b"]))).toEqual(["b"]);
    expect(ids({ preset: "status" })).toEqual(["a", "c"]); // c has no preset list: hand-made, always shown
  });
  it("Surprise me favours big layouts for short lines and avoids them for long text", () => {
    const rnd = mulberry32(1);
    const shortPicks = Array.from({ length: 30 }, () => surpriseMe(pool.slice(0, 3), 20, "ig-portrait", undefined, rnd)!.layout);
    expect(shortPicks).toContain("big-word");
    const longPicks = Array.from({ length: 30 }, () => surpriseMe(pool.slice(0, 3), 400, "ig-portrait", undefined, rnd)!.layout);
    expect(longPicks.filter((l) => l === "big-word").length).toBeLessThan(longPicks.length);
  });
  it("shuffle keeps locked attributes", () => {
    const rnd = mulberry32(7);
    const current = T("x", { pairing: "caslon-karla", palette: "moss" });
    for (let i = 0; i < 25; i++) {
      const t = shuffleTemplate(current, [], { font: true, palette: true, image: false }, rnd);
      expect(t.pairing).toBe("caslon-karla");
      expect(t.palette).toBe("moss");
    }
  });
  it("picks the key word for the oversized-word layout", () => {
    expect(keyWord("We call it *patience* when it is fear.")).toBe("patience");
    expect(keyWord("Stone keeps time better than men do.")).toBe("better");
  });
});
