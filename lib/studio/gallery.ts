/**
 * Gallery logic: filtering, "Surprise me", lock-aware shuffling, and a
 * placeholder photo for thumbnails of photo templates.
 */
import { FORMATS } from "@/lib/render/formats";
import { PAIRINGS, getPairing } from "@/lib/render/pairings";
import { PALETTES, getPalette } from "@/lib/render/palettes";
import type { FormatId, TemplateConfig } from "@/lib/render/template";
import { BACKGROUNDS, violations } from "@/lib/templates/generator";

export interface GalleryFilter {
  format: FormatId;
  moods: string[];
  palettes: string[];
  layout: string | null;
  photo: "all" | "photo" | "plain";
  favoritesOnly: boolean;
  mineOnly: boolean;
  /** Only designs that set comfortably at this preset. */
  preset: string | null;
}

const isPhoto = (t: TemplateConfig) => t.background.kind.startsWith("photo");

export function filterTemplates(all: TemplateConfig[], f: GalleryFilter, favorites: Set<string>, mine: Set<string>): TemplateConfig[] {
  return all.filter(
    (t) =>
      t.format === f.format &&
      (!f.layout || t.layout === f.layout) &&
      (!f.palettes.length || f.palettes.includes(t.palette)) &&
      (!f.moods.length || f.moods.every((m) => t.tags?.includes(m))) &&
      (f.photo === "all" || (f.photo === "photo") === isPhoto(t)) &&
      (!f.favoritesOnly || favorites.has(t.id)) &&
      (!f.mineOnly || mine.has(t.id)) &&
      // Hand-made and saved templates have no preset list; they are always shown.
      (!f.preset || !t.presets || t.presets.includes(f.preset)),
  );
}

/** Layouts that give short lines room to be large, and those that carry long text well. */
const SHORT_LAYOUTS = ["big-word", "corner", "center", "low", "hero", "centered", "glass", "axis", "mirror", "swiss"];
const LONG_LAYOUTS = ["editorial", "stacked", "bottom", "top", "framed-card", "card", "notebook", "typewriter", "script", "entry", "flat", "strip", "margin"];

/** Picks a template suited to the quote's length and format, weighted by quality, with some chance. */
export function surpriseMe(pool: TemplateConfig[], textLength: number, preset: string, currentId?: string, rnd = Math.random): TemplateConfig | null {
  const short = textLength < 70, long = textLength > 170;
  const scored = pool
    .filter((t) => t.id !== currentId && (!t.presets || t.presets.includes(preset)))
    .map((t) => {
      let s = t.score ?? 0.75;
      if (short && SHORT_LAYOUTS.includes(t.layout)) s += 0.15;
      if (long && LONG_LAYOUTS.includes(t.layout)) s += 0.15;
      if (long && SHORT_LAYOUTS.includes(t.layout)) s -= 0.2;
      if (t.hero) s += 0.05;
      return { t, s: s + rnd() * 0.12 };
    })
    .sort((a, b) => b.s - a.s)
    .slice(0, 12);
  return scored.length ? scored[Math.floor(rnd() * scored.length)].t : null;
}

export interface Locks {
  font: boolean;
  palette: boolean;
  image: boolean;
}

/**
 * Shuffle that respects locks: first another curated template matching the
 * locked attributes, otherwise a random rule-passing combination.
 */
export function shuffleTemplate(current: TemplateConfig, pool: TemplateConfig[], locks: Locks, rnd = Math.random): TemplateConfig {
  const matches = pool.filter(
    (t) =>
      t.id !== current.id &&
      t.format === current.format &&
      (!locks.font || t.pairing === current.pairing) &&
      (!locks.palette || t.palette === current.palette) &&
      (!locks.image || t.background.kind === current.background.kind),
  );
  if (matches.length) return matches[Math.floor(rnd() * matches.length)];
  const f = FORMATS[current.format];
  for (let i = 0; i < 200; i++) {
    const t: TemplateConfig = {
      ...current,
      id: "custom",
      name: "Shuffled",
      layout: f.layouts[Math.floor(rnd() * f.layouts.length)].id,
      pairing: locks.font ? current.pairing : PAIRINGS[Math.floor(rnd() * PAIRINGS.length)].id,
      palette: locks.palette ? current.palette : PALETTES[Math.floor(rnd() * PALETTES.length)].id,
      background: locks.image ? current.background : BACKGROUNDS[Math.floor(rnd() * BACKGROUNDS.length)],
    };
    const ok = !violations({ format: t.format, layout: t.layout, pairing: getPairing(t.pairing), palette: getPalette(t.palette), background: t.background, emphasis: t.emphasis }).length;
    if (ok) return t;
  }
  return current;
}

let placeholder: HTMLCanvasElement | null = null;
/** A quiet generated "photo" (sky, horizon, water) for thumbnails when no photo is loaded. */
export function placeholderPhoto(): HTMLCanvasElement {
  if (placeholder) return placeholder;
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 1500;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, "#8d9ba6");
  g.addColorStop(0.5, "#c9d0d4");
  g.addColorStop(0.52, "#5f6f7a");
  g.addColorStop(1, "#27323a");
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  placeholder = c;
  return c;
}

export const templateFamilies = (t: TemplateConfig) => {
  const p = getPairing(t.pairing);
  return [...new Set([p.display.family, p.text.family])];
};
