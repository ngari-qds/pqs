/**
 * Local test provider (PQS_MOCK_PHOTOS=1). Serves generated high-resolution
 * photos from .mock-photos/ (see scripts/mock-photos.ts) so the full photo
 * pipeline can be exercised without API keys or network access.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PhotoCandidate } from "../types";
import type { ProviderQuery, ProviderResult } from "./common";

export const MOCK_DIR = path.join(process.cwd(), ".mock-photos");

interface MockEntry {
  file: string;
  thumb: string;
  width: number;
  height: number;
  tags: string[];
  author: string;
}

export async function searchMock(q: ProviderQuery): Promise<ProviderResult> {
  let manifest: MockEntry[];
  try {
    manifest = JSON.parse(await readFile(path.join(MOCK_DIR, "manifest.json"), "utf8"));
  } catch {
    return { status: "error", candidates: [], message: "No mock photos. Run: npm run mock:photos" };
  }
  const words = q.query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = manifest
    .map((m) => ({ m, s: words.filter((w) => m.tags.some((t) => t.includes(w) || w.includes(t))).length }))
    .sort((a, b) => b.s - a.s);
  const candidates: PhotoCandidate[] = scored.map(({ m }) => ({
    key: `mock:${m.file}`,
    provider: "mock",
    width: m.width,
    height: m.height,
    src: `/api/images/mock/${m.file}`,
    thumb: `/api/images/mock/${m.thumb}`,
    alt: m.tags.join(", "),
    author: { name: m.author, url: "https://example.invalid/" },
    pageUrl: "https://example.invalid/",
  }));
  return { status: "ok", candidates };
}
