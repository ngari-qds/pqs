/**
 * Batch input parsing and per-item template choice.
 *
 * Three ways to write a batch:
 *
 * 1. Plain: quotes separated by blank lines. Each becomes the default format
 *    (Classic unless chosen otherwise). A last line starting with "— " is the author.
 *
 * 2. Groups separated by a line containing only "---". For Hook/Body/Punchline
 *    or Carousel the lines of a group are hook, body…, punchline.
 *
 * 3. Explicit blocks, for any of the 20 formats:
 *
 *        @definition
 *        word: Solitude
 *        phonetic: ˈsɒl.ɪ.tjuːd
 *        pos: noun
 *        definition: The condition in which a person finally hears their own opinion.
 *        tags: solitude, truth
 *
 *    "key: value" sets a field; lines without a key continue the previous field
 *    (line breaks are kept, so verse works); "- item" lines fill a list; text
 *    before the first key fills the format's first field. Lines starting with
 *    "//" are comments.
 */
import { FORMATS, resolveLayout } from "@/lib/render/formats";
import { getPairing } from "@/lib/render/pairings";
import { getPalette } from "@/lib/render/palettes";
import { FORMAT_IDS, type BackgroundConfig, type FormatId, type QuoteContent, type TemplateConfig } from "@/lib/render/template";
import { violations } from "@/lib/templates/generator";
import { autoStructure } from "./autostructure";

export interface BatchItem {
  content: QuoteContent;
  tags: string[];
  /** 1-based line where the item starts, for error messages. */
  line: number;
  errors: string[];
}

const AUTHOR_LINE = /^[—–~-]{1,2}\s+(.+)$/;
const FIELD_LINE = /^([A-Za-z]+):\s?(.*)$/;

interface RawBlock {
  format?: FormatId;
  unknownFormat?: string;
  lines: string[];
  line: number;
}

function splitBlocks(text: string): RawBlock[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const structured = lines.some((l) => /^@[a-z-]+\s*$/i.test(l.trim()) || l.trim() === "---");
  const blocks: RawBlock[] = [];
  let cur: RawBlock | null = null;
  const close = () => {
    if (cur && cur.lines.some((l) => l.trim())) blocks.push(cur);
    cur = null;
  };
  lines.forEach((raw, i) => {
    const t = raw.trim();
    if (t.startsWith("//")) return;
    if (structured) {
      if (t === "---") return close();
      const at = t.match(/^@([a-z-]+)$/i);
      if (at) {
        close();
        const id = at[1].toLowerCase() as FormatId;
        cur = FORMAT_IDS.includes(id) ? { format: id, lines: [], line: i + 1 } : { unknownFormat: at[1], lines: [], line: i + 1 };
        return;
      }
    } else if (!t) return close();
    if (!cur) cur = { lines: [], line: i + 1 };
    cur.lines.push(raw.replace(/\s+$/, ""));
  });
  close();
  // Trim blank lines at the edges of each block (interior ones are kept for verse).
  for (const b of blocks) {
    while (b.lines.length && !b.lines[0].trim()) b.lines.shift();
    while (b.lines.length && !b.lines[b.lines.length - 1].trim()) b.lines.pop();
  }
  return blocks;
}

