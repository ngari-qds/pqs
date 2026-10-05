import type { PhotoCandidate } from "../types";

export type Orientation = "portrait" | "landscape" | "square";

export interface ProviderQuery {
  query: string;
  orientation: Orientation;
  page: number;
  perPage: number;
}

export interface ProviderResult {
  status: "ok" | "rate-limited" | "error";
  candidates: PhotoCandidate[];
  rateRemaining?: number;
  message?: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const orientationFor = (w: number, h: number): Orientation => (h / w > 1.1 ? "portrait" : w / h > 1.1 ? "landscape" : "square");

export function readRemaining(res: Response): number | undefined {
  const v = res.headers.get("x-ratelimit-remaining");
  return v == null ? undefined : Number(v);
}

/** Maps HTTP failures to a provider status without throwing. */
export async function failure(res: Response, provider: string): Promise<ProviderResult> {
  const rateLimited = res.status === 429 || (res.status === 403 && readRemaining(res) === 0);
  let message = `${provider} HTTP ${res.status}`;
  try {
    const body = await res.text();
    if (body) message += `: ${body.slice(0, 160)}`;
  } catch {}
  return { status: rateLimited ? "rate-limited" : "error", candidates: [], rateRemaining: readRemaining(res), message };
}
