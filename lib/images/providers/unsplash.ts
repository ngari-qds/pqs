import type { PhotoCandidate } from "../types";
import { failure, readRemaining, type FetchLike, type ProviderQuery, type ProviderResult } from "./common";

interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  color?: string;
  alt_description?: string | null;
  description?: string | null;
  urls: { raw: string; small: string; thumb: string };
  links: { html: string; download_location: string };
  user: { name: string; links: { html: string } };
}

export function normalizeUnsplash(photos: UnsplashPhoto[]): PhotoCandidate[] {
  return photos.map((p) => ({
    key: `unsplash:${p.id}`,
    provider: "unsplash",
    width: p.width,
    height: p.height,
    src: p.urls.raw,
    thumb: p.urls.small,
    color: p.color,
    alt: p.alt_description ?? p.description ?? undefined,
    author: { name: p.user.name, url: p.user.links.html },
    pageUrl: p.links.html,
    downloadLocation: p.links.download_location,
  }));
}

const ORIENT = { portrait: "portrait", landscape: "landscape", square: "squarish" } as const;

/** search/photos for a keyword, photos/random when the query is empty. */
export async function searchUnsplash(q: ProviderQuery, key: string, fetchImpl: FetchLike = fetch): Promise<ProviderResult> {
  const headers = { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" };
  const params = new URLSearchParams({ orientation: ORIENT[q.orientation], content_filter: "high" });
  let url: string;
  if (q.query.trim()) {
    params.set("query", q.query);
    params.set("per_page", String(Math.min(30, q.perPage)));
    params.set("page", String(q.page));
    url = `https://api.unsplash.com/search/photos?${params}`;
  } else {
    params.set("count", String(Math.min(30, q.perPage)));
    url = `https://api.unsplash.com/photos/random?${params}`;
  }
  const res = await fetchImpl(url, { headers, cache: "no-store" });
  if (!res.ok) return failure(res, "Unsplash");
  const json = await res.json();
  const photos: UnsplashPhoto[] = Array.isArray(json) ? json : json.results ?? [];
  return { status: "ok", candidates: normalizeUnsplash(photos), rateRemaining: readRemaining(res) };
}
