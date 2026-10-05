import type { PhotoCandidate } from "../types";
import { failure, type FetchLike, type ProviderQuery, type ProviderResult } from "./common";

interface PixabayHit {
  id: number;
  pageURL: string;
  imageWidth: number;
  imageHeight: number;
  webformatURL: string;
  largeImageURL: string;
  fullHDURL?: string;
  imageURL?: string;
  user: string;
  user_id: number;
  tags?: string;
}

/** Size of a Pixabay rendition whose longest side is capped at `cap`. */
const capped = (w: number, h: number, cap: number) => {
  const s = Math.min(1, cap / Math.max(w, h));
  return { width: Math.round(w * s), height: Math.round(h * s) };
};

/**
 * Uses the largest URL the key can access: imageURL (original, full API
 * access only) > fullHDURL (1920) > largeImageURL (1280). The reported size is
 * the size of that rendition, so resolution checks stay honest.
 */
export function normalizePixabay(hits: PixabayHit[]): PhotoCandidate[] {
  return hits.map((h) => {
    const best = h.imageURL
      ? { src: h.imageURL, ...capped(h.imageWidth, h.imageHeight, Infinity) }
      : h.fullHDURL
        ? { src: h.fullHDURL, ...capped(h.imageWidth, h.imageHeight, 1920) }
        : { src: h.largeImageURL, ...capped(h.imageWidth, h.imageHeight, 1280) };
    return {
      key: `pixabay:${h.id}`,
      provider: "pixabay",
      width: best.width,
      height: best.height,
      src: best.src,
      thumb: h.webformatURL,
      alt: h.tags,
      author: { name: h.user, url: `https://pixabay.com/users/${encodeURIComponent(h.user)}-${h.user_id}/` },
      pageUrl: h.pageURL,
    };
  });
}

const ORIENT = { portrait: "vertical", landscape: "horizontal", square: "all" } as const;

export async function searchPixabay(
  q: ProviderQuery,
  key: string,
  minSize: { width: number; height: number },
  fetchImpl: FetchLike = fetch,
): Promise<ProviderResult> {
  const params = new URLSearchParams({
    key,
    q: q.query.trim() || "minimal",
    image_type: "photo",
    orientation: ORIENT[q.orientation],
    safesearch: "true",
    per_page: String(Math.max(3, Math.min(200, q.perPage))),
    page: String(q.page),
    min_width: String(minSize.width),
    min_height: String(minSize.height),
  });
  const res = await fetchImpl(`https://pixabay.com/api/?${params}`, { cache: "no-store" });
  if (!res.ok) return failure(res, "Pixabay");
  const json = await res.json();
  return { status: "ok", candidates: normalizePixabay(json.hits ?? []) };
}
