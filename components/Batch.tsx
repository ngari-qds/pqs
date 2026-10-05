"use client";
/**
 * Batch mode: paste many quotes (or load the collection), pick a style
 * family, preview every item, render all and download one ZIP.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ThumbCanvas } from "@/components/ThumbCanvas";
import { FORMATS, FORMAT_LIST, slideCount } from "@/lib/render/formats";
import { getPalette } from "@/lib/render/palettes";
import { getPreset } from "@/lib/render/presets";
import type { FormatId, QuoteContent, SignatureStyle, TemplateConfig } from "@/lib/render/template";
import type { Drawable } from "@/lib/render/types";
import { STYLE_FAMILIES, batchFileStem, parseBatch, templateFor, type BatchItem, type StyleFamily } from "@/lib/studio/batch";
import { contentText, download, exportBatch, type ExportFormat } from "@/lib/studio/export";
import { ALL_TEMPLATES } from "@/lib/studio/templates";

const PLACEHOLDER = `Paste quotes separated by blank lines.

Use --- between hook / body / punchline groups,
or @format blocks for any format, e.g.

@list
title: Things I stopped doing
- Explaining myself twice
- Answering at midnight
- Keeping score`;

interface Props {
  presetId: string;
  scale: number;
  format: ExportFormat;
  signature: { enabled: boolean; style: SignatureStyle };
  currentTemplate: TemplateConfig;
  photo?: Drawable;
  onOpen: (content: QuoteContent, template: TemplateConfig) => void;
  onSaveToLibrary: (items: { content: QuoteContent; tags: string[] }[]) => Promise<number>;
  onExported: (summary: { name: string; files: number; preview: string }) => void;
}

export default function Batch(props: Props) {
  const [text, setText] = useState("");
  const [defaultFormat, setDefaultFormat] = useState<FormatId>("classic");
  const [familyId, setFamilyId] = useState<string>("current");
  const [items, setItems] = useState<BatchItem[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setItems(parseBatch(text, defaultFormat)), 250);
    return () => clearTimeout(t);
  }, [text, defaultFormat]);

  const preset = getPreset(props.presetId);
  const valid = items.filter((i) => !i.errors.length);
  const errors = items.filter((i) => i.errors.length);
  const totalImages = valid.reduce((n, i) => n + slideCount(i.content), 0);
  const byFormat = useMemo(() => {
    const m = new Map<FormatId, number>();
    for (const i of valid) m.set(i.content.format, (m.get(i.content.format) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [valid]);

  const family: StyleFamily = useMemo(() => {
    const f = STYLE_FAMILIES.find((x) => x.id === familyId);
    if (f) return f;
    const t = props.currentTemplate;
    return { id: "current", name: "Current design", palette: t.palette, pairing: t.pairing, background: t.background };
  }, [familyId, props.currentTemplate]);

  const templateOf = (c: QuoteContent): TemplateConfig =>
    familyId === "current" && c.format === props.currentTemplate.format ? props.currentTemplate : templateFor(c, family, ALL_TEMPLATES);

  const loadCollection = async () => {
    const res = await fetch("/quotes/cold-quotes.txt");
    setText(await res.text());
    setMessage(null);
  };

  const render = async () => {
    if (!valid.length) return;
    const ac = new AbortController();
    abort.current = ac;
    setMessage(null);
    setProgress({ done: 0, total: totalImages });
    const t0 = performance.now();
    const w = preset.width * props.scale, h = preset.height * props.scale;
    const baseName = `fred-m_batch_${valid.length}-quotes_${preset.id}_${w}x${h}`;
    try {
      const r = await exportBatch(
        valid.map((i, n) => ({ content: i.content, template: templateOf(i.content), stem: batchFileStem(n, i.content, contentText(i.content)), tags: i.tags })),
        { width: w, height: h, format: props.format, signature: props.signature, photo: props.photo ? { image: props.photo } : undefined, baseName },
        (done, total) => setProgress({ done, total }),
        ac.signal,
      );
      for (const p of r.parts) download(p.blob, p.name);
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      setMessage(
        `${r.cancelled ? "Cancelled after" : "Rendered"} ${r.files} image${r.files === 1 ? "" : "s"} in ${secs}s` +
          (r.parts.length > 1 ? `, in ${r.parts.length} ZIP files` : "") +
          (r.issues.length ? ` · ${r.issues.length} adjusted to fit` : ""),
      );
      if (r.files) props.onExported({ name: r.parts[0]?.name ?? baseName, files: r.files, preview: valid.slice(0, 3).map((i) => contentText(i.content).slice(0, 60)).join(" / ") });
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };

  const saveAll = async () => {
    const added = await props.onSaveToLibrary(valid.map((i) => ({ content: i.content, tags: i.tags })));
    setMessage(`Saved to the library: ${added} new, ${valid.length - added} already there.`);
  };

  const shown = showAll ? valid : valid.slice(0, 60);
  const aspect = preset.width / preset.height;

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
      <aside className="lg:w-[380px] shrink-0 bg-panel border-b lg:border-b-0 lg:border-r border-line p-5 space-y-4 lg:overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="label">Quotes</div>
          <button className="text-xs underline text-dim" onClick={loadCollection}>Load the cold-quotes collection</button>
        </div>
        <textarea className="field font-mono text-[12px] leading-relaxed" rows={14} value={text} onChange={(e) => setText(e.target.value)} placeholder={PLACEHOLDER} spellCheck={false} />

        <div>
          <div className="label mb-2">Plain quotes are</div>
          <select className="field" value={defaultFormat} onChange={(e) => setDefaultFormat(e.target.value as FormatId)}>
            {FORMAT_LIST.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <div className="mt-1 text-xs text-dim">@format blocks keep their own format.</div>
        </div>

        <div>
          <div className="label mb-2">Style family</div>
          <div className="flex flex-wrap gap-1.5">
            <button className="chip" data-on={familyId === "current"} onClick={() => setFamilyId("current")}>Current design</button>
            {STYLE_FAMILIES.map((f) => {
              const p = getPalette(f.palette);
              return (
                <button key={f.id} className="chip inline-flex items-center gap-1.5" data-on={familyId === f.id} onClick={() => setFamilyId(f.id)}>
                  <span className="inline-block w-3 h-3 rounded-full border border-line" style={{ background: `linear-gradient(135deg, ${p.bg} 50%, ${p.ink} 50%)` }} />
                  {f.name}
                </button>
              );
            })}
          </div>
          <div className="mt-1 text-xs text-dim">One palette, pairing and ground for every quote; each format gets a layout that suits it.</div>
        </div>

        <div className="text-xs text-dim space-y-1">
          <div>
            <span className="text-ink font-medium">{valid.length}</span> quote{valid.length === 1 ? "" : "s"} → <span className="text-ink font-medium">{totalImages}</span> image{totalImages === 1 ? "" : "s"} at {preset.width * props.scale}×{preset.height * props.scale} ({props.format.toUpperCase()})
          </div>
          {byFormat.length > 0 && <div>{byFormat.map(([f, n]) => `${FORMATS[f].name} ${n}`).join(" · ")}</div>}
          {errors.length > 0 && (
            <div className="text-red-700">
              {errors.length} block{errors.length === 1 ? "" : "s"} skipped:
              <ul className="list-disc ml-4">
                {errors.slice(0, 6).map((e) => (
                  <li key={e.line}>line {e.line}: {e.errors.join(", ")}</li>
                ))}
              </ul>
            </div>
          )}
          {totalImages > 120 && props.scale > 1 && <div>Large batch: it will download as several ZIP files of 60 images.</div>}
        </div>

        {progress ? (
          <div className="space-y-2">
            <div className="h-1.5 bg-line rounded overflow-hidden">
              <div className="h-full bg-ink" style={{ width: `${(100 * progress.done) / Math.max(1, progress.total)}%` }} />
            </div>
            <div className="flex items-center justify-between text-xs text-dim">
              <span>{progress.done} / {progress.total}</span>
              <button className="underline" onClick={() => abort.current?.abort()}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" disabled={!valid.length} onClick={render}>Render {totalImages || ""} → ZIP</button>
            <button className="btn" disabled={!valid.length} onClick={saveAll}>Save to library</button>
          </div>
        )}
        {message && <div className="text-xs text-dim">{message}</div>}
      </aside>

      <section className="flex-1 min-h-0 lg:overflow-y-auto p-4 lg:p-6">
        {valid.length === 0 ? (
          <div className="text-sm text-dim mt-8 text-center">Paste quotes on the left, or load the collection, to see every design here before rendering.</div>
        ) : (
          <>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
              {shown.map((it, n) => {
                const t = templateOf(it.content);
                return (
                  <figure key={`${it.line}-${n}`}>
                    <button className="block w-full rounded-sm overflow-hidden bg-line/40" style={{ aspectRatio: String(aspect) }} onClick={() => props.onOpen(it.content, t)} title="Open in the studio">
                      <ThumbCanvas template={t} content={it.content} aspect={aspect} photo={props.photo} signature={props.signature} />
                    </button>
                    <figcaption className="mt-1.5 text-[11px] leading-snug text-dim">
                      <span className="text-ink">{String(n + 1).padStart(3, "0")}</span> · {FORMATS[it.content.format].name}
                      {slideCount(it.content) > 1 && ` · ${slideCount(it.content)} slides`}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
            {!showAll && valid.length > shown.length && (
              <div className="text-center mt-6">
                <button className="btn" onClick={() => setShowAll(true)}>Show all {valid.length}</button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
