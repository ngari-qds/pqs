/** Shared photo types, used by the server proxy and the browser client. */

export type ProviderId = "unsplash" | "pexels" | "pixabay" | "mock";

export interface PhotoCandidate {
  /** Unique across providers: `${provider}:${id}`. */
  key: string;
  provider: ProviderId;
  /** Pixel size of the largest file we are allowed to fetch. */
  width: number;
  height: number;
  /** Base URL of that largest file. Use `sizedUrl()` to request a size. */
  src: string;
  /** Small preview for calm-area scoring and the picker (~400px). */
  thumb: string;
  color?: string;
  alt?: string;
  author: { name: string; url: string };
  /** Photo page on the provider site (attribution link). */
  pageUrl: string;
  /** Unsplash only: must be pinged on every export (API guidelines). */
  downloadLocation?: string;
}

export type ProviderStatus = "ok" | "no-key" | "rate-limited" | "error" | "empty" | "skipped";

export interface ProviderReport {
  provider: ProviderId;
  status: ProviderStatus;
  /** Candidates returned by the API. */
  found: number;
  /** Candidates rejected because the original is smaller than the export. */
  tooSmall: number;
  message?: string;
}

export interface SearchResponse {
  query: string;
  candidates: PhotoCandidate[];
  providers: ProviderReport[];
  /** No provider has a key configured: the studio uses generated backgrounds. */
  offline: boolean;
  unsplashRemaining?: number;
}

export const PROVIDER_NAMES: Record<ProviderId, string> = {
  unsplash: "Unsplash",
  pexels: "Pexels",
  pixabay: "Pixabay",
  mock: "Local test photos",
};
