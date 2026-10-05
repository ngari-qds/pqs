"use client";
/**
 * Gallery: every curated and generated design for a format, rendered with
 * your current quote. Thumbnails render lazily (as they scroll into view)
 * through a single queue so the page stays responsive.
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { browserEnv, ensureFonts, facesForRender } from "@/lib/render/browser";
import { FORMATS, FORMAT_LIST } from "@/lib/render/formats";
import { getPairing } from "@/lib/render/pairings";
import { PALETTES } from "@/lib/render/palettes";
import { getPreset } from "@/lib/render/presets";
import { renderQuote } from "@/lib/render/render";
import type { FormatId, QuoteContent, SignatureStyle, TemplateConfig } from "@/lib/render/template";
import type { Ctx, Drawable } from "@/lib/render/types";
import { GALLERY_MOODS } from "@/lib/templates/generator";
import { filterTemplates, placeholderPhoto, type GalleryFilter } from "@/lib/studio/gallery";

// ------------------------------------------------------------ render queue

type Job = () => Promise<void>;
const queue: Job[] = [];
let running = false;
function enqueue(job: Job) {
  queue.push(job);
  if (running) return;
  running = true;
  const step = async () => {
    const next = queue.shift();
    if (!next) {
      running = false;
      return;
    }
    try {
      await next();
    } catch {}
    // Yield to the browser between thumbnails.
    setTimeout(step, 0);
  };
  step();
}

interface Props {
  format: FormatId;
  contents: Record<FormatId, QuoteContent>;
  presetId: string;
  templates: TemplateConfig[];
  currentId: string;
  photo?: Drawable;
  signature: { enabled: boolean; style: SignatureStyle };
  favorites: Set<string>;
  mine: Set<string>;
  onToggleFavorite: (id: string) => void;
  onDeleteMine: (id: string) => void;
  onApply: (t: TemplateConfig) => void;
  onSurprise: () => void;
}

export default function Gallery(props: Props) {
  const { format, presetId, templates, favorites, mine } = props;
  const [filter, setFilter] = useState<GalleryFilter>({
    format, moods: [], palettes: [], layout: null, photo: "all", favoritesOnly: false, mineOnly: false, preset: presetId,
  });
  const [order, setOrder] = useState(0);
  useEffect(() => setFilter((f) => ({ ...f, format, layout: null })), [format]);
  useEffect(() => setFilter((f) => ({ ...f, preset: f.preset ? presetId : null })), [presetId]);

  const list = useMemo(() => {
    const l = filterTemplates(templates, filter, favorites, mine);
    if (!order) return l;
    // Deterministic shuffle per press.
    const keyed = l.map((t, i) => ({ t, k: Math.sin((i + 1) * 9301 + order * 49297) }));
    return keyed.sort((a, b) => a.k - b.k).map((x) => x.t);
  }, [templates, filter, favorites, mine, order]);

  const fmt = FORMATS[filter.format];
  const set = (patch: Partial<GalleryFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const preset = getPreset(presetId);
  const content = props.contents[filter.format];

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
      <aside className="lg:w-[300px] shrink-0 bg-panel border-b lg:border-b-0 lg:border-r border-line p-5 space-y-5 lg:overflow-y-auto">
        <div className="flex gap-2">
          <button className="btn btn-primary flex-1" onClick={props.onSurprise}>Surprise me</button>
          <button className="btn flex-1" onClick={() => setOrder((o) => o + 1)}>Shuffle</button>
        </div>
        <div>
          <div className="label mb-2">Format</div>
          <select className="field" value={filter.format} onChange={(e) => set({ format: e.target.value as FormatId, layout: null })}>
            {FORMAT_LIST.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="label mb-2">Layout</div>
          <div className="flex flex-wrap gap-1.5">
            <button className="chip" data-on={!filter.layout} onClick={() => set({ layout: null })}>All</button>
            {fmt.layouts.map((l) => (
              <button key={l.id} className="chip" data-on={filter.layout === l.id} onClick={() => set({ layout: filter.layout === l.id ? null : l.id })}>{l.name}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="label mb-2">Mood</div>
          <div className="flex flex-wrap gap-1.5">
            {GALLERY_MOODS.map((m) => (
              <button key={m} className="chip capitalize" data-on={filter.moods.includes(m)} onClick={() => set({ moods: toggle(filter.moods, m) })}>{m}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="label mb-2">Palette</div>
          <div className="grid grid-cols-8 gap-1.5">
            {PALETTES.map((p) => {
              const on = filter.palettes.includes(p.id);
              return (
                <button
                  key={p.id}
                  title={p.name}
                  aria-label={p.name}
                  aria-pressed={on}
                  onClick={() => set({ palettes: toggle(filter.palettes, p.id) })}
                  className="aspect-square rounded-full border"
                  style={{ background: `linear-gradient(135deg, ${p.bg} 50%, ${p.ink} 50%)`, borderColor: on ? "#1b1b1a" : "#e3e1db", outline: on ? "2px solid #1b1b1a" : "none", outlineOffset: 1 }}
                />
              );
            })}
          </div>
        </div>
        <div>
          <div className="label mb-2">Background</div>
          <div className="flex flex-wrap gap-1.5">
            {(["all", "plain", "photo"] as const).map((v) => (
              <button key={v} className="chip capitalize" data-on={filter.photo === v} onClick={() => set({ photo: v })}>{v === "plain" ? "No photo" : v}</button>
            ))}
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={filter.favoritesOnly} onChange={(e) => set({ favoritesOnly: e.target.checked })} /> Favourites only
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={filter.mineOnly} onChange={(e) => set({ mineOnly: e.target.checked })} /> My saved templates
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!filter.preset} onChange={(e) => set({ preset: e.target.checked ? presetId : null })} />
            Only designs that fit {preset.name.toLowerCase()} comfortably
          </label>
        </div>
      </aside>

      <section className="flex-1 min-h-0 lg:overflow-y-auto p-4 lg:p-6">
        <div className="mb-3 text-xs text-dim">
          {list.length} {list.length === 1 ? "design" : "designs"} for {fmt.name}, shown with your text at {preset.name.toLowerCase()} proportions.
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {list.map((t) => (
            <Thumb
              key={t.id}
              template={t}
              content={content}
              aspect={preset.width / preset.height}
              photo={props.photo}
              signature={props.signature}
              current={t.id === props.currentId}
              favorite={favorites.has(t.id)}
              mine={mine.has(t.id)}
              onToggleFavorite={() => props.onToggleFavorite(t.id)}
              onDelete={() => props.onDeleteMine(t.id)}
              onApply={() => props.onApply(t)}
            />
          ))}
        </div>
        {list.length === 0 && <div className="text-sm text-dim mt-8 text-center">No designs match these filters.</div>}
      </section>
    </div>
  );
}

interface ThumbProps {
  template: TemplateConfig;
  content: QuoteContent;
  aspect: number;
  photo?: Drawable;
  signature: { enabled: boolean; style: SignatureStyle };
  current: boolean;
  favorite: boolean;
  mine: boolean;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onApply: () => void;
}

const Thumb = memo(function Thumb({ template, content, aspect, photo, signature, current, favorite, mine, onToggleFavorite, onDelete, onApply }: ThumbProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const isPhoto = template.background.kind.startsWith("photo");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    enqueue(async () => {
      const canvas = ref.current;
      if (cancelled || !canvas) return;
      const cssW = canvas.clientWidth || 160;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(cssW * dpr);
      await ensureFonts(facesForRender(getPairing(template.pairing), content));
      if (cancelled) return;
      canvas.width = w;
      canvas.height = Math.round(w / aspect);
      renderQuote(canvas.getContext("2d", { alpha: false }) as Ctx, browserEnv, {
        content: { ...content, slide: 0 },
        template,
        signature,
        photo: isPhoto ? { image: photo ?? placeholderPhoto() } : undefined,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [visible, template, content, aspect, photo, signature, isPhoto]);

  return (
    <figure className="group">
      <button
        onClick={onApply}
        className="block w-full rounded-sm overflow-hidden bg-line/40 outline-offset-2"
        style={{ aspectRatio: String(aspect), outline: current ? "2px solid #1b1b1a" : "none" }}
        title={`Use “${template.name}”`}
      >
        <canvas ref={ref} className="block w-full h-full" />
      </button>
      <figcaption className="mt-1.5 flex items-start gap-1 text-[11px] leading-snug text-dim">
        <span className="flex-1 min-w-0">
          {template.name}
          {template.hero && <span className="ml-1 text-ink">· hero</span>}
          {mine && <span className="ml-1 text-ink">· mine</span>}
        </span>
        {mine && (
          <button onClick={onDelete} aria-label="Delete my template" className="px-1 hover:text-ink">×</button>
        )}
        <button onClick={onToggleFavorite} aria-label={favorite ? "Remove favourite" : "Add favourite"} aria-pressed={favorite} className="px-1 hover:text-ink">
          {favorite ? "★" : "☆"}
        </button>
      </figcaption>
    </figure>
  );
});
