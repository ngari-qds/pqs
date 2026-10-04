/**
 * Single source of truth for every font family the studio uses.
 * `scripts/fetch-fonts.ts` downloads these faces from Google Fonts into
 * `assets/fonts/` and generates `lib/fonts/next-fonts.ts` (next/font/local).
 * The Node renderer (QA + samples) registers the very same files, so the
 * browser preview, the browser export and the QA run all use identical glyphs.
 */

export type FontStyle = "normal" | "italic";
export interface FontFace {
  weight: number;
  style: FontStyle;
}
export interface FontFamilyDef {
  /** Canonical family name, exactly as Google Fonts spells it. */
  family: string;
  /** Identifier used in file names and generated code. */
  slug: string;
  kind: "serif" | "sans" | "mono" | "display";
  faces: FontFace[];
}

const f = (weight: number, style: FontStyle = "normal"): FontFace => ({ weight, style });
const def = (family: string, kind: FontFamilyDef["kind"], faces: FontFace[]): FontFamilyDef => ({
  family,
  slug: family.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  kind,
  faces,
});

export const FONT_FAMILIES: FontFamilyDef[] = [
  // Serifs / display
  def("Fraunces", "serif", [f(400), f(400, "italic"), f(600)]),
  def("Instrument Serif", "serif", [f(400), f(400, "italic")]),
  def("Cormorant Garamond", "serif", [f(500), f(500, "italic"), f(600)]),
  def("EB Garamond", "serif", [f(400), f(400, "italic"), f(600)]),
  def("Newsreader", "serif", [f(400), f(400, "italic"), f(600)]),
  def("Playfair Display", "serif", [f(400), f(400, "italic"), f(700)]),
  def("DM Serif Display", "serif", [f(400), f(400, "italic")]),
  def("Libre Caslon Text", "serif", [f(400), f(400, "italic"), f(700)]),
  def("Spectral", "serif", [f(400), f(400, "italic"), f(600)]),
  def("IBM Plex Serif", "serif", [f(400), f(400, "italic"), f(600)]),
  def("Space Grotesk", "sans", [f(400), f(500), f(700)]),
  def("Bebas Neue", "display", [f(400)]),
  def("Syne", "display", [f(500), f(700)]),
  // Sans companions
  def("Inter", "sans", [f(400), f(500), f(600), f(700)]),
  def("Work Sans", "sans", [f(400), f(500)]),
  def("IBM Plex Sans", "sans", [f(400), f(500)]),
  def("Inter Tight", "sans", [f(400), f(500), f(600)]),
  def("Source Sans 3", "sans", [f(400), f(600)]),
  def("DM Sans", "sans", [f(400), f(500)]),
  def("Karla", "sans", [f(400), f(500)]),
  def("Manrope", "sans", [f(400), f(500)]),
  // Mono
  def("Space Mono", "mono", [f(400), f(700)]),
  def("IBM Plex Mono", "mono", [f(400), f(500)]),
  def("JetBrains Mono", "mono", [f(400), f(600)]),
];

export const fontFile = (fam: FontFamilyDef, face: FontFace) =>
  `${fam.slug}-${face.weight}${face.style === "italic" ? "i" : ""}.ttf`;

export function findFamily(family: string): FontFamilyDef | undefined {
  return FONT_FAMILIES.find((x) => x.family === family);
}

/** Closest available face for a requested weight/style (never a synthetic bold/italic). */
export function closestFace(family: string, weight: number, style: FontStyle): FontFace {
  const fam = findFamily(family);
  if (!fam) throw new Error(`Unknown font family: ${family}`);
  const sameStyle = fam.faces.filter((x) => x.style === style);
  const pool = sameStyle.length ? sameStyle : fam.faces;
  return pool.reduce((best, x) => (Math.abs(x.weight - weight) < Math.abs(best.weight - weight) ? x : best));
}
