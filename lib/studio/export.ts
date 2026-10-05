"use client";
import { browserEnv, canvasToBlob, ensureFonts, facesForRender } from "@/lib/render/browser";
import { getPairing } from "@/lib/render/pairings";
import { renderQuote, type RenderInput, type RenderReport } from "@/lib/render/render";
import type { Ctx } from "@/lib/render/types";
import { slideCount } from "@/lib/render/formats";
import type { QuoteContent, TemplateConfig } from "@/lib/render/template";

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

export interface BatchJob {
  content: QuoteContent;
  template: TemplateConfig;
  /** File stem, e.g. 001_classic_most-people-dont-want-the-truth */
  stem: string;
  tags?: string[];
}

export interface BatchResult {
  parts: { name: string; blob: Blob; files: number }[];
  issues: { stem: string; issue: string }[];
  files: number;
  cancelled: boolean;
}

/**
 * Renders every job (every slide of carousels) at the full export size and
 * packs them into ZIPs of at most `perZip` images, each with a manifest.json.
 * Splitting keeps memory bounded for very large batches.
 */
export async function exportBatch(
  jobs: BatchJob[],
  opts: { width: number; height: number; format: ExportFormat; signature: RenderInput["signature"]; tone?: RenderInput["tone"]; photo?: RenderInput["photo"]; baseName: string; perZip?: number },
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<BatchResult> {
  const { default: JSZip } = await import("jszip");
  const perZip = opts.perZip ?? 60;
  const ext = opts.format === "jpeg" ? "jpg" : opts.format;
  const total = jobs.reduce((n, j) => n + slideCount(j.content), 0);
  const parts: BatchResult["parts"] = [];
  const issues: BatchResult["issues"] = [];
  let zip = new JSZip();
  let manifest: object[] = [];
  let inZip = 0, done = 0;
  const flush = async () => {
    if (!inZip) return;
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    parts.push({ name: "", blob, files: inZip });
    zip = new JSZip();
    manifest = [];
    inZip = 0;
  };
  for (const job of jobs) {
    const n = slideCount(job.content);
    for (let s = 0; s < n; s++) {
      if (signal?.aborted) {
        await flush();
        return finish(true);
      }
      const name = `${job.stem}${n > 1 ? `_${String(s + 1).padStart(2, "0")}of${String(n).padStart(2, "0")}` : ""}.${ext}`;
      const isPhoto = job.template.background.kind.startsWith("photo");
      const { blob, report } = await exportImage(
        { content: { ...job.content, slide: s }, template: job.template, signature: opts.signature, tone: opts.tone, photo: isPhoto ? opts.photo : undefined },
        opts.width,
        opts.height,
        opts.format,
      );
      zip.file(name, blob);
      manifest.push({ file: name, format: job.content.format, text: contentText(job.content), tags: job.tags ?? [], template: job.template.id });
      if (report.overflow) issues.push({ stem: job.stem, issue: "text overflow" });
      else if (report.fallback) issues.push({ stem: job.stem, issue: `adjusted: ${report.fallback}` });
      for (const c of report.collisions) issues.push({ stem: job.stem, issue: c });
      inZip++;
      done++;
      onProgress(done, total);
      if (inZip >= perZip) await flush();
    }
  }
  await flush();
  return finish(false);

  function finish(cancelled: boolean): BatchResult {
    parts.forEach((p, i) => (p.name = parts.length > 1 ? `${opts.baseName}_part-${i + 1}-of-${parts.length}.zip` : `${opts.baseName}.zip`));
    return { parts, issues, files: done, cancelled };
  }
}
