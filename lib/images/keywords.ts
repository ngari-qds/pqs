/**
 * Keyword engine: detects mood tags in a quote and maps them to search terms
 * that tend to return calm, editorial photographs (large quiet areas, no
 * stock "success" imagery).
 */

export type Mood =
  | "solitude" | "ambition" | "time" | "city" | "ocean" | "night"
  | "stone" | "fog" | "architecture" | "desert" | "minimal" | "forest" | "rain" | "road";

interface MoodDef {
  label: string;
  /** Search queries, tried in order as the user shuffles. */
  terms: string[];
  /** Word stems that suggest this mood. */
  triggers: string[];
}

export const MOODS: Record<Mood, MoodDef> = {
  solitude: {
    label: "Solitude",
    terms: ["empty room window light", "lone tree fog", "empty bench mist", "quiet hallway shadow", "single chair empty room"],
    triggers: ["alone", "lonel", "solitude", "silence", "silent", "quiet", "empty", "nobody", "no one", "leave", "left", "absence", "miss"],
  },
  ambition: {
    label: "Ambition",
    terms: ["mountain ridge mist", "concrete staircase", "brutalist architecture sky", "long road horizon", "summit clouds"],
    triggers: ["ambition", "climb", "work", "build", "effort", "discipline", "goal", "become", "win", "success", "fail", "start", "begin", "rise"],
  },
  time: {
    label: "Time",
    terms: ["weathered stone wall", "old clock tower", "long exposure sea", "sand dunes wind", "faded concrete texture"],
    triggers: ["time", "year", "hour", "minute", "day", "age", "old", "young", "late", "early", "wait", "regret", "memory", "past", "future", "forever", "slow"],
  },
  city: {
    label: "City",
    terms: ["empty street dawn", "rooftops fog", "city street night rain", "concrete buildings minimal", "crosswalk from above"],
    triggers: ["city", "street", "crowd", "traffic", "town", "people", "stranger", "noise", "office", "train", "station"],
  },
  ocean: {
    label: "Ocean",
    terms: ["calm ocean horizon", "grey sea minimal", "foggy coastline", "waves long exposure", "still water horizon"],
    triggers: ["ocean", "sea", "wave", "water", "tide", "shore", "river", "drown", "swim", "deep", "harbor", "harbour"],
  },
  night: {
    label: "Night",
    terms: ["night sky minimal", "dark street lamp", "moon dark sky", "city lights night blur", "dark window night"],
    triggers: ["night", "dark", "moon", "star", "sleep", "dream", "midnight", "shadow", "evening"],
  },
  stone: {
    label: "Stone",
    terms: ["stone texture", "granite cliff", "marble surface", "rock formation minimal", "basalt columns"],
    triggers: ["stone", "rock", "hard", "cold", "wall", "weight", "heavy", "monument", "grave", "permanent"],
  },
  fog: {
    label: "Fog",
    terms: ["fog forest", "misty hills", "foggy lake", "fog bridge", "mist field morning"],
    triggers: ["fog", "mist", "unclear", "doubt", "uncertain", "hidden", "maybe", "lost", "blur", "vague"],
  },
  architecture: {
    label: "Architecture",
    terms: ["minimal architecture", "concrete building shadow", "white wall shadow", "geometric facade", "brutalist interior"],
    triggers: ["house", "home", "room", "door", "window", "structure", "system", "design", "order", "rule", "foundation"],
  },
  desert: {
    label: "Desert",
    terms: ["desert dunes", "empty desert road", "sand texture", "desert horizon", "salt flat"],
    triggers: ["desert", "sand", "dry", "thirst", "heat", "barren", "dust", "endless"],
  },
  minimal: {
    label: "Minimal",
    terms: ["minimal wall shadow", "plain sky", "soft light wall", "minimal landscape", "paper texture light"],
    triggers: ["simple", "less", "enough", "nothing", "clean", "plain", "truth", "honest"],
  },
  forest: {
    label: "Forest",
    terms: ["dark forest", "pine forest fog", "forest path", "tree trunks minimal", "woods morning light"],
    triggers: ["forest", "tree", "wood", "root", "grow", "branch", "leaf", "nature", "wild"],
  },
  rain: {
    label: "Rain",
    terms: ["rain window", "rainy street", "rain glass bokeh", "wet asphalt", "storm clouds"],
    triggers: ["rain", "storm", "wet", "tear", "cry", "grey", "gray", "cloud", "thunder"],
  },
  road: {
    label: "Road",
    terms: ["empty road", "road horizon", "train tracks fog", "footpath", "highway night"],
    triggers: ["road", "path", "journey", "walk", "travel", "direction", "way", "distance", "far", "arrive", "go"],
  },
};

export const MOOD_IDS = Object.keys(MOODS) as Mood[];
const DEFAULT_MOODS: Mood[] = ["minimal", "fog"];

/** Ranks moods by trigger hits; returns up to `max` (defaults when nothing matches). */
export function detectMoods(text: string, max = 2): Mood[] {
  const words = text.toLowerCase().replace(/[^a-z\s']/g, " ").split(/\s+/).filter(Boolean);
  const scores = MOOD_IDS.map((m) => {
    let s = 0;
    for (const t of MOODS[m].triggers) {
      if (t.includes(" ")) s += text.toLowerCase().includes(t) ? 1 : 0;
      else s += words.filter((w) => w === t || (t.length >= 4 && w.startsWith(t))).length;
    }
    return { m, s };
  });
  const hits = scores.filter((x) => x.s > 0).sort((a, b) => b.s - a.s || MOOD_IDS.indexOf(a.m) - MOOD_IDS.indexOf(b.m));
  return hits.length ? hits.slice(0, max).map((x) => x.m) : DEFAULT_MOODS.slice(0, max);
}

/**
 * The search query for a shuffle step. A manual override always wins;
 * otherwise cycle through the terms of the selected moods.
 */
export function queryFor(moods: Mood[], override: string | undefined, step = 0): string {
  if (override && override.trim()) return override.trim();
  // Interleave the moods' terms: m1t1, m2t1, m1t2, m2t2 ...
  const lists = (moods.length ? moods : DEFAULT_MOODS).map((m) => MOODS[m].terms);
  const terms: string[] = [];
  for (let i = 0; i < Math.max(...lists.map((l) => l.length)); i++) for (const l of lists) if (l[i]) terms.push(l[i]);
  return terms[step % terms.length];
}
