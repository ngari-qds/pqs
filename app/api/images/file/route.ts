/**
 * GET /api/images/file?u=<https url>
 * Streams a photo from an allow-listed provider CDN through our origin, so the
 * canvas stays untainted (exportable) without relying on third-party CORS.
 */
import { isAllowedImageUrl } from "@/lib/images/urls";

export const dynamic = "force-dynamic";
const MAX_BYTES = 60 * 1024 * 1024;

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u") ?? "";
  if (!isAllowedImageUrl(u)) return new Response("Host not allowed", { status: 400 });

  let upstream: Response;
  try {
    upstream = await fetch(u, { redirect: "follow", headers: { Accept: "image/avif,image/webp,image/jpeg,image/*" } });
  } catch {
    return new Response("Upstream unreachable", { status: 502 });
  }
  // Redirects must also land on an allowed host.
  if (upstream.url && !isAllowedImageUrl(upstream.url)) return new Response("Redirected off allow-list", { status: 400 });
  if (!upstream.ok || !upstream.body) return new Response(`Upstream ${upstream.status}`, { status: 502 });
  const type = upstream.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) return new Response("Not an image", { status: 415 });
  const len = Number(upstream.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return new Response("Image too large", { status: 413 });

  return new Response(upstream.body, {
    headers: {
      "Content-Type": type,
      ...(len ? { "Content-Length": String(len) } : {}),
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
