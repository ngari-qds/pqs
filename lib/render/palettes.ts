/** Sixteen restrained, named palettes. Every ink/bg pair clears WCAG AAA (7:1). */
export interface Palette {
  id: string;
  name: string;
  bg: string;
  ink: string;
  /** Secondary text; still ≥ 4.5:1 against bg. */
  muted: string;
  accent: string;
  /** Second gradient stop (soft two-stop gradients go bg → bg2). */
  bg2: string;
  dark: boolean;
}

const p = (id: string, name: string, bg: string, bg2: string, ink: string, muted: string, accent: string, dark: boolean): Palette => ({
  id, name, bg, bg2, ink, muted, accent, dark,
});

export const PALETTES: Palette[] = [
  p("ink", "Ink", "#111111", "#1d1c1a", "#ede8df", "#a39e95", "#c9b99a", true),
  p("fog", "Fog", "#e4e6e8", "#d3d7db", "#25282c", "#4c5259", "#5f6973", false),
  p("graphite", "Graphite", "#2a2b2d", "#1e1f21", "#e9e7e3", "#a8a6a1", "#bdb6aa", true),
  p("sandstone", "Sandstone", "#e8ddcb", "#dccdb5", "#33291f", "#594a3b", "#80502c", false),
  p("midnight", "Midnight Navy", "#0f1a2b", "#17253b", "#e6e2d8", "#98a2b2", "#c2a878", true),
  p("olive", "Olive Archive", "#35362a", "#2a2b21", "#eae6d6", "#b0ae98", "#c7b98a", true),
  p("terracotta", "Terracotta", "#7f361f", "#6c2d19", "#f7f0e6", "#e2c6b4", "#f1d3b5", true),
  p("bone-rust", "Bone and Rust", "#efe8dc", "#e5dccb", "#2a211c", "#6e5f54", "#93391c", false),
  p("slate", "Slate Blue", "#3a4759", "#2f3a4a", "#eef0f2", "#bcc4ce", "#d3dbe4", true),
  p("moss", "Moss", "#2c3729", "#232c21", "#e8e6da", "#a9b09e", "#bcc79e", true),
  p("concrete", "Concrete", "#cfcdc9", "#bfbdb8", "#1c1c1c", "#4e4c49", "#6a665f", false),
  p("paper-ink", "Paper and Ink", "#f4f1ea", "#ebe6db", "#161616", "#5d5952", "#8c2f1e", false),
  p("deep-teal", "Deep Teal", "#0f3436", "#0b2729", "#e3ebe8", "#9fb7b4", "#b9d2cc", true),
  p("warm-charcoal", "Warm Charcoal", "#26221f", "#1c1916", "#ece4d8", "#aba194", "#c89f6c", true),
  p("oxblood", "Oxblood", "#3d1416", "#2e0f10", "#efe3da", "#c4aba3", "#d6b79c", true),
  p("mono", "Pure Mono", "#ffffff", "#f0f0f0", "#000000", "#4d4d4d", "#000000", false),
];

export const getPalette = (id: string) => PALETTES.find((x) => x.id === id) ?? PALETTES[0];
