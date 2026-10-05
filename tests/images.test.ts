import { beforeEach, describe, expect, it } from "vitest";
import { normalizeUnsplash, searchUnsplash } from "@/lib/images/providers/unsplash";
import { normalizePexels } from "@/lib/images/providers/pexels";
import { normalizePixabay } from "@/lib/images/providers/pixabay";
import { coversTarget, decodeSize, neededWidth, sizedUrl } from "@/lib/images/resolution";
import { isAllowedImageUrl, isUnsplashDownloadLocation, withReferral } from "@/lib/images/urls";
import { MIN_USABLE, resetChainState, searchChain } from "@/lib/images/chain";
import { detectMoods, queryFor } from "@/lib/images/keywords";
import { calmScore } from "@/lib/images/score";
import type { FetchLike } from "@/lib/images/providers/common";

// --- Fixtures shaped like the real API responses ---
const unsplashPhoto = (id: string, w = 6000, h = 9000) => ({
  id, width: w, height: h, color: "#c0c8cc", alt_description: "fog over hills", description: null,
  urls: { raw: `https://images.unsplash.com/photo-${id}?ixid=abc&ixlib=rb-4.0.3`, small: `https://images.unsplash.com/photo-${id}?w=400`, thumb: "" },
  links: { html: `https://unsplash.com/photos/${id}`, download_location: `https://api.unsplash.com/photos/${id}/download?ixid=abc` },
  user: { name: "Ana Example", links: { html: "https://unsplash.com/@ana" } },
});
const pexelsPhoto = (id: number, w = 5000, h = 7000) => ({
  id, width: w, height: h, url: `https://www.pexels.com/photo/${id}/`, photographer: "Ben Example", photographer_url: "https://www.pexels.com/@ben",
  avg_color: "#777777", alt: "sea", src: { original: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg`, large: "", medium: `https://images.pexels.com/photos/${id}/m.jpeg` },
});
const pixabayHit = (id: number, extra: Record<string, string> = {}) => ({
  id, pageURL: `https://pixabay.com/photos/x-${id}/`, imageWidth: 6000, imageHeight: 4000,
  webformatURL: "https://pixabay.com/get/w.jpg", largeImageURL: "https://pixabay.com/get/l.jpg", user: "Cara", user_id: 7, tags: "fog, lake", ...extra,
});

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("provider normalisation", () => {
  it("Unsplash: raw URL, attribution, download_location", () => {
    const [c] = normalizeUnsplash([unsplashPhoto("a1")]);
    expect(c).toMatchObject({ key: "unsplash:a1", provider: "unsplash", width: 6000, height: 9000, author: { name: "Ana Example" } });
    expect(c.src).toContain("ixid=abc");
    expect(c.downloadLocation).toBe("https://api.unsplash.com/photos/a1/download?ixid=abc");
  });
  it("Pexels: uses src.original", () => {
    const [c] = normalizePexels([pexelsPhoto(42)]);
    expect(c.src).toBe("https://images.pexels.com/photos/42/pexels-photo-42.jpeg");
    expect(c.author.name).toBe("Ben Example");
  });
  it("Pixabay: picks the largest accessible URL and reports its real size", () => {
    expect(normalizePixabay([pixabayHit(1)])[0]).toMatchObject({ src: "https://pixabay.com/get/l.jpg", width: 1280, height: 853 });
    expect(normalizePixabay([pixabayHit(2, { fullHDURL: "https://pixabay.com/get/hd.jpg" })])[0]).toMatchObject({ width: 1920, height: 1280 });
    expect(normalizePixabay([pixabayHit(3, { imageURL: "https://pixabay.com/get/o.jpg" })])[0]).toMatchObject({ width: 6000, height: 4000 });
  });
});

describe("resolution rules", () => {
  const target = { width: 2160, height: 3840 };
  it("rejects anything smaller than the export in either dimension", () => {
    expect(coversTarget({ width: 6000, height: 9000 }, target)).toBe(true);
    expect(coversTarget({ width: 2000, height: 9000 }, target)).toBe(false);
    expect(coversTarget({ width: 6000, height: 3000 }, target)).toBe(false);
  });
  it("requests a width that still covers after a cover crop", () => {
    // Landscape original on a tall canvas: height is the constraint.
    expect(neededWidth({ width: 6000, height: 4000 }, target)).toBe(5760);
    expect(neededWidth({ width: 6000, height: 9000 }, target)).toBe(2560);
  });
  it("builds Unsplash imgix URLs with the required parameters", () => {
    const [c] = normalizeUnsplash([unsplashPhoto("b2", 6000, 9000)]);
    const s = sizedUrl(c, target);
    expect(s.url).toBe("https://images.unsplash.com/photo-b2?ixid=abc&ixlib=rb-4.0.3&w=2560&q=90&fm=jpg&fit=crop&crop=entropy");
    expect(s.width).toBeGreaterThanOrEqual(target.width);
    expect(s.height).toBeGreaterThanOrEqual(target.height);
  });
  it("downscales huge originals at decode time, but never below 2x the cover size", () => {
    expect(decodeSize({ width: 3000, height: 5000 }, target)).toBeNull();
    const d = decodeSize({ width: 12000, height: 18000 }, target)!;
    expect(d.width).toBeGreaterThanOrEqual(target.width * 2);
    expect(d.height).toBeGreaterThanOrEqual(target.height * 2);
  });
});

describe("proxy URL safety", () => {
  it("allows only provider CDNs over https", () => {
    expect(isAllowedImageUrl("https://images.unsplash.com/photo-1?w=10")).toBe(true);
    expect(isAllowedImageUrl("https://images.pexels.com/photos/1/a.jpeg")).toBe(true);
    expect(isAllowedImageUrl("https://cdn.pixabay.com/photo/a.jpg")).toBe(true);
    expect(isAllowedImageUrl("http://images.unsplash.com/x")).toBe(false);
    expect(isAllowedImageUrl("https://evil.example/x.jpg")).toBe(false);
    expect(isAllowedImageUrl("https://images.unsplash.com.evil.example/x")).toBe(false);
    expect(isAllowedImageUrl("https://169.254.169.254/latest")).toBe(false);
    expect(isAllowedImageUrl("https://user:pw@images.unsplash.com/x")).toBe(false);
  });
  it("validates Unsplash download locations", () => {
    expect(isUnsplashDownloadLocation("https://api.unsplash.com/photos/abc_D-1/download?ixid=xyz")).toBe(true);
    expect(isUnsplashDownloadLocation("https://api.unsplash.com/users/me")).toBe(false);
    expect(isUnsplashDownloadLocation("https://evil.example/photos/a/download")).toBe(false);
  });
  it("adds Unsplash referral parameters to attribution links", () => {
    expect(withReferral("https://unsplash.com/@ana")).toContain("utm_medium=referral");
    expect(withReferral("https://www.pexels.com/@ben")).toBe("https://www.pexels.com/@ben");
  });
});

describe("provider chain", () => {
  beforeEach(() => resetChainState());
  const target = { width: 2160, height: 3840 };

  /** Fake fetch routing by host. */
  const router = (routes: Record<string, () => Response>): FetchLike & { calls: string[] } => {
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(url);
      const host = new URL(url).hostname;
      const r = routes[host];
      if (!r) throw new Error(`unexpected ${url}`);
      return r();
    }) as FetchLike & { calls: string[] };
    f.calls = calls;
    return f;
  };

  it("uses Unsplash first when it has enough usable photos", async () => {
    const f = router({ "api.unsplash.com": () => json({ results: Array.from({ length: 8 }, (_, i) => unsplashPhoto(`u${i}`)) }, 200, { "x-ratelimit-remaining": "42" }) });
    const r = await searchChain("fog", target, 1, { keys: { unsplash: "U", pexels: "P" }, fetchImpl: f });
    expect(r.candidates).toHaveLength(8);
    expect(r.candidates.every((c) => c.provider === "unsplash")).toBe(true);
    expect(r.providers.find((p) => p.provider === "pexels")?.status).toBe("skipped");
    expect(r.unsplashRemaining).toBe(42);
    expect(f.calls[0]).toMatch(/\/search\/photos\?.*query=fog/);
  });

  it("falls back to Pexels then Pixabay when Unsplash is rate-limited", async () => {
    const f = router({
      "api.unsplash.com": () => json({ errors: ["Rate Limit Exceeded"] }, 403, { "x-ratelimit-remaining": "0" }),
      "api.pexels.com": () => json({ photos: [pexelsPhoto(1), pexelsPhoto(2)] }),
      "pixabay.com": () => json({ hits: [pixabayHit(9, { imageURL: "https://pixabay.com/get/o.jpg" })] }),
    });
    const r = await searchChain("sea", target, 1, { keys: { unsplash: "U", pexels: "P", pixabay: "X" }, fetchImpl: f });
    expect(r.providers.map((p) => [p.provider, p.status])).toEqual([["unsplash", "rate-limited"], ["pexels", "ok"], ["pixabay", "ok"]]);
    expect(r.candidates.map((c) => c.provider)).toEqual(["pexels", "pexels", "pixabay"]);

    // Within the hour, Unsplash is not called again (quota is respected).
    f.calls.length = 0;
    await searchChain("stone", target, 1, { keys: { unsplash: "U", pexels: "P", pixabay: "X" }, fetchImpl: f });
    expect(f.calls.some((u) => u.includes("unsplash"))).toBe(false);
  });

  it("drops photos smaller than the export and reports how many", async () => {
    const f = router({
      "api.unsplash.com": () => json({ results: [unsplashPhoto("big"), unsplashPhoto("small", 1200, 1800)] }, 200, { "x-ratelimit-remaining": "40" }),
      "api.pexels.com": () => json({ photos: [] }),
      "pixabay.com": () => json({ hits: [pixabayHit(1)] }), // 1280px rendition: too small
    });
    const r = await searchChain("fog", target, 1, { keys: { unsplash: "U", pexels: "P", pixabay: "X" }, fetchImpl: f });
    expect(r.candidates.map((c) => c.key)).toEqual(["unsplash:big"]);
    expect(r.providers.find((p) => p.provider === "unsplash")).toMatchObject({ found: 2, tooSmall: 1 });
    expect(r.providers.find((p) => p.provider === "pixabay")).toMatchObject({ found: 1, tooSmall: 1 });
  });

  it("caches per query so repeated searches cost no requests", async () => {
    const f = router({ "api.unsplash.com": () => json({ results: Array.from({ length: MIN_USABLE }, (_, i) => unsplashPhoto(`c${i}`)) }, 200, { "x-ratelimit-remaining": "30" }) });
    await searchChain("night", target, 1, { keys: { unsplash: "U" }, fetchImpl: f });
    await searchChain("Night", target, 1, { keys: { unsplash: "U" }, fetchImpl: f });
    expect(f.calls).toHaveLength(1);
  });

  it("reports offline when no keys are configured", async () => {
    const r = await searchChain("fog", target, 1, { keys: {} });
    expect(r.offline).toBe(true);
    expect(r.candidates).toEqual([]);
    expect(r.providers.every((p) => p.status === "no-key")).toBe(true);
  });

  it("survives network errors", async () => {
    const f = (async () => {
      throw new Error("ECONNRESET");
    }) as FetchLike;
    const r = await searchChain("fog", target, 1, { keys: { unsplash: "U", pexels: "P" }, fetchImpl: f });
    expect(r.providers.map((p) => p.status)).toEqual(["error", "error", "no-key"]);
  });

  it("sends the Unsplash key as a Client-ID header, not in the URL", async () => {
    let seen: RequestInit | undefined;
    const f = (async (url: string, init?: RequestInit) => {
      seen = init;
      expect(url).not.toContain("SECRET");
      return json({ results: [] }, 200);
    }) as FetchLike;
    await searchUnsplash({ query: "fog", orientation: "portrait", page: 1, perPage: 30 }, "SECRET", f);
    expect((seen?.headers as Record<string, string>).Authorization).toBe("Client-ID SECRET");
  });
});

