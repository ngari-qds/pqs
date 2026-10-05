"use client";
/**
 * Library: saved quotes (search, tags, format filter, open in studio) and the
 * export history (re-open any past export).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { collectionIndex, type CollectionIndex } from "@/lib/studio/collection";
import { IMPORT_ACCEPT } from "@/lib/studio/importers";
import { FORMATS, FORMAT_LIST } from "@/lib/render/formats";
import { getPreset } from "@/lib/render/presets";
import type { FormatId, QuoteContent, TemplateConfig } from "@/lib/render/template";
import { toBatchText } from "@/lib/studio/batch";
import type { HistoryEntry, SavedQuote } from "@/lib/studio/db";
import { contentText, download } from "@/lib/studio/export";

interface Props {
  quotes: SavedQuote[];
  history: HistoryEntry[];
  onOpen: (content: QuoteContent, template?: TemplateConfig) => void;
  onDelete: (id: string) => void;
  onSetTags: (id: string, tags: string[]) => void;
  /** Imports a bundled collection ("all", "sampler" or a format id); resolves to a summary. */
  onImportCollection: (id: string) => Promise<string>;
  /** Imports uploaded files; resolves to a summary. */
  onImportFiles: (files: File[]) => Promise<string>;
  onClearHistory: () => void;
}

const ago = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

export default function Library(props: Props) {
  const [tab, setTab] = useState<"quotes" | "history">("quotes");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [format, setFormat] = useState<FormatId | "">("");
  const [editing, setEditing] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [index, setIndex] = useState<CollectionIndex | null>(null);
  const [collection, setCollection] = useState("all");
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    collectionIndex().then(setIndex).catch(() => {});
  }, []);
  const run = async (job: () => Promise<string>) => {
    setImporting(true);
    setNote(null);
    try {
      setNote(await job());
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of props.quotes) for (const t of x.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [props.quotes]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return props.quotes.filter(
      (x) =>
        (!tag || x.tags.includes(tag)) &&
        (!format || x.content.format === format) &&
        (!needle || contentText(x.content).toLowerCase().includes(needle) || x.tags.some((t) => t.includes(needle))),
    );
  }, [props.quotes, q, tag, format]);

  const exportText = () => {
    const blob = new Blob([toBatchText(list.map((x) => ({ content: x.content, tags: x.tags })))], { type: "text/plain;charset=utf-8" });
    download(blob, `fred-m_library_${list.length}-quotes.txt`);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
      <aside className="lg:w-[300px] shrink-0 bg-panel border-b lg:border-b-0 lg:border-r border-line p-5 space-y-5 lg:overflow-y-auto">
        <div className="flex gap-1.5">
          <button className="chip" data-on={tab === "quotes"} onClick={() => setTab("quotes")}>Quotes · {props.quotes.length}</button>
          <button className="chip" data-on={tab === "history"} onClick={() => setTab("history")}>History · {props.history.length}</button>
        </div>
        {tab === "quotes" ? (
          <>
            <input className="field" placeholder="Search text or tags" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="field" value={format} onChange={(e) => setFormat(e.target.value as FormatId | "")}>
              <option value="">All formats</option>
              {FORMAT_LIST.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            {tags.length > 0 && (
              <div>
                <div className="label mb-2">Tags</div>
                <div className="flex flex-wrap gap-1.5">
                  {tags.slice(0, 40).map(([t, n]) => (
                    <button key={t} className="chip" data-on={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                      {t} <span className="opacity-60">{n}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <div className="label">Import</div>
              <select className="field" value={collection} onChange={(e) => setCollection(e.target.value)} aria-label="Collection to import">
                {index && <option value="all">Whole collection ({index.total.toLocaleString()})</option>}
                {(index?.files ?? []).map((f) => (
                  <option key={f.id} value={f.id}>{f.name} ({f.count})</option>
                ))}
              </select>
              <button className="btn w-full" disabled={importing} onClick={() => run(() => props.onImportCollection(collection))}>
                {importing ? "Importing…" : "Import collection"}
              </button>
              <button className="btn w-full" disabled={importing} onClick={() => fileInput.current?.click()}>Import from files…</button>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={IMPORT_ACCEPT}
                className="hidden"
                aria-label="Import quote files"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) run(() => props.onImportFiles(files));
                  e.target.value = "";
                }}
              />
              <div className="text-xs text-dim">.txt / .md (batch syntax), .json or .csv. Re-importing never duplicates.</div>
              {note && <div className="text-xs text-ink">{note}</div>}
            </div>
            <button className="btn w-full" disabled={!list.length} onClick={exportText}>Export {list.length} as text</button>
          </>
        ) : (
          <>
            <div className="text-xs text-dim">Every export is recorded here. Open one to bring its text and design back into the studio.</div>
            <button className="btn" disabled={!props.history.length} onClick={props.onClearHistory}>Clear history</button>
          </>
        )}
      </aside>

      <section className="flex-1 min-h-0 lg:overflow-y-auto p-4 lg:p-6">
        {tab === "quotes" ? (
          list.length === 0 ? (
            <div className="text-sm text-dim mt-8 text-center">
              {props.quotes.length ? "No quotes match." : "Your library is empty. Save quotes from the studio or Batch mode, or import the collection."}
            </div>
          ) : (
            <ul className="divide-y divide-line bg-panel border border-line rounded-sm">
              {list.map((x) => (
                <li key={x.id} className="p-4 flex flex-col sm:flex-row gap-3 sm:items-start">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] uppercase tracking-wider text-dim mb-1">{FORMATS[x.content.format].name}</div>
                    <div className="text-sm leading-relaxed whitespace-pre-line">{contentText(x.content).replace(/\*/g, "").slice(0, 280)}</div>
                    {editing === x.id ? (
                      <input
                        autoFocus
                        className="field mt-2 text-xs"
                        defaultValue={x.tags.join(", ")}
                        onBlur={(e) => {
                          props.onSetTags(x.id, e.target.value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean));
                          setEditing(null);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      />
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {x.tags.map((t) => (
                          <button key={t} className="text-[11px] text-dim border border-line rounded px-1.5" onClick={() => setTag(t)}>{t}</button>
                        ))}
                        <button className="text-[11px] text-dim underline" onClick={() => setEditing(x.id)}>edit tags</button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button className="btn" onClick={() => props.onOpen(x.content)}>Open</button>
                    <button className="btn" aria-label="Delete quote" onClick={() => props.onDelete(x.id)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : props.history.length === 0 ? (
          <div className="text-sm text-dim mt-8 text-center">No exports yet.</div>
        ) : (
          <ul className="divide-y divide-line bg-panel border border-line rounded-sm">
            {props.history.map((h) => (
              <li key={h.id} className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{h.name}</div>
                  <div className="text-xs text-dim mt-0.5">
                    {ago(h.at)} · {h.kind === "batch" ? `batch of ${h.files}` : h.kind === "carousel" ? `${h.files} slides` : FORMATS[h.format as FormatId]?.name ?? h.format} · {getPreset(h.presetId).name} · {h.width}×{h.height}
                  </div>
                  {h.preview && <div className="text-xs text-dim mt-0.5 truncate">{h.preview}</div>}
                </div>
                {h.content && (
                  <button className="btn shrink-0" onClick={() => props.onOpen(h.content!, h.template)}>Open</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
