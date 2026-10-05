/**
 * Template generator. Every combination of format × layout × type pairing ×
 * palette × background is enumerated, combinations that break a design rule
 * are rejected, the rest are scored for fit, and a diverse set is picked per
 * format. scripts/generate-templates.ts then renders each pick at every
 * preset and keeps only those that pass QA (templates/gallery.json).
 *
 * Pure and deterministic: the same inputs always give the same gallery.
 */
import { FORMATS, FORMAT_LIST } from "../render/formats";
import { PAIRINGS, type Pairing } from "../render/pairings";
import { PALETTES, type Palette } from "../render/palettes";
import type { BackgroundConfig, FormatId, TemplateConfig } from "../render/template";

export const BACKGROUNDS: BackgroundConfig[] = [
  { kind: "solid" },
  { kind: "gradient", angle: 12 },
  { kind: "paper" },
  { kind: "vignette", strength: 0.4 },
  { kind: "photo-scrim", scrim: "auto" },
  { kind: "photo-mono-tint" },
  { kind: "photo-duotone" },
  { kind: "photo-blur" },
  { kind: "photo-split" },
  { kind: "photo-frame" },
];

const isPhoto = (bg: BackgroundConfig) => bg.kind.startsWith("photo");
/** Text sits directly on photographic pixels. */
const textOnPhoto = (bg: BackgroundConfig) => ["photo-scrim", "photo-mono-tint", "photo-duotone", "photo-blur"].includes(bg.kind);
const sansDisplay = (p: Pairing) => ["Syne", "Bebas Neue", "Space Grotesk"].includes(p.display.family);

/** Formats where a photograph supports the text rather than competing with it. */
const PHOTO_FORMATS: FormatId[] = ["classic", "hbp", "carousel", "one-liner", "highlight", "paradox", "pull-quote", "stat", "law", "post-card", "stanza", "contrast", "myth-truth", "then-now", "dialogue"];
/** Formats whose text is too long or structured for all-capitals display faces. */
const NO_CAPS_FORMATS: FormatId[] = ["stanza", "field-note", "post-card", "definition", "dialogue", "qa", "equation"];
/** Layouts that already divide the canvas, so a split/framed photo would crowd them. */
const NO_SPLIT_PHOTO_LAYOUTS = ["framed-card", "glass", "strip", "panels", "split", "notebook", "typewriter", "card", "swiss", "margin-rule"];
/** Layouts that paint their own page and make no sense over a photo. */
const NO_PHOTO_LAYOUTS = ["panels", "notebook", "typewriter"];

export interface Combo {
  format: FormatId;
  layout: string;
  pairing: Pairing;
  palette: Palette;
  background: BackgroundConfig;
  emphasis?: TemplateConfig["emphasis"];
}

/** Hard rules. Returns the names of the rules a combination breaks. */
export function violations(c: Combo): string[] {
  const out: string[] = [];
  const f = FORMATS[c.format];
  const bg = c.background;
  // Monospace only for equations, field notes and posts; equations always monospace.
  if (c.pairing.mono && !f.monoAllowed) out.push("mono-only-in-equation-note-post");
  if (c.format === "equation" && !c.pairing.mono) out.push("equation-needs-mono");
  // Never more than two families (pairings guarantee it; the typewriter adds a mono face).
  if (c.layout === "typewriter" && !c.pairing.mono) out.push("max-two-families");
  // Display serifs never on busy photos without a scrim.
  if (c.pairing.delicate && (bg.kind === "photo-duotone" || bg.kind === "photo-mono-tint")) out.push("delicate-serif-needs-scrim");
  if (isPhoto(bg) && !PHOTO_FORMATS.includes(c.format)) out.push("photo-competes-with-format");
  if (c.format === "post-card" && isPhoto(bg) && !["photo-blur", "photo-scrim", "photo-mono-tint"].includes(bg.kind)) out.push("post-needs-calm-photo");
  if ((bg.kind === "photo-split" || bg.kind === "photo-frame") && NO_SPLIT_PHOTO_LAYOUTS.includes(c.layout)) out.push("layout-already-divides-canvas");
  if (isPhoto(bg) && NO_PHOTO_LAYOUTS.includes(c.layout)) out.push("layout-paints-own-page");
  if (c.layout === "glass" && !textOnPhoto(bg)) out.push("glass-needs-photo");
  if (c.layout === "strip" && !isPhoto(bg) && bg.kind !== "solid") out.push("strip-on-photo-or-solid");
  if (c.layout === "swiss" && !sansDisplay(c.pairing)) out.push("swiss-needs-grotesk");
  if (c.layout === "swiss" && (bg.kind === "paper" || bg.kind === "vignette")) out.push("swiss-needs-flat-ground");
  if (c.pairing.uppercaseDisplay && NO_CAPS_FORMATS.includes(c.format)) out.push("no-caps-for-long-text");
  if (c.pairing.uppercaseDisplay && c.format === "list" && c.layout === "ruled") out.push("no-caps-for-long-text");
  // Grounds that only suit one kind of palette.
  if (bg.kind === "vignette" && !c.palette.dark) out.push("vignette-needs-dark-palette");
  if (bg.kind === "paper" && c.palette.dark) out.push("paper-needs-light-palette");
  if (bg.kind === "photo-duotone" && c.palette.id === "mono") out.push("duotone-needs-colour");
  if (c.palette.id === "mono" && (bg.kind === "gradient" || bg.kind === "paper")) out.push("pure-mono-stays-flat");
  return out;
}

