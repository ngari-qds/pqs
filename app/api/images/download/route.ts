/**
 * POST /api/images/download  { location: photo.links.download_location }
 * Unsplash API guidelines require pinging download_location whenever a photo
 * is used, here on every export. The key stays server-side.
 */
import { isUnsplashDownloadLocation } from "@/lib/images/urls";

export async function POST(req: Request) {
  let location = "";
  try {
    location = (await req.json()).location ?? "";
  } catch {}
  if (!isUnsplashDownloadLocation(location)) return Response.json({ ok: false, error: "invalid location" }, { status: 400 });
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return Response.json({ ok: false, error: "no key" }, { status: 503 });
  try {
    const r = await fetch(location, { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" } });
    return Response.json({ ok: r.ok }, { status: r.ok ? 200 : 502 });
  } catch {
    return Response.json({ ok: false }, { status: 502 });
  }
}
