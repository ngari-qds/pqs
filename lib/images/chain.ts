/**
 * Server-side provider chain: Unsplash → Pexels → Pixabay. Tracks Unsplash's
 * hourly quota, caches results per query for an hour, and drops every photo
 * whose original is smaller than the export size.
 */
import { coversTarget, type Size } from "./resolution";
import { orientationFor, type FetchLike, type ProviderQuery, type ProviderResult } from "./providers/common";
import { searchPexels } from "./providers/pexels";
import { searchPixabay } from "./providers/pixabay";
import { searchUnsplash } from "./providers/unsplash";
import type { PhotoCandidate, ProviderId, ProviderReport, SearchResponse } from "./types";

export interface ChainKeys {
  unsplash?: string;
  pexels?: string;
  pixabay?: string;
}

export interface ChainDeps {
  keys: ChainKeys;
  fetchImpl?: FetchLike;
  /** Overrides for tests / mock mode. */
  providers?: Partial<Record<ProviderId, (q: ProviderQuery, target: Size) => Promise<ProviderResult>>>;
  order?: ProviderId[];
  now?: () => number;
}

/** Enough usable photos to shuffle through before trying the next provider. */
export const MIN_USABLE = 6;
const HOUR = 3600_000;

const state = {
  unsplashRemaining: undefined as number | undefined,
  unsplashBlockedUntil: 0,
  cache: new Map<string, { at: number; result: ProviderResult }>(),
};

/** Test hook. */
export function resetChainState() {
  state.unsplashRemaining = undefined;
  state.unsplashBlockedUntil = 0;
  state.cache.clear();
}

export async function searchChain(query: string, target: Size, page: number, deps: ChainDeps): Promise<SearchResponse> {
  const now = deps.now ?? Date.now;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const order: ProviderId[] = deps.order ?? ["unsplash", "pexels", "pixabay"];
  const q: ProviderQuery = { query, orientation: orientationFor(target.width, target.height), page, perPage: 30 };

  const run = async (id: ProviderId): Promise<ProviderResult | "no-key" | "skipped"> => {
    const override = deps.providers?.[id];
    if (override) return override(q, target);
    const key = id === "mock" ? undefined : deps.keys[id];
    if (!key) return "no-key";
    switch (id) {
      case "unsplash":
        if (now() < state.unsplashBlockedUntil) return "skipped";
        return searchUnsplash(q, key, fetchImpl);
      case "pexels":
        return searchPexels(q, key, fetchImpl);
      case "pixabay":
        return searchPixabay(q, key, target, fetchImpl);
      default:
        return "no-key";
    }
  };

  const reports: ProviderReport[] = [];
  const usable: PhotoCandidate[] = [];
  for (const id of order) {
    if (usable.length >= MIN_USABLE) {
      reports.push({ provider: id, status: "skipped", found: 0, tooSmall: 0 });
      continue;
    }
    const cacheKey = `${id}|${q.query.toLowerCase()}|${q.orientation}|${page}`;
    const hit = state.cache.get(cacheKey);
    let r: ProviderResult | "no-key" | "skipped";
    if (hit && now() - hit.at < HOUR) r = hit.result;
    else {
      try {
        r = await run(id);
      } catch (e) {
        r = { status: "error", candidates: [], message: (e as Error).message };
      }
      if (typeof r === "object" && r.status === "ok") {
        state.cache.set(cacheKey, { at: now(), result: r });
        if (state.cache.size > 300) state.cache.delete(state.cache.keys().next().value!);
      }
    }

    if (r === "no-key" || r === "skipped") {
      reports.push({ provider: id, status: r === "no-key" ? "no-key" : "rate-limited", found: 0, tooSmall: 0, message: r === "skipped" ? "hourly quota used; resumes later" : undefined });
      continue;
    }
    if (id === "unsplash") {
      if (r.rateRemaining !== undefined) state.unsplashRemaining = r.rateRemaining;
      // Keep one request in reserve; demo keys allow 50 per hour.
      if (r.status === "rate-limited" || (r.rateRemaining !== undefined && r.rateRemaining <= 1)) state.unsplashBlockedUntil = now() + HOUR;
    }
    if (r.status !== "ok") {
      reports.push({ provider: id, status: r.status, found: 0, tooSmall: 0, message: r.message });
      continue;
    }
    const fits = r.candidates.filter((c) => coversTarget(c, target));
    const seen = new Set(usable.map((c) => c.key));
    usable.push(...fits.filter((c) => !seen.has(c.key)));
    reports.push({
      provider: id,
      status: r.candidates.length ? "ok" : "empty",
      found: r.candidates.length,
      tooSmall: r.candidates.length - fits.length,
    });
  }

  const offline = !deps.providers && !deps.keys.unsplash && !deps.keys.pexels && !deps.keys.pixabay;
  return { query, candidates: usable, providers: reports, offline, unsplashRemaining: state.unsplashRemaining };
}
