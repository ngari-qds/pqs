# Quote Studio — Fred M | 1963ke

A personal quote image designer. Paste a line, pick a look, export a
pixel-perfect image with the signature **Fred M | 1963ke · @ngariq_** on it.

> **Build status:** step 1 of 5 is done: render engine, typography engine, the
> Classic format, crisp exports up to 3×, six signature styles, and a QA script.
> Photo sourcing (step 2), the other 19 formats (step 3), the gallery (step 4)
> and batch/library (step 5) come next.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Studio with live preview |
| `npm test` | Unit tests (auto-fit, line breaking, smart typography) |
| `npm run qa` | Renders every template × every preset at 3× and fails on overflow, contrast < 4.5:1, signature collisions or photo upscaling (`-- --scale 1` for a fast pass, `-- --keep` to save the PNGs to `qa-report/`) |
| `npm run sample` | Writes sample exports to `samples/`, including a 400% crop |
| `npm run fonts` | Re-downloads fonts after editing `lib/fonts/registry.ts` |
| `npm run typecheck` | TypeScript |

Shortcuts in the studio: **R** shuffle, **E** export.

## Environment variables

Image search (step 2) runs through a server-side proxy, so keys never reach
the browser. Copy `.env.example` to `.env.local`:

```
UNSPLASH_ACCESS_KEY=...
PEXELS_API_KEY=...
PIXABAY_API_KEY=...
```

Without any keys, the studio falls back to generated backgrounds (solid,
gradient, paper, vignette), all rendered at full resolution.

## How rendering stays sharp

- **One render function** (`lib/render/render.ts`) draws straight onto a 2D
  canvas at the final pixel size. The preview calls the same function at
  screen resolution. No DOM screenshots.
- **Layout doesn't depend on resolution.** Text is measured once at a 100px
  reference size and scaled linearly, with tracking in em, so a line break in
  the preview is the same line break at 3240×5760.
- **Fonts are self-hosted** (`assets/fonts`, via `next/font/local`) and
  explicitly loaded and checked before every render, so nothing is ever drawn
  in a fallback font. The Node QA renderer registers the same TTF files.
- **No banding.** Gradients, scrims and vignettes are computed per pixel in
  float (interpolated in OKLab) and quantised with ±1/255 triangular dither.
- **Crisp rules.** Rules and borders snap to whole pixels.
- **Photos are never upscaled.** Big reductions happen in successive halving
  steps, and an upscale counts as a QA failure.
- **Contrast is measured, not assumed.** The renderer samples the real pixels
  under each text block. If WCAG 4.5:1 fails, it strengthens a local dithered
  scrim (on photos) or switches to a passing colour.
- PNG by default. JPEG and WebP export at quality 0.95.

## Project layout

```
lib/render/            isolated render engine (no React)
  typography/          smart quotes, tokenizer, line breaking, auto-fit, metrics
  formats/classic.ts   Classic format, 7 layouts
  stack.ts             joint auto-fit of stacked text blocks + drawing
  signature.ts         6 signature styles, adaptive ink
  pixels.ts            dithered gradients, scrims, paper, luminance sampling
  background.ts photo.ts palettes.ts pairings.ts presets.ts
  browser.ts           browser env + font loading
templates/*.json       template configs (duplicate and tweak freely)
scripts/               qa.ts, render-sample.ts, fetch-fonts.ts, node-env.ts
tests/                 vitest unit tests
components/Studio.tsx  the three-panel studio UI
```

## Deploying to Vercel

1. Push the repo to GitHub and import it at vercel.com/new (framework: Next.js).
2. Add `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY` and `PIXABAY_API_KEY` under
   Project → Settings → Environment Variables.
3. Deploy. No other configuration is needed. Fonts ship with the repo.

## Fonts

All fonts are from Google Fonts under the SIL Open Font License, committed as
static TTF instances in `assets/fonts/`.
