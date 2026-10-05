/** Serves generated test photos when PQS_MOCK_PHOTOS=1 (never in production use). */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { MOCK_DIR } from "@/lib/images/providers/mock";

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  if (process.env.PQS_MOCK_PHOTOS !== "1") return new Response("Not found", { status: 404 });
  const { name } = await params;
  if (!/^[a-z0-9-]+\.(jpg|png)$/.test(name)) return new Response("Bad name", { status: 400 });
  try {
    const buf = await readFile(path.join(MOCK_DIR, name));
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": name.endsWith(".png") ? "image/png" : "image/jpeg", "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
