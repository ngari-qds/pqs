"use client";
import { browserEnv, canvasToBlob, ensureFonts, facesForRender } from "@/lib/render/browser";
import { getPairing } from "@/lib/render/pairings";
import { renderQuote, type RenderInput, type RenderReport } from "@/lib/render/render";
import type { Ctx } from "@/lib/render/types";

export type ExportFormat = "png" | "jpeg" | "webp";
const MIME: Record<ExportFormat, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

/** Off-screen render at the true final pixel size. Never a screenshot of the preview. */
export async function exportImage(input: RenderInput, width: number, height: number, format: ExportFormat) {
  await ensureFonts(facesForRender(getPairing(input.template.pairing)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false }) as Ctx;
  const report: RenderReport = renderQuote(ctx, browserEnv, input);
  const blob = await canvasToBlob(canvas, MIME[format], format === "png" ? undefined : 0.95);
  return { blob, report };
}

export function slug(s: string, max = 40) {
  return s.toLowerCase().replace(/\*/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, max).replace(/-$/, "") || "quote";
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
