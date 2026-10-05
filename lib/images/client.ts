"use client";
/**
 * Browser side of photo sourcing: cached search, CORS-clean loading through
 * the proxy, decode with resolution verification, and calm-area ranking.
 */
import { getCachedSearch, putCachedSearch } from "@/lib/studio/db";
import type { LayoutId } from "@/lib/render/template";
import { coversTarget, decodeSize, sizedUrl, type Size } from "./resolution";
import { calmScore, textRegionFor } from "./score";
import type { PhotoCandidate, SearchResponse } from "./types";

/** Results are cached per keyword for a day (Unsplash demo keys: 50 req/hour). */
export async function searchPhotos(query: string, target: Size, page = 1): Promise<SearchResponse> {
  // Keyed by the exact export size, because the server filters by it.
  const key = `${query.toLowerCase()}|${target.width}x${target.height}|${page}`;
  const hit = await getCachedSearch(key);
  if (hit) return hit;
  const params = new URLSearchParams({ q: query, w: String(target.width), h: String(target.height), page: String(page) });
  const res = await fetch(`/api/images/search?${params}`);
  if (!res.ok) throw new Error(`Image search failed (${res.status})`);
  const json: SearchResponse = await res.json();
  if (json.candidates.length) await putCachedSearch(key, json);
  return json;
}

/** Same-origin URL for any candidate asset (mock files are already local). */
export const proxied = (url: string) => (url.startsWith("/") ? url : `/api/images/file?u=${encodeURIComponent(url)}`);

export class PhotoTooSmallError extends Error {}

export interface LoadedPhoto {
  candidate: PhotoCandidate;
  bitmap: ImageBitmap;
  /** The export size this bitmap was verified against. */
  verifiedFor: Size;
}

/**
 * Fetches and decodes a candidate at a size that covers `target`. Decoding
 * uses createImageBitmap with high-quality resizing for very large originals,
 * and the decoded size is verified: a photo is never accepted below target.
 */
export async function loadPhoto(c: PhotoCandidate, target: Size, signal?: AbortSignal): Promise<LoadedPhoto> {
  const s = sizedUrl(c, target);
  const res = await fetch(proxied(s.url), { signal });
  if (!res.ok) throw new Error(`Photo download failed (${res.status})`);
  const blob = await res.blob();
  const probe = await createImageBitmap(blob);
  if (!coversTarget(probe, target)) {
    probe.close();
    throw new PhotoTooSmallError(`${c.key} is ${probe.width}×${probe.height}, below ${target.width}×${target.height}`);
  }
  const resize = decodeSize(probe, target);
  if (!resize) return { candidate: c, bitmap: probe, verifiedFor: target };
  probe.close();
  const bitmap = await createImageBitmap(blob, { resizeWidth: resize.width, resizeHeight: resize.height, resizeQuality: "high" });
  return { candidate: c, bitmap, verifiedFor: target };
}

/** Loads thumbnails and orders candidates calmest-first for the layout's text region. */
export async function rankByCalm(cands: PhotoCandidate[], layout: LayoutId, aspect: number, limit = 12): Promise<PhotoCandidate[]> {
  const region = textRegionFor(layout);
  const head = cands.slice(0, limit);
  const scored = await Promise.all(
    head.map(async (c, i) => {
      try {
        const blob = await (await fetch(proxied(c.thumb))).blob();
        const bmp = await createImageBitmap(blob);
        // Cover-crop the thumbnail to the canvas aspect, at ~64px wide.
        const w = 64, h = Math.round(64 / aspect);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        const f = Math.max(w / bmp.width, h / bmp.height);
        const sw = w / f, sh = h / f;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, w, h);
        bmp.close();
        return { c, s: calmScore(ctx.getImageData(0, 0, w, h).data, w, h, region).score, i };
      } catch {
        return { c, s: Infinity, i };
      }
    }),
  );
  scored.sort((a, b) => a.s - b.s || a.i - b.i);
  return [...scored.map((x) => x.c), ...cands.slice(limit)];
}

/** Pings Unsplash's download endpoint (via our server) on export. */
export async function trackDownload(c: PhotoCandidate) {
  if (c.provider !== "unsplash" || !c.downloadLocation) return;
  try {
    await fetch("/api/images/download", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location: c.downloadLocation }),
      keepalive: true,
    });
  } catch {}
}
