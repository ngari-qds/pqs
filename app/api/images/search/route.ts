/**
 * GET /api/images/search?q=fog+forest&w=2160&h=3840&page=1
 * Searches Unsplash → Pexels → Pixabay server-side (keys never reach the
 * browser) and returns only photos whose originals cover w×h.
 */
import { searchChain } from "@/lib/images/chain";
import { searchMock } from "@/lib/images/providers/mock";

export const dynamic = "force-dynamic";

const int = (v: string | null, lo: number, hi: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : dflt;
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const query = (sp.get("q") ?? "").slice(0, 100);
  const target = { width: int(sp.get("w"), 100, 8000, 2160), height: int(sp.get("h"), 100, 10000, 2700) };
  const page = int(sp.get("page"), 1, 50, 1);
  const mock = process.env.PQS_MOCK_PHOTOS === "1";

  const res = await searchChain(query, target, page, {
    keys: { unsplash: process.env.UNSPLASH_ACCESS_KEY, pexels: process.env.PEXELS_API_KEY, pixabay: process.env.PIXABAY_API_KEY },
    ...(mock ? { order: ["mock"], providers: { mock: (q) => searchMock(q) } } : {}),
  });
  return Response.json(res, { headers: { "Cache-Control": "no-store" } });
}
