"use client";
/**
 * IndexedDB storage. Step 2 uses the image-search cache; saved quotes,
 * favourites, presets and history are added to the same database in step 5.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { SearchResponse } from "@/lib/images/types";

interface PqsDB extends DBSchema {
  imageSearch: { key: string; value: { key: string; at: number; response: SearchResponse } };
}

let dbp: Promise<IDBPDatabase<PqsDB>> | null = null;
export function db() {
  dbp ??= openDB<PqsDB>("pqs", 1, {
    upgrade(d) {
      d.createObjectStore("imageSearch", { keyPath: "key" });
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
