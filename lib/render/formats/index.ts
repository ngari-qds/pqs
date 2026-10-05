/**
 * Format registry: each format's input schema, layouts, sample content and
 * composer. The studio builds its input form from `fields`.
 */
import type { Composition, LayoutContext } from "../compose";
import type { FormatId, QuoteContent } from "../template";
import { CLASSIC_LAYOUTS, composeClassic } from "./classic";
import { archetypeArea } from "./archetypes";
import { CAROUSEL_LAYOUTS, HBP_LAYOUTS, carouselSlides, composeCarousel, composeHbp } from "./hbp";
import { PAIR_LAYOUTS, PARADOX_LAYOUTS, composePair, composeParadox } from "./pair";
import { HIGHLIGHT_LAYOUTS, ONE_LINER_LAYOUTS, PULL_QUOTE_LAYOUTS, STANZA_LAYOUTS, composeHighlight, composeOneLiner, composePullQuote, composeStanza } from "./text";
import {
  DEFINITION_LAYOUTS, DIALOGUE_LAYOUTS, EQUATION_LAYOUTS, LAW_LAYOUTS, LIST_LAYOUTS, QA_LAYOUTS, STAT_LAYOUTS,
  composeDefinition, composeDialogue, composeEquation, composeLaw, composeList, composeQa, composeStat,
} from "./structured";
import { FIELD_NOTE_LAYOUTS, POST_CARD_LAYOUTS, composeFieldNote, composePostCard } from "./notes";

export interface FieldDef {
  key: string;
  label: string;
  kind: "text" | "textarea" | "list";
  placeholder?: string;
  optional?: boolean;
  /** Visible rows for textareas. */
  rows?: number;
  hint?: string;
}

export interface FormatDef {
  id: FormatId;
  name: string;
  description: string;
  fields: FieldDef[];
  layouts: { id: string; name: string }[];
  sample: QuoteContent;
  compose: (lc: LayoutContext, c: QuoteContent, layout: string) => Composition;
  /** Multi-image formats (carousel): number of slides for this content. */
  slideCount?: (c: QuoteContent) => number;
  /** Uses a monospace family (allowed for equation, field note and post). */
  monoAllowed?: boolean;
}

const names: Record<string, string> = {
  centered: "Centred", center: "Centred", editorial: "Editorial", bottom: "Bottom", top: "Top", "pull-quote": "Pull quote",
  corner: "Corner", "framed-card": "Card", stacked: "Stacked", "margin-rule": "Margin rule", split: "Split", left: "Left",
  low: "Low", panels: "Panels", mirror: "Mirror", axis: "Axis", numbered: "Numbered", ruled: "Ruled", margin: "Margin",
  entry: "Entry", ledger: "Ledger", hero: "Hero", placard: "Placard", script: "Script", notebook: "Notebook",
  card: "Card", flat: "Flat", rules: "Rules", hanging: "Hanging mark",
  glass: "Frosted glass", "big-word": "Oversized word", swiss: "Swiss grid", strip: "Vertical strip", typewriter: "Typewriter",
};
const L = (ids: readonly string[]) => ids.map((id) => ({ id, name: names[id] ?? id }));

const T = (key: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, kind: "text", ...extra });
const A = (key: string, label: string, rows = 4, extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, kind: "textarea", rows, ...extra });

const EMPHASIS_HINT = "Wrap words in *asterisks* for emphasis.";

