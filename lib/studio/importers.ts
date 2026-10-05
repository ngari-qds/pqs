/**
 * Importers for uploaded quote files:
 *   .txt / .md  — the batch syntax (see batch.ts), including @format+ sections
 *   .json       — an array of quote contents ({ format, …fields }), of
 *                 { content, tags } objects, or { quotes: [...] }
 *   .csv        — a header row of field names (format, text, author, hook,
 *                 body, punchline, a, b, items, …, tags); list items in one
 *                 cell separated by " | "; tags separated by "," or ";"
 */
import { FORMATS } from "@/lib/render/formats";
import { FORMAT_IDS, type FormatId, type QuoteContent } from "@/lib/render/template";
import { parseBatch, type BatchItem } from "./batch";

export const IMPORT_ACCEPT = ".txt,.md,.markdown,.json,.csv,text/plain,text/markdown,application/json,text/csv";

const tagList = (v: unknown): string[] =>
  (Array.isArray(v) ? v.map(String) : String(v ?? "").split(/[;,]/)).map((t) => t.trim().replace(/^#/, "").toLowerCase()).filter(Boolean);

/** Validates one content object against its format's fields. */
function toItem(raw: Record<string, unknown>, tags: string[], line: number, defaultFormat: FormatId): BatchItem {
  const format = (String(raw.format ?? defaultFormat).trim().toLowerCase() || defaultFormat) as FormatId;
  if (!FORMAT_IDS.includes(format)) return { content: { format: defaultFormat }, tags, line, errors: [`Unknown format "${String(raw.format)}"`] };
  const def = FORMATS[format];
  const content: QuoteContent = { format };
  for (const f of def.fields) {
    const v = raw[f.key];
    if (v === undefined || v === null || v === "") continue;
    if (f.kind === "list") content[f.key] = (Array.isArray(v) ? v.map(String) : String(v).split(/\s*\|\s*|\n/)).map((x) => x.trim()).filter(Boolean);
    else content[f.key] = String(v);
  }
  // Same required-field rules as the batch parser.
  const errors: string[] = [];
  for (const f of def.fields) {
    if (f.optional || ["labelA", "labelB", "name", "body", "date"].includes(f.key)) continue;
    const v = content[f.key];
    if (Array.isArray(v) ? !v.length : !String(v ?? "").trim()) errors.push(`missing ${f.label.toLowerCase()}`);
  }
  return { content, tags, line, errors };
}

export function parseJson(text: string, defaultFormat: FormatId = "classic"): BatchItem[] {
  const data = JSON.parse(text);
  const arr: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.quotes) ? data.quotes : [data];
  return arr.map((x, i) => {
    const o = (x ?? {}) as Record<string, unknown>;
    if (o.content && typeof o.content === "object") return toItem(o.content as Record<string, unknown>, tagList(o.tags), i + 1, defaultFormat);
    const { tags, ...rest } = o;
    return toItem(rest, tagList(tags), i + 1, defaultFormat);
  });
}

/** RFC 4180-style CSV: quoted fields, doubled quotes, newlines inside quotes. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

export function parseCsv(text: string, defaultFormat: FormatId = "classic"): BatchItem[] {
  const [head, ...rows] = csvRows(text);
  if (!head) return [];
  const keys = head.map((h) => h.trim());
  return rows.map((r, i) => {
    const o: Record<string, string> = {};
    keys.forEach((k, j) => (o[k] = (r[j] ?? "").trim()));
    const { tags, ...rest } = o;
    // A CSV with only a "text" (or "quote") column is a list of default-format quotes.
    if (!rest.text && rest.quote) rest.text = rest.quote;
    return toItem(rest, tagList(tags), i + 2, defaultFormat);
  });
}

/** Parses an uploaded file by its extension. */
export function parseImportFile(name: string, text: string, defaultFormat: FormatId = "classic"): BatchItem[] {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "json") return parseJson(text, defaultFormat);
  if (ext === "csv") return parseCsv(text, defaultFormat);
  return parseBatch(text, defaultFormat);
}

/** Reads File objects (from an <input type=file> or a drop) into items, per file. */
export async function readImportFiles(files: FileList | File[], defaultFormat: FormatId = "classic") {
  const out: { name: string; items: BatchItem[]; error?: string }[] = [];
  for (const f of Array.from(files)) {
    try {
      out.push({ name: f.name, items: parseImportFile(f.name, await f.text(), defaultFormat) });
    } catch (e) {
      out.push({ name: f.name, items: [], error: (e as Error).message });
    }
  }
  return out;
}
