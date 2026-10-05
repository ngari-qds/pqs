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
import { STYLE_FAMILIES, batchFileStem, parseBatch, templateFor, toBatchText, type BatchItem, type StyleFamily } from "@/lib/studio/batch";
import { collectionIndex, loadCollection, type CollectionIndex } from "@/lib/studio/collection";
import { IMPORT_ACCEPT, readImportFiles } from "@/lib/studio/importers";
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
  const fileInput = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState<CollectionIndex | null>(null);
  const [collection, setCollection] = useState("sampler");
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    collectionIndex().then(setIndex).catch(() => {});
  }, []);

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

  const loadChosen = async () => {
    setText(await loadCollection(collection));
    setRange(null);
    setMessage(null);
  };

  /** Uploaded or dropped files: batch text is appended as-is; JSON/CSV are converted. */
  const importFiles = async (list: FileList | File[]) => {
    // Copy first: the input's FileList is emptied when the input is reset.
    const files = Array.from(list);
    const results = await readImportFiles(files, defaultFormat);
    const chunks: string[] = [];
    const notes: string[] = [];
    for (const r of results) {
      if (r.error) {
        notes.push(`${r.name}: ${r.error}`);
        continue;
      }
      const ok = r.items.filter((i) => !i.errors.length);
      const bad = r.items.length - ok.length;
      const isText = !/\.(json|csv)$/i.test(r.name);
      chunks.push(isText ? await (files.find((f) => f.name === r.name) as File).text() : toBatchText(ok));
      notes.push(`${r.name}: ${ok.length} quote${ok.length === 1 ? "" : "s"}${bad ? `, ${bad} with problems` : ""}`);
    }
    setText((t) => [t.trim(), ...chunks].filter(Boolean).join("\n\n---\n\n"));
    setRange(null);
    setMessage(`Imported ${notes.join(" · ")}`);
  };

  const from = Math.max(1, Math.min(range?.from ?? 1, valid.length || 1));
  const to = Math.max(from, Math.min(range?.to ?? valid.length, valid.length));
  const selected = valid.slice(from - 1, to);
  const selectedImages = selected.reduce((n, i) => n + slideCount(i.content), 0);

  const render = async () => {
    if (!selected.length) return;
    const ac = new AbortController();
    abort.current = ac;
    setMessage(null);
    setProgress({ done: 0, total: selectedImages });
    const t0 = performance.now();
    const w = preset.width * props.scale, h = preset.height * props.scale;
    const span = selected.length === valid.length ? `${valid.length}-quotes` : `quotes-${from}-${to}`;
    const baseName = `fred-m_batch_${span}_${preset.id}_${w}x${h}`;
    try {
      const r = await exportBatch(
        selected.map((i, n) => ({ content: i.content, template: templateOf(i.content), stem: batchFileStem(from - 1 + n, i.content, contentText(i.content)), tags: i.tags })),
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
      if (r.files) props.onExported({ name: r.parts[0]?.name ?? baseName, files: r.files, preview: selected.slice(0, 3).map((i) => contentText(i.content).slice(0, 60)).join(" / ") });
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
        <div>
          <div className="label mb-2">Collection</div>
          <div className="flex gap-2">
            <select className="field" value={collection} onChange={(e) => setCollection(e.target.value)} aria-label="Collection">
              {index && <option value="all">Everything ({index.total.toLocaleString()})</option>}
              {(index?.files ?? [{ id: "sampler", name: "Sampler (every format)", count: 441, file: "" }]).map((f) => (
                <option key={f.id} value={f.id}>{f.name} ({f.count})</option>
              ))}
            </select>
            <button className="btn shrink-0" onClick={loadChosen}>Load</button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="label">Quotes</div>
          <div className="flex items-center gap-3 text-xs">
            <button className="underline text-dim" onClick={() => fileInput.current?.click()}>Upload files</button>
            {text && <button className="underline text-dim" onClick={() => { setText(""); setMessage(null); }}>Clear</button>}
          </div>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={IMPORT_ACCEPT}
            className="hidden"
            aria-label="Upload quote files"
            onChange={(e) => {
              if (e.target.files?.length) importFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        <textarea
          className="field font-mono text-[12px] leading-relaxed"
          style={dragging ? { borderColor: "#1b1b1a", background: "#f7f6f2" } : undefined}
          rows={14}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files);
          }}
        />
        <div className="text-xs text-dim -mt-2">Drop or upload .txt, .md, .json or .csv files. Text files use the batch syntax, including @format+ sections.</div>

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

        {valid.length > 1 && (
          <div className="flex items-center gap-2 text-xs text-dim">
            <span>Render quotes</span>
            <input className="field !w-20 !py-1" type="number" min={1} max={valid.length} value={from} onChange={(e) => setRange({ from: Number(e.target.value) || 1, to })} aria-label="From" />
            <span>to</span>
            <input className="field !w-20 !py-1" type="number" min={1} max={valid.length} value={to} onChange={(e) => setRange({ from, to: Number(e.target.value) || valid.length })} aria-label="To" />
            <span>of {valid.length}</span>
          </div>
        )}

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
            <button className="btn btn-primary flex-1" disabled={!selected.length} onClick={render}>Render {selectedImages || ""} → ZIP</button>
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
