"use client";
/**
 * IndexedDB storage: image-search cache, favourite templates, the user's own
 * templates, the quote library and the export history.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { SearchResponse } from "@/lib/images/types";
import type { QuoteContent, TemplateConfig } from "@/lib/render/template";

export interface SavedQuote {
  /** Hash of the content, so re-importing never duplicates a quote. */
  id: string;
  content: QuoteContent;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface HistoryEntry {
  id?: number;
  at: number;
  kind: "single" | "carousel" | "batch";
  /** File name that was downloaded. */
  name: string;
  files: number;
  format: string;
  presetId: string;
  width: number;
  height: number;
  template?: TemplateConfig;
  content?: QuoteContent;
  /** Batch: first lines of the quotes, for display. */
  preview?: string;
}

interface PqsDB extends DBSchema {
  imageSearch: { key: string; value: { key: string; at: number; response: SearchResponse } };
  favorites: { key: string; value: { id: string; at: number } };
  myTemplates: { key: string; value: TemplateConfig & { savedAt: number } };
  quotes: { key: string; value: SavedQuote; indexes: { updatedAt: number } };
  history: { key: number; value: HistoryEntry; indexes: { at: number } };
}

let dbp: Promise<IDBPDatabase<PqsDB>> | null = null;
export function db() {
  dbp ??= openDB<PqsDB>("pqs", 3, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) d.createObjectStore("imageSearch", { keyPath: "key" });
      if (oldVersion < 2) {
        d.createObjectStore("favorites", { keyPath: "id" });
        d.createObjectStore("myTemplates", { keyPath: "id" });
      }
      if (oldVersion < 3) {
        d.createObjectStore("quotes", { keyPath: "id" }).createIndex("updatedAt", "updatedAt");
        d.createObjectStore("history", { keyPath: "id", autoIncrement: true }).createIndex("at", "at");
      }
    },
  });
  return dbp;
}

const DAY = 86_400_000;

export async function getCachedSearch(key: string): Promise<SearchResponse | null> {
  try {
    const row = await (await db()).get("imageSearch", key);
    return row && Date.now() - row.at < DAY ? row.response : null;
  } catch {
    return null;
  }
}

export async function putCachedSearch(key: string, response: SearchResponse) {
  try {
    await (await db()).put("imageSearch", { key, at: Date.now(), response });
  } catch {
    // Private mode or quota: caching is an optimisation only.
  }
}

export async function listFavorites(): Promise<string[]> {
  try {
    return (await (await db()).getAll("favorites")).sort((a, b) => b.at - a.at).map((f) => f.id);
  } catch {
    return [];
  }
}

export async function setFavorite(id: string, on: boolean) {
  const d = await db();
  if (on) await d.put("favorites", { id, at: Date.now() });
  else await d.delete("favorites", id);
}

export async function listMyTemplates(): Promise<TemplateConfig[]> {
  try {
    return (await (await db()).getAll("myTemplates")).sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function saveMyTemplate(t: TemplateConfig) {
  await (await db()).put("myTemplates", { ...t, savedAt: Date.now() });
}

export async function deleteMyTemplate(id: string) {
  await (await db()).delete("myTemplates", id);
}

// ---------------------------------------------------------------- library

/** Stable id from the content (FNV-1a over the canonical JSON). */
export function quoteId(content: QuoteContent): string {
  const canonical = JSON.stringify(Object.keys(content).filter((k) => k !== "slide").sort().map((k) => [k, content[k]]));
  let h = 2166136261;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `q-${(h >>> 0).toString(36)}-${canonical.length.toString(36)}`;
}

export async function listQuotes(): Promise<SavedQuote[]> {
  try {
    return (await (await db()).getAllFromIndex("quotes", "updatedAt")).reverse();
  } catch {
    return [];
  }
}

/** Saves quotes (merging tags into existing copies). Returns how many were new. */
export async function saveQuotes(items: { content: QuoteContent; tags: string[] }[]): Promise<number> {
  const d = await db();
  const tx = d.transaction("quotes", "readwrite");
  let added = 0;
  const now = Date.now();
  for (const [i, item] of items.entries()) {
    const content = { ...item.content };
    delete content.slide;
    const id = quoteId(content);
    const prev = await tx.store.get(id);
    if (!prev) added++;
    // Keep import order stable: earlier items get slightly later timestamps.
    await tx.store.put({ id, content, tags: [...new Set([...(prev?.tags ?? []), ...item.tags])], createdAt: prev?.createdAt ?? now, updatedAt: prev ? prev.updatedAt : now + items.length - i });
  }
  await tx.done;
  return added;
}

export async function updateQuoteTags(id: string, tags: string[]) {
  const d = await db();
  const q = await d.get("quotes", id);
  if (q) await d.put("quotes", { ...q, tags, updatedAt: Date.now() });
}

export async function deleteQuote(id: string) {
  await (await db()).delete("quotes", id);
}

// ---------------------------------------------------------------- history

export async function addHistory(e: HistoryEntry) {
  try {
    await (await db()).add("history", e);
  } catch {}
}

export async function listHistory(limit = 300): Promise<HistoryEntry[]> {
  try {
    return (await (await db()).getAllFromIndex("history", "at")).reverse().slice(0, limit);
  } catch {
    return [];
  }
}

export async function clearHistory() {
  await (await db()).clear("history");
}
