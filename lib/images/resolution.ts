/**
 * Resolution rules. A photo is usable only if its original covers the export
 * canvas in both dimensions, so cover-cropping never scales it above 1.0x.
 */
import type { PhotoCandidate } from "./types";

export interface Size {
  width: number;
  height: number;
}

/** True when an image of `img` size can cover `target` without upscaling. */
export function coversTarget(img: Size, target: Size): boolean {
  return img.width >= target.width && img.height >= target.height;
}

/**
 * Width to request so the delivered image still covers the target after a
 * cover crop: max(target width, target height × image aspect), capped at the
 * original width.
 */
export function neededWidth(img: Size, target: Size): number {
  const w = Math.max(target.width, Math.ceil((target.height * img.width) / img.height));
  return Math.min(img.width, w);
}

/** Provider URL for a size that covers `target` (never larger than needed for Unsplash). */
export function sizedUrl(c: PhotoCandidate, target: Size): { url: string; width: number; height: number } {
  if (c.provider === "unsplash") {
    const w = neededWidth(c, target);
    const sep = c.src.includes("?") ? "&" : "?";
    return {
      url: `${c.src}${sep}w=${w}&q=90&fm=jpg&fit=crop&crop=entropy`,
      width: w,
      height: Math.round((w * c.height) / c.width),
    };
  }
  // Pexels: src.original. Pixabay: largest URL the key may access. Resized client-side.
  return { url: c.src, width: c.width, height: c.height };
}

/**
 * Decode budget: originals much larger than needed are downscaled at decode
 * time (high quality) to at most 2x the cover size, which bounds memory while
 * leaving the renderer a clean final reduction.
 */
export function decodeSize(img: Size, target: Size): Size | null {
  const factor = Math.max(target.width / img.width, target.height / img.height); // < 1 when larger
  if (factor >= 0.5) return null; // within 2x: decode as-is
  const s = factor * 2;
  return { width: Math.ceil(img.width * s), height: Math.ceil(img.height * s) };
}
