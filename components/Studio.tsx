"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserEnv, ensureFonts, facesForRender } from "@/lib/render/browser";
import { PAIRINGS, getPairing } from "@/lib/render/pairings";
import { PALETTES, getPalette } from "@/lib/render/palettes";
import { PRESETS, getPreset } from "@/lib/render/presets";
import { renderQuote, type RenderInput, type RenderReport } from "@/lib/render/render";
import { SIGNATURE_STYLES } from "@/lib/render/signature";
import type { BackgroundConfig, SignatureStyle, TemplateConfig } from "@/lib/render/template";
import type { Ctx } from "@/lib/render/types";
import { contentText, download, exportCarousel, exportImage, slug, type ExportFormat } from "@/lib/studio/export";
import { ALL_TEMPLATES, GALLERY_TEMPLATES, templatesFor } from "@/lib/studio/templates";
import Gallery from "@/components/Gallery";
import Batch from "@/components/Batch";
import Library from "@/components/Library";
import { shuffleTemplate, surpriseMe, type Locks } from "@/lib/studio/gallery";
import {
  addHistory, clearHistory, deleteMyTemplate, deleteQuote, listFavorites, listHistory, listMyTemplates, listQuotes,
  saveMyTemplate, saveQuotes, setFavorite, updateQuoteTags, type HistoryEntry, type SavedQuote,
} from "@/lib/studio/db";
import { parseBatch } from "@/lib/studio/batch";
import { FORMATS, FORMAT_LIST, resolveLayout, slideCount, type FieldDef } from "@/lib/render/formats";
import type { FormatId, QuoteContent } from "@/lib/render/template";
import { autoStructure, flatten } from "@/lib/studio/autostructure";
import { usePhoto } from "@/lib/studio/usePhoto";
import { trackDownload } from "@/lib/images/client";
import { MOODS, MOOD_IDS } from "@/lib/images/keywords";
import { PROVIDER_NAMES } from "@/lib/images/types";
import { withReferral } from "@/lib/images/urls";

const BACKGROUNDS: { id: BackgroundConfig["kind"]; name: string; config: BackgroundConfig }[] = [
  { id: "solid", name: "Solid", config: { kind: "solid" } },
  { id: "gradient", name: "Gradient", config: { kind: "gradient", angle: 12 } },
  { id: "paper", name: "Paper", config: { kind: "paper" } },
  { id: "vignette", name: "Vignette", config: { kind: "vignette", strength: 0.4 } },
];

const PHOTO_BACKGROUNDS: { id: BackgroundConfig["kind"]; name: string; config: BackgroundConfig }[] = [
  { id: "photo-scrim", name: "Photo + scrim", config: { kind: "photo-scrim", scrim: "auto" } },
  { id: "photo-mono-tint", name: "Grayscale", config: { kind: "photo-mono-tint" } },
  { id: "photo-duotone", name: "Duotone", config: { kind: "photo-duotone" } },
  { id: "photo-blur", name: "Blurred", config: { kind: "photo-blur" } },
  { id: "photo-split", name: "Split", config: { kind: "photo-split" } },
  { id: "photo-frame", name: "Framed", config: { kind: "photo-frame" } },
];


const SAMPLES = Object.fromEntries(FORMAT_LIST.map((f) => [f.id, f.sample])) as Record<FormatId, QuoteContent>;
const SETTINGS_KEY = "pqs.settings.v1";

interface Settings {
  signatureEnabled: boolean;
  signatureStyle: SignatureStyle;
  preset: string;
  scale: number;
  format: ExportFormat;
  showCredit: boolean;
}
const DEFAULT_SETTINGS: Settings = { signatureEnabled: true, signatureStyle: "line", preset: "status", scale: 2, format: "png", showCredit: false };

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}