const parseTags = (v: string) => v.split(",").map((t) => t.trim().replace(/^#/, "").toLowerCase()).filter(Boolean);

/** Fields of an explicit @format block. */
function parseFields(format: FormatId, lines: string[]): { content: QuoteContent; tags: string[] } {
  const def = FORMATS[format];
  const keys = new Map(def.fields.map((f) => [f.key.toLowerCase(), f]));
  const listKey = def.fields.find((f) => f.kind === "list")?.key;
  const content: QuoteContent = { format };
  let tags: string[] = [];
  let current = def.fields[0].key;
  const append = (key: string, text: string) => {
    const prev = content[key];
    content[key] = typeof prev === "string" && prev.length ? `${prev}\n${text}` : text;
  };
  for (const line of lines) {
    const m = line.trim().match(FIELD_LINE);
    if (m && m[1].toLowerCase() === "tags") {
      tags = parseTags(m[2]);
      continue;
    }
    if (m && keys.has(m[1].toLowerCase())) {
      const f = keys.get(m[1].toLowerCase())!;
      current = f.key;
      if (f.kind === "list") content[f.key] = m[2].trim() ? [m[2].trim()] : [];
      else content[f.key] = m[2].trim();
      continue;
    }
    const item = line.trim().match(/^[-•]\s+(.+)$/);
    // "- item" lines fill the list, unless we are inside a multi-line text field.
    if (listKey && item && def.fields.find((f) => f.key === current)?.kind !== "textarea") {
      const arr = Array.isArray(content[listKey]) ? (content[listKey] as string[]) : [];
      content[listKey] = [...arr, item[1].trim()];
      current = listKey;
      continue;
    }
    append(current, line.trim() ? line.trim() : "");
  }
  for (const [k, v] of Object.entries(content)) if (typeof v === "string") content[k] = v.replace(/\n+$/, "").replace(/^\n+/, "");
  return { content, tags };
}

/** A block without a header, read in the default format. */
function parsePlain(format: FormatId, lines: string[]): { content: QuoteContent; tags: string[] } {
  let tags: string[] = [];
  const kept = lines.filter((l) => {
    const m = l.trim().match(/^tags:\s*(.*)$/i);
    if (m) tags = parseTags(m[1]);
    return !m;
  });
  const nonEmpty = kept.map((l) => l.trim()).filter(Boolean);
  if (format === "hbp" || format === "carousel") {
    if (nonEmpty.length === 1) return { content: { format, ...autoStructure(nonEmpty[0]) }, tags };
    if (nonEmpty.length === 2) return { content: { format, hook: nonEmpty[0], body: "", punchline: nonEmpty[1] }, tags };
    return { content: { format, hook: nonEmpty[0], body: nonEmpty.slice(1, -1).join(" "), punchline: nonEmpty[nonEmpty.length - 1] }, tags };
  }
  let author = "";
  const body = [...nonEmpty];
  const last = body[body.length - 1];
  const am = body.length > 1 ? last.match(AUTHOR_LINE) : null;
  if (am) {
    author = am[1].trim();
    body.pop();
  }
  const def = FORMATS[format];
  // Verse keeps its lines; everything else joins wrapped lines with spaces.
  const primary = def.fields[0].key;
  const text = format === "stanza" ? kept.join("\n").trim() : body.join(" ");
  const content: QuoteContent = { format, [primary]: text };
  const authorKey = def.fields.find((f) => f.key === "author" || f.key === "source")?.key;
  if (author && authorKey) content[authorKey] = author;
  return { content, tags };
}

export function parseBatch(text: string, defaultFormat: FormatId = "classic"): BatchItem[] {
  return splitBlocks(text).map((b) => {
    if (b.unknownFormat) return { content: { format: defaultFormat }, tags: [], line: b.line, errors: [`Unknown format "@${b.unknownFormat}"`] };
    const format = b.format ?? defaultFormat;
    const { content, tags } = b.format ? parseFields(format, b.lines) : parsePlain(format, b.lines);
    const errors: string[] = [];
    for (const f of FORMATS[format].fields) {
      if (f.optional) continue;
      const v = content[f.key];
      const empty = Array.isArray(v) ? v.length === 0 : !String(v ?? "").trim();
      // A missing label/name falls back to the format's default; body text may be empty.
      if (empty && !["labelA", "labelB", "name", "body", "date"].includes(f.key)) errors.push(`missing ${f.label.toLowerCase()}`);
    }
    if (format === "list") {
      const n = (content.items as string[] | undefined)?.length ?? 0;
      if (n && (n < 3 || n > 7)) errors.push(`lists take 3–7 items (has ${n})`);
    }
    return { content, tags, line: b.line, errors };
  });
}

// ------------------------------------------------------------- style families

export interface StyleFamily {
  id: string;
  name: string;
  palette: string;
  pairing: string;
  background: BackgroundConfig;
}

/** Consistent looks for a whole batch: one palette, one pairing, one ground. */
export const STYLE_FAMILIES: StyleFamily[] = [
  { id: "ink", name: "Ink", palette: "ink", pairing: "fraunces-inter", background: { kind: "solid" } },
  { id: "paper", name: "Paper", palette: "paper-ink", pairing: "newsreader-intertight", background: { kind: "paper" } },
  { id: "fog", name: "Fog", palette: "fog", pairing: "instrument-inter", background: { kind: "gradient", angle: 12 } },
  { id: "midnight", name: "Midnight", palette: "midnight", pairing: "caslon-karla", background: { kind: "vignette", strength: 0.4 } },
  { id: "sandstone", name: "Sandstone", palette: "sandstone", pairing: "garamond-plex", background: { kind: "paper" } },
  { id: "graphite", name: "Graphite", palette: "graphite", pairing: "dmserif-dmsans", background: { kind: "gradient", angle: 180 } },
  { id: "teal", name: "Deep Teal", palette: "deep-teal", pairing: "spectral-manrope", background: { kind: "solid" } },
  { id: "oxblood", name: "Oxblood", palette: "oxblood", pairing: "playfair-source", background: { kind: "vignette", strength: 0.4 } },
  { id: "bone", name: "Bone", palette: "bone-rust", pairing: "cormorant-work", background: { kind: "paper" } },
  { id: "mono", name: "Pure Mono", palette: "mono", pairing: "syne-inter", background: { kind: "solid" } },
];

const ok = (format: FormatId, layout: string, pairing: string, palette: string, background: BackgroundConfig) =>
  !violations({ format, layout, pairing: getPairing(pairing), palette: getPalette(palette), background }).length;

/**
 * Template for one batch item: the family's palette, pairing and ground in a
 * layout that suits the format. Where a rule forbids the family's choice
 * (monospace equations, no capitals for long text, …) the nearest valid
 * choice is used instead, so every item stays inside the design rules.
 */
export function templateFor(item: QuoteContent, family: StyleFamily, preferred: TemplateConfig[] = []): TemplateConfig {
  const format = item.format;
  const layouts = [...new Set([...preferred.filter((t) => t.format === format).map((t) => t.layout), ...FORMATS[format].layouts.map((l) => l.id)])];
  const pairings = [family.pairing, ...(format === "equation" ? ["jetbrains", "plex-serif-mono"] : []), "fraunces-inter", "newsreader-intertight"];
  const grounds: BackgroundConfig[] = [family.background, { kind: "solid" }];
  for (const background of grounds)
    for (const pairing of pairings)
      for (const layout of layouts)
        if (ok(format, layout, pairing, family.palette, background))
          return { id: `batch-${family.id}-${format}-${layout}`, name: `${family.name}, ${format}`, format, layout, pairing, palette: family.palette, background };
  return { id: `batch-${family.id}-${format}`, name: family.name, format, layout: resolveLayout(format, ""), pairing: format === "equation" ? "jetbrains" : "fraunces-inter", palette: family.palette, background: { kind: "solid" } };
}

/** Clean file stem: 001_classic_most-people-dont-want-the-truth */
export function batchFileStem(index: number, item: QuoteContent, text: string): string {
  const slug = text.toLowerCase().replace(/\*/g, "").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48).replace(/-$/, "") || "quote";
  return `${String(index + 1).padStart(3, "0")}_${item.format}_${slug}`;
}

/** Writes items back out in the @format block syntax (round-trips with parseBatch). */
export function toBatchText(items: { content: QuoteContent; tags?: string[] }[]): string {
  const out: string[] = [];
  for (const { content, tags } of items) {
    const def = FORMATS[content.format];
    out.push(`@${content.format}`);
    for (const f of def.fields) {
      const v = content[f.key];
      if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) continue;
      if (Array.isArray(v)) {
        out.push(`${f.key}:`);
        for (const item of v) out.push(`- ${item}`);
      } else out.push(`${f.key}: ${String(v)}`);
    }
    if (tags?.length) out.push(`tags: ${tags.join(", ")}`);
    out.push("");
  }
  return out.join("\n");
}
