"use client";
import { browserEnv, canvasToBlob, ensureFonts, facesForRender } from "@/lib/render/browser";
import { getPairing } from "@/lib/render/pairings";
import { renderQuote, type RenderInput, type RenderReport } from "@/lib/render/render";
import type { Ctx } from "@/lib/render/types";

export type ExportFormat = "png" | "jpeg" | "webp";
const MIME: Record<ExportFormat, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

/** Off-screen render at the true final pixel size. Never a screenshot of the preview. */
export async function exportImage(input: RenderInput, width: number, height: number, format: ExportFormat) {
  await ensureFonts(facesForRender(getPairing(input.template.pairing), input.content));
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

/**
 * Carousel: renders every slide at full size and packs them into one ZIP as a
 * numbered set (01of04, 02of04, ...).
 */
export async function exportCarousel(input: RenderInput, width: number, height: number, format: ExportFormat, slides: number, baseName: string) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const reports: RenderReport[] = [];
  const ext = format === "jpeg" ? "jpg" : format;
  for (let i = 0; i < slides; i++) {
    const { blob, report } = await exportImage({ ...input, content: { ...input.content, slide: i } }, width, height, format);
    zip.file(`${baseName}_${String(i + 1).padStart(2, "0")}of${String(slides).padStart(2, "0")}.${ext}`, blob);
    reports.push(report);
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  return { blob, reports };
}

/** All text in a content object, for slugs and keyword detection. */
export function contentText(c: Record<string, unknown>): string {
  return Object.entries(c)
    .filter(([k, v]) => k !== "format" && k !== "slide" && (typeof v === "string" || Array.isArray(v)))
    .map(([, v]) => (Array.isArray(v) ? v.join(" ") : (v as string)))
    .join(" ")
    .trim();
}