export const FORMATS: Record<FormatId, FormatDef> = {
  classic: {
    id: "classic", name: "Classic", description: "Quote with an optional author.",
    fields: [A("text", "Quote", 4, { hint: EMPHASIS_HINT }), T("author", "Author", { optional: true, placeholder: "Leave empty for your own lines" })],
    layouts: L(CLASSIC_LAYOUTS),
    sample: { format: "classic", text: "Most people don't want the truth. They want a *quieter* version of it they can live next to.", author: "" },
    compose: composeClassic,
  },
  hbp: {
    id: "hbp", name: "Hook / Body / Punchline", description: "Large hook, calm body, a punchline set apart.",
    fields: [A("hook", "Hook", 2), A("body", "Body", 4), A("punchline", "Punchline", 2)],
    layouts: L(HBP_LAYOUTS),
    sample: {
      format: "hbp",
      hook: "Nobody is coming.",
      body: "Not the mentor, not the lucky break, not the version of you that finally feels ready. The room stays exactly as you leave it.",
      punchline: "The door was never locked.",
    },
    compose: composeHbp,
  },
  carousel: {
    id: "carousel", name: "Carousel", description: "Hook, body and punchline across 3–5 numbered slides.",
    fields: [A("hook", "Hook", 2), A("body", "Body", 6, { hint: "Split into slides at sentence boundaries, about 170 characters each." }), A("punchline", "Punchline", 2)],
    layouts: L(CAROUSEL_LAYOUTS),
    sample: {
      format: "carousel",
      hook: "Comfort is a loan.",
      body: "It feels free when you take it. The interest is invisible for years. Then one morning you notice the calls you stopped making and the rooms you no longer enter. Nobody sent a bill. You paid in time.",
      punchline: "Every loan is repaid in the currency you value most.",
    },
    compose: composeCarousel,
    slideCount: (c) => Math.max(1, carouselSlides(c).length),
  },
  "one-liner": {
    id: "one-liner", name: "One-liner", description: "A single sharp sentence, maximum whitespace.",
    fields: [A("text", "Line", 2)],
    layouts: L(ONE_LINER_LAYOUTS),
    sample: { format: "one-liner", text: "The city does not remember the people who waited." },
    compose: composeOneLiner,
  },
  highlight: {
    id: "highlight", name: "Highlight", description: "Emphasised words get colour, italic, underline or marker.",
    fields: [A("text", "Quote", 4, { hint: "Wrap the words to highlight in *asterisks*." }), T("author", "Author", { optional: true })],
    layouts: L(HIGHLIGHT_LAYOUTS),
    sample: { format: "highlight", text: "We call it *patience* when it is only *fear* with better posture." },
    compose: composeHighlight,
  },
  contrast: {
    id: "contrast", name: "Contrast", description: "What most people think, and what is actually true.",
    fields: [T("labelA", "First label", { placeholder: "Most people think" }), A("a", "First statement", 2), T("labelB", "Second label", { placeholder: "In reality" }), A("b", "Second statement", 2)],
    layouts: L(PAIR_LAYOUTS),
    sample: { format: "contrast", labelA: "", a: "Silence means nothing is happening.", labelB: "", b: "Silence is where the decisions are made." },
    compose: composePair,
  },
  "myth-truth": {
    id: "myth-truth", name: "Myth vs Truth", description: "A common myth and the plain truth.",
    fields: [T("labelA", "First label", { placeholder: "Myth" }), A("a", "Myth", 2), T("labelB", "Second label", { placeholder: "Truth" }), A("b", "Truth", 2)],
    layouts: L(PAIR_LAYOUTS),
    sample: { format: "myth-truth", labelA: "", a: "You will know when you are ready.", labelB: "", b: "Ready is a feeling that arrives after you start." },
    compose: composePair,
  },
  "then-now": {
    id: "then-now", name: "Then / Now", description: "Before and after.",
    fields: [T("labelA", "First label", { placeholder: "Then" }), A("a", "Then", 2), T("labelB", "Second label", { placeholder: "Now" }), A("b", "Now", 2)],
    layouts: L(PAIR_LAYOUTS),
    sample: { format: "then-now", labelA: "", a: "I wanted to be understood.", labelB: "", b: "I want to be left alone to work." },
    compose: composePair,
  },
  paradox: {
    id: "paradox", name: "Paradox", description: "Two lines that contradict each other, mirrored.",
    fields: [A("first", "First line", 2), A("second", "Second line", 2)],
    layouts: L(PARADOX_LAYOUTS),
    sample: { format: "paradox", first: "The more doors you keep open,", second: "the fewer rooms you ever enter." },
    compose: composeParadox,
  },
  list: {
    id: "list", name: "List", description: "A title and 3–7 numbered or ruled items.",
    fields: [T("title", "Title"), { key: "items", label: "Items (3–7)", kind: "list", hint: "One item per line." }],
    layouts: L(LIST_LAYOUTS),
    sample: {
      format: "list",
      title: "Things I stopped doing",
      items: ["Explaining myself twice", "Answering at midnight", "Waiting for the right mood", "Keeping score", "Arguing with weather"],
    },
    compose: composeList,
  },
  qa: {
    id: "qa", name: "Question + Answer", description: "A question and its answer.",
    fields: [A("question", "Question", 2), A("answer", "Answer", 3)],
    layouts: L(QA_LAYOUTS),
    sample: { format: "qa", question: "What do you owe the people who doubted you?", answer: "Nothing. Not even the satisfaction of proving them wrong." },
    compose: composeQa,
  },
  definition: {
    id: "definition", name: "Definition", description: "A dictionary entry.",
    fields: [T("word", "Word"), T("phonetic", "Phonetic", { optional: true }), T("pos", "Part of speech", { optional: true, placeholder: "noun" }), A("definition", "Definition", 3), A("usage", "Usage note", 2, { optional: true })],
    layouts: L(DEFINITION_LAYOUTS),
    sample: {
      format: "definition",
      word: "Solitude",
      phonetic: "ˈsɒl.ɪ.tjuːd",
      pos: "noun",
      definition: "The condition in which a person finally hears their own opinion.",
      usage: "He mistook it for loneliness for years.",
    },
    compose: composeDefinition,
  },
  equation: {
    id: "equation", name: "Equation", description: "Formula-style ideas with aligned operators.",
    fields: [A("equation", "Equation", 3, { hint: "Use x or * for ×, a spaced - for −. Several lines align on =." }), T("caption", "Caption", { optional: true })],
    layouts: L(EQUATION_LAYOUTS),
    sample: { format: "equation", equation: "Comfort x Time = Regret", caption: "Compounded quietly." },
    compose: composeEquation,
    monoAllowed: true,
  },
  stat: {
    id: "stat", name: "Stat", description: "One big number and a line of context.",
    fields: [T("number", "Number"), A("context", "Context", 2), T("source", "Source", { optional: true })],
    layouts: L(STAT_LAYOUTS),
    sample: { format: "stat", number: "4,000", context: "weeks in a long life. Most of them feel like Tuesday.", source: "" },
    compose: composeStat,
  },
  law: {
    id: "law", name: "Law", description: "Fred's Law No. 12, followed by the statement.",
    fields: [T("name", "Name", { placeholder: "Fred's Law" }), T("number", "Number"), A("statement", "Statement", 3)],
    layouts: L(LAW_LAYOUTS),
    sample: { format: "law", name: "", number: "12", statement: "Any plan that requires everyone to be reasonable is not a plan." },
    compose: composeLaw,
  },
  dialogue: {
    id: "dialogue", name: "Dialogue", description: "Two short speaker lines.",
    fields: [T("speakerA", "First speaker"), A("lineA", "First line", 2), T("speakerB", "Second speaker"), A("lineB", "Second line", 2)],
    layouts: L(DIALOGUE_LAYOUTS),
    sample: { format: "dialogue", speakerA: "Young man", lineA: "When does it get easier?", speakerB: "Old man", lineB: "It doesn't. You just stop asking." },
    compose: composeDialogue,
  },
  stanza: {
    id: "stanza", name: "Stanza", description: "Verse with its line breaks preserved.",
    fields: [T("title", "Title", { optional: true }), A("text", "Verse", 6, { hint: "Line breaks are kept exactly." }), T("author", "Author", { optional: true })],
    layouts: L(STANZA_LAYOUTS),
    sample: { format: "stanza", title: "Stone", text: "The river argues with the stone\nfor a thousand years\nand wins\nwithout raising its voice." },
    compose: composeStanza,
  },
  "field-note": {
    id: "field-note", name: "Field Note", description: "A dated observation, like a notebook entry.",
    fields: [T("date", "Date", { placeholder: "04.10.2026" }), T("place", "Place", { optional: true }), A("text", "Observation", 4)],
    layouts: L(FIELD_NOTE_LAYOUTS),
    sample: {
      format: "field-note",
      date: "04.10.2026",
      place: "Nairobi, 6:40 a.m.",
      text: "The matatu driver checks his mirror more than the road. Everyone in this city is watching what is behind them.",
    },
    compose: composeFieldNote,
    monoAllowed: true,
  },
  "post-card": {
    id: "post-card", name: "Post Card", description: "A clean social post with your name and handle.",
    fields: [A("text", "Post", 4), T("date", "Date", { optional: true, placeholder: "4 Oct 2026" })],
    layouts: L(POST_CARD_LAYOUTS),
    sample: {
      format: "post-card",
      text: "Most advice is autobiography. Read it the way you would read someone's diary: with interest, and without obeying it.",
      date: "4 Oct 2026",
    },
    compose: composePostCard,
    monoAllowed: true,
  },
  "pull-quote": {
    id: "pull-quote", name: "Pull Quote", description: "Magazine style, thin rules and an oversized mark.",
    fields: [A("text", "Quote", 3), T("source", "Source", { optional: true })],
    layouts: L(PULL_QUOTE_LAYOUTS),
    sample: { format: "pull-quote", text: "The ocean is honest about its size. Most people are not.", source: "Field notes, 2026" },
    compose: composePullQuote,
  },
};

export const FORMAT_LIST = Object.values(FORMATS);

/** The template's layout if the format has it, else the format's first layout. */
export function resolveLayout(format: FormatId, layout: string): string {
  const def = FORMATS[format];
  return def.layouts.some((l) => l.id === layout) ? layout : def.layouts[0].id;
}

export function composeFormat(lc: LayoutContext, c: QuoteContent): Composition {
  const def = FORMATS[c.format] ?? FORMATS.classic;
  return def.compose(lc, c, resolveLayout(def.id, lc.template.layout));
}

/** Part of the canvas a layout confines text and signature to, if any. */
export function layoutArea(format: FormatId, layout: string, W: number, H: number) {
  const l = resolveLayout(format, layout);
  return archetypeArea(l, W, H);
}

export const slideCount = (c: QuoteContent) => FORMATS[c.format]?.slideCount?.(c) ?? 1;