describe("keyword engine", () => {
  it("detects moods from the quote", () => {
    expect(detectMoods("The city at night does not care about your plans")).toEqual(["city", "night"]);
    expect(detectMoods("The ocean is honest about its size")).toContain("ocean");
    expect(detectMoods("xyz qwerty")).toEqual(["minimal", "fog"]);
  });
  it("lets a manual keyword override win and cycles terms on shuffle", () => {
    expect(queryFor(["fog"], "lighthouse", 3)).toBe("lighthouse");
    const a = queryFor(["fog", "ocean"], "", 0), b = queryFor(["fog", "ocean"], "", 1);
    expect(a).not.toBe(b);
    expect(queryFor(["fog", "ocean"], "", 10)).toBe(a);
  });
});

describe("calm-area scoring", () => {
  const img = (w: number, h: number, f: (x: number, y: number) => number) => {
    const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = f(x, y), i = (y * w + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = v;
      px[i + 3] = 255;
    }
    return px;
  };
  it("prefers a smooth sky over a busy texture in the text region", () => {
    const sky = img(64, 80, (_x, y) => 180 + y * 0.3);
    const busy = img(64, 80, (x, y) => ((x * 7 + y * 13) % 5) * 50);
    const region = { x: 0.1, y: 0.25, w: 0.8, h: 0.5 };
    expect(calmScore(sky, 64, 80, region).score).toBeLessThan(calmScore(busy, 64, 80, region).score);
  });
  it("only looks inside the region", () => {
    // Busy top half, calm bottom half.
    const px = img(64, 80, (x, y) => (y < 40 ? ((x * 7 + y * 13) % 5) * 50 : 120));
    expect(calmScore(px, 64, 80, { x: 0, y: 0.55, w: 1, h: 0.45 }).score).toBeLessThan(0.01);
  });
});