// ------------------------------------------------------------------- scoring

/** How well a pairing suits a format (0..1). Unlisted pairings score 0.55. */
const PAIRING_FIT: Partial<Record<FormatId, Record<string, number>>> = {
  classic: { "fraunces-inter": 0.95, "instrument-inter": 0.9, "caslon-karla": 0.85, "newsreader-intertight": 0.85, "garamond-plex": 0.8, "playfair-source": 0.75, "dmserif-dmsans": 0.75, "spectral-manrope": 0.75, "cormorant-work": 0.7, "syne-inter": 0.6, "bebas-inter": 0.6 },
  hbp: { "syne-inter": 0.9, "dmserif-dmsans": 0.9, "fraunces-inter": 0.85, "bebas-inter": 0.8, "playfair-source": 0.75, "newsreader-intertight": 0.75 },
  carousel: { "syne-inter": 0.9, "dmserif-dmsans": 0.9, "fraunces-inter": 0.85, "bebas-inter": 0.8, "instrument-inter": 0.8, "caslon-karla": 0.75 },
  "one-liner": { "instrument-inter": 1, "cormorant-work": 0.9, "newsreader-intertight": 0.85, "garamond-plex": 0.85, "fraunces-inter": 0.8, "spectral-manrope": 0.75 },
  highlight: { "playfair-source": 0.9, "fraunces-inter": 0.9, "dmserif-dmsans": 0.85, "bebas-inter": 0.75, "newsreader-intertight": 0.8 },
  contrast: { "spectral-manrope": 0.85, "fraunces-inter": 0.85, "newsreader-intertight": 0.85, "caslon-karla": 0.8, "syne-inter": 0.75 },
  "myth-truth": { "caslon-karla": 0.85, "fraunces-inter": 0.85, "dmserif-dmsans": 0.8, "newsreader-intertight": 0.8 },
  "then-now": { "newsreader-intertight": 0.85, "instrument-inter": 0.85, "spectral-manrope": 0.8, "garamond-plex": 0.8 },
  paradox: { "cormorant-work": 1, "instrument-inter": 0.9, "garamond-plex": 0.9, "fraunces-inter": 0.8 },
  list: { "newsreader-intertight": 0.9, "syne-inter": 0.85, "garamond-plex": 0.85, "fraunces-inter": 0.8, "dmserif-dmsans": 0.75 },
  qa: { "fraunces-inter": 0.9, "playfair-source": 0.85, "spectral-manrope": 0.85, "caslon-karla": 0.8 },
  definition: { "garamond-plex": 1, "caslon-karla": 1, "newsreader-intertight": 0.9, "spectral-manrope": 0.85, "fraunces-inter": 0.8 },
  equation: { jetbrains: 1, "grotesk-mono": 0.9, "plex-serif-mono": 0.85 },
  stat: { "bebas-inter": 1, "dmserif-dmsans": 0.9, "syne-inter": 0.85, "fraunces-inter": 0.8, "playfair-source": 0.75 },
  law: { "caslon-karla": 1, "garamond-plex": 0.9, "playfair-source": 0.85, "dmserif-dmsans": 0.8, "newsreader-intertight": 0.8 },
  dialogue: { "newsreader-intertight": 0.9, "fraunces-inter": 0.9, "caslon-karla": 0.85, "instrument-inter": 0.8 },
  stanza: { "garamond-plex": 1, "cormorant-work": 1, "caslon-karla": 0.9, "spectral-manrope": 0.9, "newsreader-intertight": 0.85 },
  "field-note": { "plex-serif-mono": 1, "grotesk-mono": 0.85, "spectral-manrope": 0.75, "newsreader-intertight": 0.75, "garamond-plex": 0.7 },
  "post-card": { "fraunces-inter": 0.85, "newsreader-intertight": 0.85, "grotesk-mono": 0.8, "instrument-inter": 0.75, "syne-inter": 0.65 },
  "pull-quote": { "caslon-karla": 1, "playfair-source": 0.9, "instrument-inter": 0.9, "garamond-plex": 0.9, "fraunces-inter": 0.85 },
};

