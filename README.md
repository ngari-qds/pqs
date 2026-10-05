# Quote Studio — Fred M | 1963ke

A personal quote image designer. Paste a line, pick a look, export a
pixel-perfect image with the signature **Fred M | 1963ke · @ngariq_** on it.

> **Build status:** steps 1–2 of 5 are done: render engine, typography, the
> Classic format, crisp exports up to 3×, six signature styles, QA, and photo
> backgrounds from Unsplash / Pexels / Pixabay with resolution checks.
> The other 19 formats (step 3), the gallery (step 4) and batch/library
> (step 5) come next.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Studio with live preview |
| `npm run dev:mock` | Studio with generated local test photos instead of the APIs (run `npm run mock:photos` once first) |
| `npm test` | Unit tests (auto-fit, line breaking, smart typography) |
| `npm run qa` | Renders every template × every preset at 3× and fails on overflow, contrast < 4.5:1, signature collisions or photo upscaling. Photo templates are tested on generated test photos, created automatically on first run. Flags: `-- --scale 1` for a fast pass, `-- --keep` to save the PNGs to `qa-report/`, `-- --only photo` to filter templates by id |
| `npm run sample` | Writes sample exports to `samples/`, including a 400% crop |
| `npm run fonts` | Re-downloads fonts after editing `lib/fonts/registry.ts` |
| `npm run typecheck` | TypeScript |

Shortcuts in the studio: **R** shuffle, **I** new image, **E** export.

## Environment variables

Copy `.env.example` to `.env.local` and fill in whichever keys you have:

```
UNSPLASH_ACCESS_KEY=...   # unsplash.com/developers → New application → Access Key
PEXELS_API_KEY=...        # pexels.com/api
PIXABAY_API_KEY=...       # pixabay.com/api/docs
```

All three are optional. Without any keys, photo templates fall back to
generated backgrounds rendered at full resolution, and the studio says so.

## Photos

- **Order:** Unsplash → Pexels → Pixabay. The next provider is only asked
  when the previous one returns fewer than 6 usable photos, is rate-limited
  or errors.
- **Keys stay server-side.** `/api/images/search` calls the APIs and
  `/api/images/file` streams the image bytes through our origin, so the
  canvas is never tainted. The file proxy only fetches from the provider
  CDNs over https, and redirects are checked too.
- **Never upscaled.** Any photo whose original is smaller than the export in
  either dimension is dropped, and the studio shows how many. Unsplash is
  requested through imgix (`&w=…&q=90&fm=jpg&fit=crop&crop=entropy`) at the
  width that still covers the canvas after cropping. Pexels uses
  `src.original` and Pixabay the largest size the key may access, decoded
  with `createImageBitmap(..., { resizeQuality: "high" })`. After decoding,
  the size is checked again, and the photo is re-verified (and re-fetched
  larger if needed) when the export scale goes up.
- **Calm areas first.** Candidates are ranked by how busy the photo is where
  the layout puts text (luminance spread plus edge energy on a small
  thumbnail).
- **Keywords.** Mood tags are detected from the quote (solitude, ambition,
  time, city, ocean, night, stone, fog, architecture, desert, minimal,
  forest, rain, road) and mapped to calm, editorial search terms. You can
  toggle moods, type your own keyword, or press **I** for the next photo.
- **Treatments:** photo with scrim (placed to match the layout), grayscale
  with tint, duotone, blurred, split (photo on one side, text on a solid
  panel) and framed.
- **Contrast.** If a photo is too busy behind the text or the signature, a
  soft dithered local scrim is added until 4.5:1 is met.
- **Compliance.** The photographer and photo page are linked in the UI (with
  Unsplash referral parameters). Every export pings Unsplash's
  `download_location` through `/api/images/download`. A tiny photo credit on
  the image is optional.
- **Rate limits.** Unsplash demo keys allow 50 requests per hour. The server
  tracks the remaining quota and pauses Unsplash for an hour when it runs
  out. Results are cached in memory on the server for an hour, and per
  keyword in IndexedDB in the browser for a day.

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
lib/images/            photo sourcing: providers, fallback chain, resolution rules,
                       keyword engine, calm-area scoring, browser client
app/api/images/        search, file proxy, Unsplash download ping, mock photos
templates/*.json       template configs (duplicate and tweak freely)
scripts/               qa.ts (+ qa-worker.ts), render-sample.ts, mock-photos.ts,
                       fetch-fonts.ts, node-env.ts
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
