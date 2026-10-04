"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserEnv, ensureFonts, facesForRender } from "@/lib/render/browser";
import { PAIRINGS, getPairing } from "@/lib/render/pairings";
import { PALETTES, getPalette } from "@/lib/render/palettes";
import { PRESETS, getPreset } from "@/lib/render/presets";
import { renderQuote, type RenderInput, type RenderReport } from "@/lib/render/render";
import { SIGNATURE_STYLES } from "@/lib/render/signature";
import type { BackgroundConfig, LayoutId, SignatureStyle, TemplateConfig } from "@/lib/render/template";
import type { Ctx } from "@/lib/render/types";
import { download, exportImage, slug, type ExportFormat } from "@/lib/studio/export";
import { HERO_TEMPLATES } from "@/lib/studio/templates";

const LAYOUTS: { id: LayoutId; name: string }[] = [
  { id: "centered", name: "Centred" },
  { id: "editorial", name: "Editorial" },
  { id: "bottom", name: "Bottom" },
  { id: "top", name: "Top" },
  { id: "pull-quote", name: "Pull quote" },
  { id: "corner", name: "Corner" },
  { id: "framed-card", name: "Card" },
];

const BACKGROUNDS: { id: BackgroundConfig["kind"]; name: string; config: BackgroundConfig }[] = [
  { id: "solid", name: "Solid", config: { kind: "solid" } },
  { id: "gradient", name: "Gradient", config: { kind: "gradient", angle: 12 } },
  { id: "paper", name: "Paper", config: { kind: "paper" } },
  { id: "vignette", name: "Vignette", config: { kind: "vignette", strength: 0.4 } },
];

const SAMPLE = "Most people don't want the truth. They want a *quieter* version of it they can live next to.";
const SETTINGS_KEY = "pqs.settings.v1";

interface Settings {
  signatureEnabled: boolean;
  signatureStyle: SignatureStyle;
  preset: string;
  scale: number;
  format: ExportFormat;
}
const DEFAULT_SETTINGS: Settings = { signatureEnabled: true, signatureStyle: "line", preset: "status", scale: 2, format: "png" };

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const pick = <T,>(xs: T[], not?: T) => {
  const pool = xs.length > 1 ? xs.filter((x) => x !== not) : xs;
  return pool[Math.floor(Math.random() * pool.length)];
};

