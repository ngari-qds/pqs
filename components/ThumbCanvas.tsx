"use client";
/**
 * A lazily rendered design thumbnail. Renders when scrolled near the
 * viewport, through one shared queue so long lists stay responsive.
 */
import { memo, useEffect, useRef, useState } from "react";
import { browserEnv, ensureFonts, facesForRender } from "@/lib/render/browser";
import { getPairing } from "@/lib/render/pairings";
import { renderQuote, type RenderReport } from "@/lib/render/render";
import type { QuoteContent, SignatureStyle, TemplateConfig } from "@/lib/render/template";
import type { Tone } from "@/lib/render/tone";
import type { Ctx, Drawable } from "@/lib/render/types";
import { placeholderPhoto } from "@/lib/studio/gallery";

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
    setTimeout(step, 0); // yield to the browser between thumbnails
  };
  step();
}

export interface ThumbCanvasProps {
  template: TemplateConfig;
  content: QuoteContent;
  aspect: number;
  photo?: Drawable;
  signature: { enabled: boolean; style: SignatureStyle };
  tone?: Tone;
  onRendered?: (r: RenderReport) => void;
  className?: string;
}

export const ThumbCanvas = memo(function ThumbCanvas({ template, content, aspect, photo, signature, tone, onRendered, className }: ThumbCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const isPhoto = template.background.kind.startsWith("photo");
  const cb = useRef(onRendered);
  cb.current = onRendered;

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
      const w = Math.round((canvas.clientWidth || 160) * Math.min(2, window.devicePixelRatio || 1));
      await ensureFonts(facesForRender(getPairing(template.pairing), content));
      if (cancelled) return;
      canvas.width = w;
      canvas.height = Math.round(w / aspect);
      const r = renderQuote(canvas.getContext("2d", { alpha: false }) as Ctx, browserEnv, {
        content: { ...content, slide: content.slide ?? 0 },
        template,
        signature,
        tone,
        photo: isPhoto ? { image: photo ?? placeholderPhoto() } : undefined,
      });
      cb.current?.(r);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, template, content, aspect, photo, signature, tone, isPhoto]);

  return <canvas ref={ref} className={className ?? "block w-full h-full"} />;
});