export default function Studio() {
  const [format, setFormat] = useState<FormatId>("classic");
  const [contents, setContents] = useState<Record<FormatId, QuoteContent>>(SAMPLES);
  const [slide, setSlide] = useState(0);
  const [template, setTemplate] = useState<TemplateConfig>(templatesFor("classic")[0]);
  const content = contents[format];
  const [view, setView] = useState<"studio" | "gallery" | "batch" | "library">("studio");
  const [quotes, setQuotes] = useState<SavedQuote[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [savedNote, setSavedNote] = useState<string | null>(null);
  useEffect(() => {
    listQuotes().then(setQuotes);
    listHistory().then(setHistory);
  }, []);
  const refreshLibrary = async () => setQuotes(await listQuotes());
  const refreshHistory = async () => setHistory(await listHistory());
  const [locks, setLocks] = useState<Locks>({ font: false, palette: false, image: false });
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [mine, setMine] = useState<TemplateConfig[]>([]);
  useEffect(() => {
    listFavorites().then((f) => setFavorites(new Set(f)));
    listMyTemplates().then(setMine);
  }, []);
  /** Hero templates, the generated gallery and the user's own, in that order. */
  const pool = useMemo(() => [...mine, ...ALL_TEMPLATES, ...GALLERY_TEMPLATES], [mine]);
  const mineIds = useMemo(() => new Set(mine.map((t) => t.id)), [mine]);
  const text = useMemo(() => contentText(content), [content]);
  const slides = slideCount(content);
  const fmt = FORMATS[format];
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [report, setReport] = useState<RenderReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ w: 0, h: 0 });

  useEffect(() => setSettings(loadSettings()), []);
  const updateSettings = (patch: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  const preset = getPreset(settings.preset);
  const exportSize = useMemo(() => ({ width: preset.width * settings.scale, height: preset.height * settings.scale }), [preset, settings.scale]);
  const photoBg = template.background.kind.startsWith("photo");
  const ph = usePhoto({ enabled: photoBg, text, layout: resolveLayout(format, template.layout), target: exportSize });

  useEffect(() => setSlide((s) => Math.min(s, slides - 1)), [slides]);

  const setField = (key: string, value: string | string[]) => setContents((c) => ({ ...c, [format]: { ...c[format], [key]: value } }));
  const chooseFormat = (id: FormatId) => {
    setFormat(id);
    setSlide(0);
    // Keep the current look where the format allows it; otherwise use the format's first template.
    const own = templatesFor(id);
    setTemplate((t) => (t.format === id ? t : own[0] ? { ...own[0] } : { ...t, format: id, layout: FORMATS[id].layouts[0].id }));
  };
  /** Brings a saved quote or past export back into the studio. */
  const openContent = (c: QuoteContent, t?: TemplateConfig) => {
    const clean = { ...c };
    delete clean.slide;
    setContents((all) => ({ ...all, [c.format]: clean }));
    setFormat(c.format);
    setSlide(0);
    if (t && t.format === c.format) setTemplate(t);
    else setTemplate((cur) => (cur.format === c.format ? cur : templatesFor(c.format)[0] ?? { ...cur, format: c.format, layout: FORMATS[c.format].layouts[0].id }));
    setView("studio");
  };
  const saveToLibrary = async () => {
    const tags = tagInput.split(",").map((t) => t.trim().toLowerCase().replace(/^#/, "")).filter(Boolean);
    const added = await saveQuotes([{ content, tags }]);
    await refreshLibrary();
    setSavedNote(added ? "Saved to the library." : "Already in the library; tags merged.");
    setTimeout(() => setSavedNote(null), 2500);
  };
  const importCollection = async () => {
    const text = await (await fetch("/quotes/cold-quotes.txt")).text();
    const items = parseBatch(text).filter((i) => !i.errors.length);
    await saveQuotes(items.map((i) => ({ content: i.content, tags: i.tags })));
    await refreshLibrary();
  };

  /** Classic → Hook/Body/Punchline: split the pasted paragraph at sentence boundaries. */
  const structureInto = (target: "hbp" | "carousel") => {
    const source = format === "classic" ? String(content.text ?? "") : flatten(content as Record<string, string>);
    const parts = autoStructure(source);
    setContents((c) => ({ ...c, [target]: { ...c[target], ...parts } }));
    if (format !== target) chooseFormat(target);
  };

  const input: RenderInput = useMemo(
    () => ({
      content: { ...content, slide },
      template,
      signature: { enabled: settings.signatureEnabled, style: settings.signatureStyle },
      photo: ph.photo
        ? { image: ph.photo.bitmap, credit: { name: ph.photo.candidate.author.name, source: PROVIDER_NAMES[ph.photo.candidate.provider] } }
        : undefined,
      showCredit: settings.showCredit,
    }),
    [content, slide, template, settings.signatureEnabled, settings.signatureStyle, settings.showCredit, ph.photo],
  );

  // Track the preview frame size.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setFrame({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Live preview: the same render function, at screen resolution.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame.w || !frame.h) return;
    let cancelled = false;
    const aspect = preset.width / preset.height;
    const cssW = Math.min(frame.w, frame.h * aspect);
    const cssH = cssW / aspect;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    (async () => {
      try {
        await ensureFonts(facesForRender(getPairing(template.pairing), input.content));
        if (cancelled) return;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        const ctx = canvas.getContext("2d", { alpha: false }) as Ctx;
        setReport(renderQuote(ctx, browserEnv, input));
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [input, frame, preset, template.pairing]);

  /** Shuffle within the curated designs, keeping whatever is locked. */
  const shuffle = useCallback(() => {
    setTemplate((t) => shuffleTemplate(t, pool.filter((x) => x.format === t.format), locks));
  }, [pool, locks]);

  const surprise = useCallback(() => {
    const t = surpriseMe(pool.filter((x) => x.format === format), text.length, settings.preset, template.id);
    if (t) {
      setTemplate(t);
      setView("studio");
    }
  }, [pool, format, text, settings.preset, template.id]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((f) => {
      const next = new Set(f);
      const on = !next.has(id);
      if (on) next.add(id);
      else next.delete(id);
      setFavorite(id, on).catch(() => {});
      return next;
    });
  }, []);

  const saveCurrentAsMine = async () => {
    const name = window.prompt("Name this template", template.name.startsWith("Shuffled") ? "My template" : `${template.name} (mine)`);
    if (!name) return;
    const t: TemplateConfig = { ...template, id: `mine-${Date.now().toString(36)}`, name, hero: false, presets: undefined, score: undefined };
    await saveMyTemplate(t);
    setMine(await listMyTemplates());
    setTemplate(t);
  };
  const deleteMine = async (id: string) => {
    await deleteMyTemplate(id);
    setMine(await listMyTemplates());
  };
  const [copied, setCopied] = useState(false);
  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(template, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const doExport = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { width: w, height: h } = exportSize;
      const t0 = performance.now();
      // Re-verify the photo against the export size (reloads larger if needed).
      const loaded = photoBg ? await ph.ensureFor(exportSize) : null;
      const exportInput: RenderInput = loaded
        ? { ...input, photo: { image: loaded.bitmap, credit: { name: loaded.candidate.author.name, source: PROVIDER_NAMES[loaded.candidate.provider] } } }
        : input;
      const base = `fred-m_${slug(text)}_${format}_${preset.id}_${w}x${h}`;
      let reports: RenderReport[];
      if (slides > 1) {
        const r = await exportCarousel(exportInput, w, h, settings.format, slides, base);
        download(r.blob, `${base}_${slides}-slides.zip`);
        reports = r.reports;
      } else {
        const r = await exportImage(exportInput, w, h, settings.format);
        download(r.blob, `${base}.${settings.format === "jpeg" ? "jpg" : settings.format}`);
        reports = [r.report];
      }
      if (loaded) trackDownload(loaded.candidate);
      await addHistory({
        at: Date.now(),
        kind: slides > 1 ? "carousel" : "single",
        name: slides > 1 ? `${base}_${slides}-slides.zip` : `${base}.${settings.format === "jpeg" ? "jpg" : settings.format}`,
        files: slides,
        format,
        presetId: preset.id,
        width: w,
        height: h,
        template,
        content,
      });
      refreshHistory();
      const issues = [...new Set(reports.flatMap((report) => [...report.collisions, ...(report.overflow ? ["text overflow"] : []), ...(report.upscaled ? ["photo upscaled"] : [])]))];
      setLastExport(`${slides > 1 ? `${slides} slides, ` : ""}${w}×${h} in ${Math.round(performance.now() - t0)} ms${issues.length ? ` · ${issues.join(", ")}` : ""}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [input, exportSize, preset, settings.format, text, photoBg, ph, slides, format, template, content]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "r" || e.key === "R") shuffle();
      if (e.key === "f" || e.key === "F") toggleFavorite(template.id);
      if (e.key === "e" || e.key === "E") doExport();
      if ((e.key === "i" || e.key === "I") && photoBg) ph.next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shuffle, doExport, photoBg, ph, toggleFavorite, template.id]);

  const set = (patch: Partial<TemplateConfig>) => setTemplate((t) => ({ ...t, ...patch, id: "custom" }));

  return (
    <div className="min-h-dvh lg:h-dvh flex flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-line bg-panel">
        <div className="flex items-baseline gap-3">
          <span className="text-[15px] font-semibold tracking-tight">Quote Studio</span>
          <span className="hidden md:inline text-xs text-dim">Fred M | 1963ke · @ngariq_</span>
        </div>
        <nav className="flex flex-wrap gap-1.5" aria-label="View">
          {(["studio", "gallery", "batch", "library"] as const).map((v) => (
            <button key={v} className="chip capitalize" data-on={view === v} onClick={() => setView(v)}>{v}</button>
          ))}
        </nav>
        <div className="hidden lg:flex items-center gap-4 text-xs text-dim">
          <span>Favourite<kbd>F</kbd></span>
          <span>Shuffle<kbd>R</kbd></span>
          <span>New image<kbd>I</kbd></span>
          <span>Export<kbd>E</kbd></span>
        </div>
      </header>

      {view === "batch" && (
        <Batch
          presetId={settings.preset}
          scale={settings.scale}
          format={settings.format}
          signature={{ enabled: settings.signatureEnabled, style: settings.signatureStyle }}
          currentTemplate={template}
          photo={ph.photo?.bitmap}
          onOpen={openContent}
          onSaveToLibrary={async (items) => {
            const added = await saveQuotes(items);
            await refreshLibrary();
            return added;
          }}
          onExported={async ({ name, files, preview }) => {
            await addHistory({ at: Date.now(), kind: "batch", name, files, format: "batch", presetId: preset.id, width: exportSize.width, height: exportSize.height, preview });
            refreshHistory();
          }}
        />
      )}
      {view === "library" && (
        <Library
          quotes={quotes}
          history={history}
          onOpen={openContent}
          onDelete={async (id) => {
            await deleteQuote(id);
            refreshLibrary();
          }}
          onSetTags={async (id, tags) => {
            await updateQuoteTags(id, tags);
            refreshLibrary();
          }}
          onImportCollection={importCollection}
          onClearHistory={async () => {
            await clearHistory();
            refreshHistory();
          }}
        />
      )}
      {view === "gallery" && (
        <Gallery
          format={format}
          contents={contents}
          presetId={settings.preset}
          templates={pool}
          currentId={template.id}
          photo={ph.photo?.bitmap}
          signature={{ enabled: settings.signatureEnabled, style: settings.signatureStyle }}
          favorites={favorites}
          mine={mineIds}
          onToggleFavorite={toggleFavorite}
          onDeleteMine={deleteMine}
          onApply={(t) => {
            if (t.format !== format) chooseFormat(t.format);
            setTemplate(t);
            setView("studio");
          }}
          onSurprise={surprise}
        />
      )}
      {/* Kept mounted while the gallery is open so the preview keeps its state. */}
      <main className={`flex-1 min-h-0 grid-cols-1 lg:grid-cols-[320px_1fr_300px] ${view === "studio" ? "grid" : "hidden"}`}>
        {/* Input */}
        <section className="order-2 lg:order-1 bg-panel border-r border-line p-5 space-y-5 lg:overflow-y-auto">
          <div>
            <div className="label mb-2">Format</div>
            <select className="field" value={format} onChange={(e) => chooseFormat(e.target.value as FormatId)}>
              {FORMAT_LIST.map((f, i) => (
                <option key={f.id} value={f.id}>
                  {String(i + 1).padStart(2, "0")} · {f.name}
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-dim">{fmt.description}</div>
          </div>

          {fmt.fields.map((f) => (
            <Field key={`${format}-${f.key}`} def={f} value={content[f.key]} onChange={(v) => setField(f.key, v)} />
          ))}

          <div className="flex flex-wrap gap-2">
            {(format === "classic" || format === "hbp" || format === "carousel") && (
              <button className="btn" onClick={() => structureInto(format === "carousel" ? "carousel" : "hbp")} title="Split into hook, body and punchline at sentence boundaries">
                Auto-structure
              </button>
            )}
            <button className="btn" onClick={() => setContents((c) => ({ ...c, [format]: SAMPLES[format] }))}>Load sample</button>
          </div>

          <div>
            <div className="label mb-2">Library</div>
            <div className="flex gap-2">
              <input className="field" placeholder="Tags, comma separated" value={tagInput} onChange={(e) => setTagInput(e.target.value)} />
              <button className="btn shrink-0" onClick={saveToLibrary}>Save</button>
            </div>
            {savedNote && <div className="mt-1 text-xs text-dim">{savedNote}</div>}
          </div>
          {(format === "hbp" || format === "carousel") && (
            <div className="text-xs text-dim -mt-3">Auto-structure re-splits all the text: first sentence → hook, last → punchline, the rest → body.</div>
          )}

          <div>
            <div className="label mb-2">Templates</div>
            <div className="grid grid-cols-2 gap-1.5">
              {templatesFor(format).map((t) => (
                <button key={t.id} className="chip text-left overflow-hidden text-ellipsis" data-on={template.id === t.id} onClick={() => setTemplate(t)}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Preview */}
        <section className="order-1 lg:order-2 flex flex-col min-h-[70vh] lg:min-h-0 p-4 lg:p-8">
          <div ref={frameRef} className="flex-1 min-h-0 flex items-center justify-center">
            <canvas ref={canvasRef} className="shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_28px_rgba(0,0,0,0.08)]" />
          </div>
          {slides > 1 && (
            <div className="mt-3 flex items-center justify-center gap-3 text-sm">
              <button className="btn" onClick={() => setSlide((s) => Math.max(0, s - 1))} disabled={slide === 0} aria-label="Previous slide">←</button>
              <span className="tabular-nums text-dim">Slide {slide + 1} of {slides}</span>
              <button className="btn" onClick={() => setSlide((s) => Math.min(slides - 1, s + 1))} disabled={slide === slides - 1} aria-label="Next slide">→</button>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-dim">
            <span>{preset.width * settings.scale}×{preset.height * settings.scale} export</span>
            {report && <span>contrast {Math.min(...report.blocks.map((b) => b.contrast)).toFixed(1)}:1</span>}
            {report && report.collisions.length > 0 && <span className="text-red-700">{report.collisions.join(", ")}</span>}
            {report?.overflow && <span className="text-red-700">text too long for this size</span>}
            {report?.upscaled && <span className="text-red-700">photo would be upscaled</span>}
            {report?.fallback && <span>Adjusted to fit: {report.fallback}</span>}
            {error && <span className="text-red-700">{error}</span>}
          </div>
        </section>

        {/* Style controls */}
        <section className="order-3 bg-panel border-l border-line p-5 space-y-5 lg:overflow-y-auto">
          {/* On phones these live in the sticky bar at the bottom. */}
          <div className="hidden lg:flex gap-2">
            <button className="btn flex-1" onClick={shuffle}>Shuffle</button>
            <button className="btn btn-primary flex-1" onClick={doExport} disabled={busy}>{busy ? "Rendering…" : slides > 1 ? `Export ${slides}` : "Export"}</button>
          </div>
          {lastExport && <div className="text-xs text-dim -mt-3">Exported {lastExport}</div>}

          <Group label="Size">
            <select className="field" value={settings.preset} onChange={(e) => updateSettings({ preset: e.target.value })}>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {p.width}×{p.height}</option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[1, 2, 3].map((s) => (
                <button key={s} className="chip" data-on={settings.scale === s} onClick={() => updateSettings({ scale: s })}>{s}×</button>
              ))}
              <span className="w-2" />
              {(["png", "jpeg", "webp"] as ExportFormat[]).map((f) => (
                <button key={f} className="chip uppercase" data-on={settings.format === f} onClick={() => updateSettings({ format: f })}>{f}</button>
              ))}
            </div>
          </Group>

          <Group label="Layout">
            <Chips items={fmt.layouts} value={resolveLayout(format, template.layout)} onPick={(id) => set({ layout: id })} />
          </Group>

          <div className="flex gap-2">
            <button className="btn flex-1" onClick={surprise}>Surprise me</button>
            <button className="btn" onClick={() => toggleFavorite(template.id)} aria-pressed={favorites.has(template.id)} title="Favourite (F)">
              {favorites.has(template.id) ? "★" : "☆"}
            </button>
          </div>

          <Group label="Type pairing" lock={{ on: locks.font, toggle: () => setLocks((l) => ({ ...l, font: !l.font })) }}>
            <select className="field" value={template.pairing} onChange={(e) => set({ pairing: e.target.value })}>
              {PAIRINGS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Group>

          <Group label="Palette" lock={{ on: locks.palette, toggle: () => setLocks((l) => ({ ...l, palette: !l.palette })) }}>
            <div className="grid grid-cols-8 gap-1.5">
              {PALETTES.map((p) => (
                <button
                  key={p.id}
                  title={p.name}
                  aria-label={p.name}
                  onClick={() => set({ palette: p.id })}
                  className="aspect-square rounded-full border"
                  style={{ background: `linear-gradient(135deg, ${p.bg} 50%, ${p.ink} 50%)`, borderColor: template.palette === p.id ? "#1b1b1a" : "#e3e1db", outline: template.palette === p.id ? "2px solid #1b1b1a" : "none", outlineOffset: 1 }}
                />
              ))}
            </div>
            <div className="text-xs text-dim mt-1.5" data-testid="palette-name">{getPalette(template.palette).name}</div>
          </Group>

          <Group label="Background" lock={{ on: locks.image, toggle: () => setLocks((l) => ({ ...l, image: !l.image })) }}>
            <Chips items={BACKGROUNDS} value={template.background.kind} onPick={(id) => set({ background: BACKGROUNDS.find((b) => b.id === id)!.config })} />
            <div className="mt-2">
              <Chips items={PHOTO_BACKGROUNDS} value={template.background.kind} onPick={(id) => set({ background: PHOTO_BACKGROUNDS.find((b) => b.id === id)!.config })} />
            </div>
          </Group>

          {photoBg && (
            <Group label="Photo">
              <PhotoPanel ph={ph} showCredit={settings.showCredit} onCredit={(v) => updateSettings({ showCredit: v })} />
            </Group>
          )}

          <Group label="Signature">
            <label className="flex items-center gap-2 text-sm mb-2">
              <input type="checkbox" checked={settings.signatureEnabled} onChange={(e) => updateSettings({ signatureEnabled: e.target.checked })} />
              Show signature
            </label>
            <Chips items={SIGNATURE_STYLES} value={settings.signatureStyle} onPick={(id) => updateSettings({ signatureStyle: id })} />
            <div className="text-xs text-dim mt-1.5">Your choice is remembered as the default.</div>
          </Group>

          <Group label="Template">
            <div className="text-xs text-dim mb-2" data-testid="template-name">{template.name}{template.hero ? " · hero" : ""}</div>
            <div className="flex flex-wrap gap-2">
              <button className="btn" onClick={saveCurrentAsMine}>Save as mine</button>
              <button className="btn" onClick={copyJson}>{copied ? "Copied" : "Copy JSON"}</button>
            </div>
          </Group>
        </section>
      </main>

      {/* Phones: the main actions stay in reach while scrolling the form. */}
      {view === "studio" && (
        <div className="lg:hidden sticky bottom-0 z-10 flex gap-2 px-4 py-3 bg-panel/95 border-t border-line backdrop-blur" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <button className="btn flex-1" onClick={shuffle}>Shuffle</button>
          {photoBg && <button className="btn flex-1" onClick={ph.next}>New image</button>}
          <button className="btn btn-primary flex-1" onClick={doExport} disabled={busy}>{busy ? "Rendering…" : slides > 1 ? `Export ${slides}` : "Export"}</button>
        </div>
      )}
    </div>
  );
}

function Group({ label, children, lock }: { label: string; children: React.ReactNode; lock?: { on: boolean; toggle: () => void } }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="label">{label}</div>
        {lock && (
          <button
            onClick={lock.toggle}
            aria-pressed={lock.on}
            title={lock.on ? "Locked: shuffle keeps this" : "Lock while shuffling"}
            className={`text-[11px] px-1.5 rounded border ${lock.on ? "bg-ink text-white border-ink" : "border-line text-dim"}`}
          >
            {lock.on ? "Locked" : "Lock"}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Chips<T extends string>({ items, value, onPick }: { items: { id: T; name: string }[]; value: T; onPick: (id: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <button key={i.id} className="chip" data-on={value === i.id} onClick={() => onPick(i.id)}>
          {i.name}
        </button>
      ))}
    </div>
  );
}

function PhotoPanel({ ph, showCredit, onCredit }: { ph: ReturnType<typeof usePhoto>; showCredit: boolean; onCredit: (v: boolean) => void }) {
  const c = ph.photo?.candidate;
  const statusText: Record<string, string> = {
    searching: "Searching…",
    loading: "Loading full-resolution photo…",
    offline: "No image API keys configured. Using a generated background.",
    empty: "No photo large enough for this export. Try another keyword or mood.",
    error: ph.message ?? "Something went wrong.",
  };
  const r = ph.response;
  const used = r?.providers.filter((p) => p.status === "ok" && p.found) ?? [];
  const tooSmall = r?.providers.reduce((n, p) => n + p.tooSmall, 0) ?? 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {MOOD_IDS.map((m) => (
          <button
            key={m}
            className="chip"
            data-on={ph.moods.includes(m)}
            onClick={() => ph.setMoods(ph.moods.includes(m) ? ph.moods.filter((x) => x !== m) : [...ph.moods, m].slice(-3))}
          >
            {MOODS[m].label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-dim">
        <span>{ph.moodsTouched ? "Moods chosen by you." : "Moods detected from the quote."}</span>
        {ph.moodsTouched && (
          <button className="underline" onClick={ph.resetMoods}>Auto</button>
        )}
      </div>
      <input className="field" value={ph.keyword} onChange={(e) => ph.setKeyword(e.target.value)} placeholder={`Keyword (auto: ${ph.query})`} />
      <button className="btn w-full" onClick={ph.next} disabled={ph.status === "searching" || ph.status === "offline"}>
        New image<kbd>I</kbd>
      </button>
      <div className="text-xs text-dim space-y-1">
        {statusText[ph.status] && <div className={ph.status === "error" ? "text-red-700" : ""}>{statusText[ph.status]}</div>}
        {c && ph.photo && (
          <div>
            Photo by{" "}
            <a className="underline" href={withReferral(c.author.url)} target="_blank" rel="noreferrer">{c.author.name}</a> on{" "}
            <a className="underline" href={withReferral(c.pageUrl)} target="_blank" rel="noreferrer">{PROVIDER_NAMES[c.provider]}</a>
            <span className="block">
              {c.width}×{c.height} original · {ph.index + 1} of {ph.candidates.length}, calmest first
            </span>
          </div>
        )}
        {used.length > 0 && (
          <div>
            Source: {used.map((p) => PROVIDER_NAMES[p.provider]).join(", ")}
            {tooSmall > 0 && ` · ${tooSmall} rejected as too small`}
            {r?.unsplashRemaining !== undefined && ` · Unsplash quota left: ${r.unsplashRemaining}`}
          </div>
        )}
        {r?.providers.some((p) => p.status === "rate-limited") && <div>Unsplash hourly limit reached; using fallbacks.</div>}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showCredit} onChange={(e) => onCredit(e.target.checked)} />
        Tiny photo credit on the image
      </label>
    </div>
  );
}

function Field({ def, value, onChange }: { def: FieldDef; value: QuoteContent[string]; onChange: (v: string | string[]) => void }) {
  const text = Array.isArray(value) ? value.join("\n") : value === undefined ? "" : String(value);
  return (
    <label className="block">
      <div className="label mb-2">
        {def.label}
        {def.optional && <span className="normal-case tracking-normal"> (optional)</span>}
      </div>
      {def.kind === "text" ? (
        <input className="field" value={text} placeholder={def.placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <textarea
          className="field font-[inherit]"
          rows={def.kind === "list" ? 6 : def.rows ?? 3}
          value={text}
          placeholder={def.placeholder}
          onChange={(e) => onChange(def.kind === "list" ? e.target.value.split("\n") : e.target.value)}
        />
      )}
      {def.hint && <div className="mt-1 text-xs text-dim">{def.hint}</div>}
    </label>
  );
}