function paletteBgFit(p: Palette, bg: BackgroundConfig): number {
  switch (bg.kind) {
    case "paper":
      return ["paper-ink", "bone-rust", "sandstone"].includes(p.id) ? 1 : 0.6;
    case "gradient":
      return ["fog", "midnight", "slate", "graphite", "deep-teal", "concrete"].includes(p.id) ? 0.9 : 0.65;
    case "vignette":
      return ["ink", "midnight", "graphite", "oxblood", "warm-charcoal", "moss"].includes(p.id) ? 0.9 : 0.6;
    case "solid":
      return 0.75;
    case "photo-duotone":
      return ["midnight", "deep-teal", "oxblood", "olive", "terracotta", "slate", "moss"].includes(p.id) ? 1 : 0.6;
    case "photo-split":
    case "photo-frame":
      return p.dark ? 0.65 : 0.9;
    default:
      return p.dark ? 0.85 : 0.7;
  }
}

function layoutBgFit(layout: string, bg: BackgroundConfig): number {
  const photo = isPhoto(bg);
  if (layout === "glass") return bg.kind === "photo-scrim" || bg.kind === "photo-blur" ? 1 : 0.8;
  if (layout === "strip") return photo ? 1 : 0.6;
  if (layout === "bottom" || layout === "top" || layout === "low") return bg.kind === "photo-scrim" ? 1 : photo ? 0.8 : 0.65;
  if (layout === "corner") return bg.kind === "paper" || bg.kind === "photo-scrim" ? 0.9 : 0.65;
  if (layout === "framed-card" || layout === "card") return bg.kind === "photo-blur" || bg.kind === "photo-scrim" || bg.kind === "gradient" ? 0.9 : 0.65;
  if (bg.kind === "photo-split" || bg.kind === "photo-frame") return ["editorial", "stacked", "left", "entry", "placard", "hero", "numbered"].includes(layout) ? 0.9 : 0.7;
  if (layout === "swiss") return bg.kind === "solid" ? 1 : 0.7;
  if (layout === "notebook" || layout === "typewriter") return bg.kind === "paper" ? 1 : 0.6;
  return photo ? 0.7 : 0.8;
}

export function scoreCombo(c: Combo): number {
  const pairing = PAIRING_FIT[c.format]?.[c.pairing.id] ?? 0.55;
  return Math.round((0.45 * pairing + 0.3 * paletteBgFit(c.palette, c.background) + 0.25 * layoutBgFit(c.layout, c.background)) * 1000) / 1000;
}

// --------------------------------------------------------------- generation

/** Gallery size per format (sums to 485). */
export const QUOTA: Record<FormatId, number> = {
  classic: 60, hbp: 30, carousel: 20, "one-liner": 30, highlight: 30, contrast: 20, "myth-truth": 20, "then-now": 20,
  paradox: 20, list: 25, qa: 20, definition: 20, equation: 20, stat: 25, law: 20, dialogue: 20, stanza: 20,
  "field-note": 20, "post-card": 20, "pull-quote": 25,
};

export const MOOD_TAGS: Record<string, string[]> = {
  ink: ["dark", "stark"], fog: ["light", "cool", "calm"], graphite: ["dark", "cool"], sandstone: ["light", "warm", "earthy"],
  midnight: ["dark", "cool"], olive: ["dark", "earthy"], terracotta: ["warm", "earthy"], "bone-rust": ["light", "warm"],
  slate: ["dark", "cool"], moss: ["dark", "earthy"], concrete: ["light", "cool", "stark"], "paper-ink": ["light", "calm"],
  "deep-teal": ["dark", "cool"], "warm-charcoal": ["dark", "warm"], oxblood: ["dark", "warm"], mono: ["light", "stark"],
};
export const GALLERY_MOODS = ["calm", "stark", "warm", "cool", "earthy", "dark", "light", "photographic"] as const;

const bgShort = (bg: BackgroundConfig) => bg.kind.replace("photo-", "p-");

