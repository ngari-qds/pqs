import type { PhotoCandidate } from "../types";
import { failure, readRemaining, type FetchLike, type ProviderQuery, type ProviderResult } from "./common";

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  avg_color?: string;
  alt?: string;
  src: { original: string; large: string; medium: string };
}

export function normalizePexels(photos: PexelsPhoto[]): PhotoCandidate[] {
  return photos.map((p) => ({
    key: `pexels:${p.id}`,
    provider: "pexels",
    width: p.width,
    height: p.height,
    src: p.src.original,
    thumb: p.src.medium,
    color: p.avg_color,
    alt: p.alt || undefined,
    author: { name: p.photographer, url: p.photographer_url },
    pageUrl: p.url,
  }));
}

export async function searchPexels(q: ProviderQuery, key: string, fetchImpl: FetchLike = fetch): Promise<ProviderResult> {
  const params = new URLSearchParams({
    query: q.query.trim() || "minimal",
    orientation: q.orientation,
    per_page: String(Math.min(80, q.perPage)),
    page: String(q.page),
  });
  const res = await fetchImpl(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: key }, cache: "no-store" });
  if (!res.ok) return failure(res, "Pexels");
  const json = await res.json();
  return { status: "ok", candidates: normalizePexels(json.photos ?? []), rateRemaining: readRemaining(res) };
}