export default function Studio() {
  const [text, setText] = useState(SAMPLE);
  const [author, setAuthor] = useState("");
  const [template, setTemplate] = useState<TemplateConfig>(HERO_TEMPLATES[0]);
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
  const input: RenderInput = useMemo(
    () => ({
      content: { format: "classic", text: text || " ", author: author || undefined },
      template,
      signature: { enabled: settings.signatureEnabled, style: settings.signatureStyle },
    }),
    [text, author, template, settings.signatureEnabled, settings.signatureStyle],
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
        await ensureFonts(facesForRender(getPairing(template.pairing)));
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

  const shuffle = useCallback(() => {
    setTemplate((t) => ({
      ...t,
      id: "custom",
      name: "Shuffled",
      layout: pick(LAYOUTS.map((l) => l.id), t.layout),
      palette: pick(PALETTES.map((p) => p.id), t.palette),
      pairing: pick(PAIRINGS.filter((p) => !p.mono).map((p) => p.id), t.pairing),
      background: pick(BACKGROUNDS.map((b) => b.config)),
    }));
  }, []);

  const doExport = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const w = preset.width * settings.scale, h = preset.height * settings.scale;
      const t0 = performance.now();
      const { blob, report } = await exportImage(input, w, h, settings.format);
      const name = `fred-m_${slug(text)}_${preset.id}_${w}x${h}.${settings.format === "jpeg" ? "jpg" : settings.format}`;
      download(blob, name);
      const issues = [...report.collisions, ...(report.overflow ? ["text overflow"] : [])];
      setLastExport(`${w}×${h} in ${Math.round(performance.now() - t0)} ms${issues.length ? ` · ${issues.join(", ")}` : ""}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [input, preset, settings.scale, settings.format, text]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "r" || e.key === "R") shuffle();
      if (e.key === "e" || e.key === "E") doExport();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shuffle, doExport]);

  const set = (patch: Partial<TemplateConfig>) => setTemplate((t) => ({ ...t, ...patch, id: "custom" }));

  return (
    <div className="min-h-dvh lg:h-dvh flex flex-col">
      <header className="flex items-baseline justify-between px-5 py-3 border-b border-line bg-panel">
        <div className="flex items-baseline gap-3">
          <span className="text-[15px] font-semibold tracking-tight">Quote Studio</span>
          <span className="text-xs text-dim">Fred M | 1963ke · @ngariq_</span>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs text-dim">
          <span>Shuffle<kbd>R</kbd></span>
          <span>Export<kbd>E</kbd></span>
        </div>
      </header>

      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[320px_1fr_300px]">
        {/* Input */}
        <section className="order-2 lg:order-1 bg-panel border-r border-line p-5 space-y-5 lg:overflow-y-auto">
          <div>
            <div className="label mb-2">Format</div>
            <div className="flex flex-wrap gap-1.5">
              <span className="chip" data-on="true">Classic</span>
              <span className="chip text-dim">19 more in step 3</span>
            </div>
          </div>
          <label className="block">
            <div className="label mb-2">Quote</div>
            <textarea className="field min-h-36 font-[inherit]" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="mt-1 text-xs text-dim">Wrap words in *asterisks* for emphasis. Quotes, apostrophes and dashes are set automatically.</div>
          </label>
          <label className="block">
            <div className="label mb-2">Author (optional)</div>
            <input className="field" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Leave empty for your own lines" />
          </label>
          <div>
            <div className="label mb-2">Templates</div>
            <div className="grid grid-cols-2 gap-1.5">
              {HERO_TEMPLATES.map((t) => (
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
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-dim">
            <span>{preset.width * settings.scale}×{preset.height * settings.scale} export</span>
            {report && <span>contrast {Math.min(...report.blocks.map((b) => b.contrast)).toFixed(1)}:1</span>}
            {report && report.collisions.length > 0 && <span className="text-red-700">{report.collisions.join(", ")}</span>}
            {report?.overflow && <span className="text-red-700">text too long for this size</span>}
            {error && <span className="text-red-700">{error}</span>}
          </div>
        </section>

        {/* Style controls */}
        <section className="order-3 bg-panel border-l border-line p-5 space-y-5 lg:overflow-y-auto">
          <div className="flex gap-2">
            <button className="btn flex-1" onClick={shuffle}>Shuffle</button>
            <button className="btn btn-primary flex-1" onClick={doExport} disabled={busy}>{busy ? "Rendering…" : "Export"}</button>
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
            <Chips items={LAYOUTS} value={template.layout} onPick={(id) => set({ layout: id })} />
          </Group>

          <Group label="Type pairing">
            <select className="field" value={template.pairing} onChange={(e) => set({ pairing: e.target.value })}>
              {PAIRINGS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Group>

          <Group label="Palette">
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
            <div className="text-xs text-dim mt-1.5">{getPalette(template.palette).name}</div>
          </Group>

          <Group label="Background">
            <Chips items={BACKGROUNDS} value={template.background.kind} onPick={(id) => set({ background: BACKGROUNDS.find((b) => b.id === id)!.config })} />
            <div className="text-xs text-dim mt-1.5">Photo backgrounds arrive in step 2.</div>
          </Group>

          <Group label="Signature">
            <label className="flex items-center gap-2 text-sm mb-2">
              <input type="checkbox" checked={settings.signatureEnabled} onChange={(e) => updateSettings({ signatureEnabled: e.target.checked })} />
              Show signature
            </label>
            <Chips items={SIGNATURE_STYLES} value={settings.signatureStyle} onPick={(id) => updateSettings({ signatureStyle: id })} />
            <div className="text-xs text-dim mt-1.5">Your choice is remembered as the default.</div>
          </Group>
        </section>
      </main>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-2">{label}</div>
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