export function comboToTemplate(c: Combo): TemplateConfig {
  const layoutName = FORMATS[c.format].layouts.find((l) => l.id === c.layout)?.name ?? c.layout;
  const bgName: Record<string, string> = {
    solid: "", gradient: "gradient", paper: "paper", vignette: "vignette", "photo-scrim": "photo", "photo-mono-tint": "grayscale photo",
    "photo-duotone": "duotone", "photo-blur": "blurred photo", "photo-split": "split photo", "photo-frame": "framed photo",
  };
  const bits = [c.palette.name, layoutName.toLowerCase(), bgName[c.background.kind]].filter(Boolean);
  return {
    id: `g-${c.format}-${c.layout}-${c.pairing.id}-${c.palette.id}-${bgShort(c.background)}${c.emphasis ? `-${c.emphasis}` : ""}`,
    name: bits.join(", "),
    format: c.format,
    layout: c.layout,
    pairing: c.pairing.id,
    palette: c.palette.id,
    background: c.background,
    ...(c.emphasis ? { emphasis: c.emphasis } : {}),
    ...(c.format === "pull-quote" || c.layout === "pull-quote" ? { accentMarks: true } : {}),
    tags: [...(MOOD_TAGS[c.palette.id] ?? []), ...(isPhoto(c.background) ? ["photographic"] : [])],
    hero: false,
    score: scoreCombo(c),
  };
}

/** Every rule-passing combination for a format. */
export function validCombos(format: FormatId): Combo[] {
  const out: Combo[] = [];
  const emphases: (TemplateConfig["emphasis"] | undefined)[] = format === "highlight" ? ["marker", "color", "underline", "italic"] : [undefined];
  for (const { id: layout } of FORMATS[format].layouts)
    for (const pairing of PAIRINGS)
      for (const palette of PALETTES)
        for (const background of BACKGROUNDS)
          for (const emphasis of emphases) {
            const c: Combo = { format, layout, pairing, palette, background, emphasis };
            if (!violations(c).length) out.push(c);
          }
  return out;
}

/**
 * Greedy diverse ranking: repeatedly take the best-scoring combination after
 * penalising repeats of the same palette, pairing, layout and background.
 * Returns `count` templates in pick order (callers over-request to keep a
 * reserve for candidates that fail verification).
 */
/** Usage across all formats, so the gallery as a whole rotates palettes and pairings. */
export type GlobalUse = { palette: Map<string, number>; pairing: Map<string, number> };
export const newGlobalUse = (): GlobalUse => ({ palette: new Map(), pairing: new Map() });

export function rankFormat(format: FormatId, count: number, global: GlobalUse = newGlobalUse()): TemplateConfig[] {
  const pool = validCombos(format).map((c) => ({ c, s: scoreCombo(c) }));
  const used = { palette: new Map<string, number>(), pairing: new Map<string, number>(), layout: new Map<string, number>(), bg: new Map<string, number>(), layoutBg: new Map<string, number>() };
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const get = (m: Map<string, number>, k: string) => m.get(k) ?? 0;
  const picked: TemplateConfig[] = [];
  const taken = new Set<number>();
  // Cap photographic designs at about a third of each format's ranked candidates;
  // scripts/generate-templates.ts also caps the kept gallery at 40% per format.
  const photoCap = Math.ceil(count * 0.35);
  let photos = 0;
  while (picked.length < count && taken.size < pool.length) {
    let best = -1, bestS = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      if (taken.has(i)) continue;
      const { c, s } = pool[i];
      if (isPhoto(c.background) && photos >= photoCap) continue;
      const adj =
        s -
        0.1 * get(used.palette, c.palette.id) -
        0.09 * get(used.pairing, c.pairing.id) -
        0.05 * get(used.layout, c.layout) -
        0.04 * get(used.bg, c.background.kind) -
        0.12 * get(used.layoutBg, `${c.layout}|${c.background.kind}`) -
        0.004 * get(global.palette, c.palette.id) -
        0.004 * get(global.pairing, c.pairing.id);
      // Deterministic tie-break on the id.
      if (adj > bestS + 1e-9) {
        best = i;
        bestS = adj;
      }
    }
    if (best < 0) break;
    taken.add(best);
    const { c } = pool[best];
    inc(used.palette, c.palette.id);
    inc(used.pairing, c.pairing.id);
    inc(used.layout, c.layout);
    inc(used.bg, c.background.kind);
    inc(used.layoutBg, `${c.layout}|${c.background.kind}`);
    if (isPhoto(c.background)) photos++;
    inc(global.palette, c.palette.id);
    inc(global.pairing, c.pairing.id);
    picked.push(comboToTemplate(c));
  }
  return picked;
}

export function totalCombinations() {
  return FORMAT_LIST.reduce((n, f) => n + f.layouts.length * PAIRINGS.length * PALETTES.length * BACKGROUNDS.length * (f.id === "highlight" ? 4 : 1), 0);
}
