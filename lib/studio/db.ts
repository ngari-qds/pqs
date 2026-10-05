"use client";
/**
 * IndexedDB storage: image-search cache, favourite templates and the user's
 * own saved templates. Saved quotes and export history arrive in step 5.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { SearchResponse } from "@/lib/images/types";
import type { TemplateConfig } from "@/lib/render/template";

interface PqsDB extends DBSchema {
  imageSearch: { key: string; value: { key: string; at: number; response: SearchResponse } };
  favorites: { key: string; value: { id: string; at: number } };
  myTemplates: { key: string; value: TemplateConfig & { savedAt: number } };
}

let dbp: Promise<IDBPDatabase<PqsDB>> | null = null;
export function db() {
  dbp ??= openDB<PqsDB>("pqs", 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) d.createObjectStore("imageSearch", { keyPath: "key" });
      if (oldVersion < 2) {
        d.createObjectStore("favorites", { keyPath: "id" });
        d.createObjectStore("myTemplates", { keyPath: "id" });
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
