# Quote Studio — Fred M | 1963ke

A personal quote image designer. Paste a line, pick a look, export a
pixel-perfect image with the signature **Fred M | 1963ke · @ngariq_** on it.

> **Build status:** all five steps are done: render engine and typography,
> 20 quote formats with 25 layout archetypes, photo backgrounds with
> resolution checks, a generated gallery of 485 QA-verified designs plus 60
> hand-tuned heroes, batch mode, a quote library with tags, export history,
> a collection of 4,454 cold quotes (200 or more per format) ready to load,
> and upload import for .txt, .md, .json and .csv files.

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
| `npx tsx scripts/render-formats.ts` | Renders every format's sample in every layout to `samples/formats/` with contact sheets |
| `npx tsx scripts/check-quotes.ts [filter]` | Checks that every quote in the collection sets cleanly at Stories and Instagram portrait (`filter` limits it to matching files, e.g. `stanza`) |
| `npx tsx scripts/count-quotes.ts` | Counts quotes per collection file; reports parse errors, untagged quotes and duplicates across files |
| `npx tsx scripts/quotes-index.ts` | Rewrites `public/quotes/index.json` after editing collection files |
| `npm run templates` | Regenerates `templates/gallery.json` (see below), about 3 minutes |
| `npm run fonts` | Re-downloads fonts after editing `lib/fonts/registry.ts` |
| `npm run typecheck` | TypeScript |

Shortcuts in the studio: **R** shuffle (respects locks), **I** new image,
**E** export, **F** favourite the current design. A new quote goes from
paste to exported image in a few seconds; a single 2× export typically takes
0.2–1.5 s.

## Environment variables

Copy `.env.example` to `.env.local` and fill in whichever keys you have:

```
UNSPLASH_ACCESS_KEY=...   # unsplash.com/developers → New application → Access Key
PEXELS_API_KEY=...        # pexels.com/api
PIXABAY_API_KEY=...       # pixabay.com/api/docs
```

All three are optional. Without any keys, photo templates fall back to
generated backgrounds rendered at full resolution, and the studio says so.

## Formats

Pick a format in the left panel; the form changes to that format's fields.
Every format loads with a sample line (20 in all, one per format).

| # | Format | Fields | Layouts |
| --- | --- | --- | --- |
| 1 | Classic | quote, author | centred, editorial, bottom, top, pull quote, corner, card |
| 2 | Hook / Body / Punchline | hook, body, punchline | stacked, centred, margin rule, split |
| 3 | Carousel | hook, body, punchline | left, centred (3–5 numbered slides, exported as a ZIP) |
| 4 | One-liner | line | centred, low, corner |
| 5 | Highlight | quote with `*emphasis*` | centred, editorial, bottom |
| 6 | Contrast | two labels, two statements | stacked, panels, split |
| 7 | Myth vs Truth | same | stacked, panels, split |
| 8 | Then / Now | same | stacked, panels, split |
| 9 | Paradox | two lines | mirror, axis |
| 10 | List | title, 3–7 items | numbered, ruled |
| 11 | Question + Answer | question, answer | margin, stacked |
| 12 | Definition | word, phonetic, part of speech, definition, usage | entry, centred |
| 13 | Equation | equation (several lines align on `=`), caption | centred, ledger |
| 14 | Stat | number, context, source | hero, centred |
| 15 | Law | name, number, statement | placard, centred |
| 16 | Dialogue | two speakers, two lines | script, stacked |
| 17 | Stanza | title, verse, author | left, centred (line breaks preserved) |
| 18 | Field Note | date, place, observation | notebook, margin |
| 19 | Post Card | post, date | card, flat (name and handle, no fake metrics) |
| 20 | Pull Quote | quote, source | rules, hanging mark, centred |

- **Auto-structure** splits a pasted paragraph into hook, body and punchline
  at sentence boundaries (first sentence → hook, last → punchline). It is a
  suggestion; edit freely.
- **Emphasis**: `*words*` in any field get the template's treatment
  (italic, colour, underline or a highlighter tint).
- **Equations** get a true × for `x`/`*`, − for a spaced `-`, ÷ for a spaced
  `/`, and set in a monospace face.
- **Phonetics**: IPA and other rare glyphs fall back to Gentium Book Plus,
  glyph by glyph, wherever a face lacks them.
- **Long text never overflows.** If text cannot fit at the minimum readable
  size, split and framed photos give up space, then the format's most compact
  layout is used, and the studio says so.

## Views

- **Studio**: one quote at a time. Format, fields, live preview, style
  controls, export. The form has a **Library** box to save the current quote
  with tags.
- **Black & white** (under Palette): renders every design and photo in
  greys. Each colour becomes the grey of the same luminance, so contrast,
  layout and the QA guarantees are unchanged. It applies to the preview,
  the gallery, batch mode and every export, and is remembered.
- **Gallery**: every curated and generated design for the format, shown with
  your text (see below).
- **Batch**: paste many quotes, upload or drop files, or load the collection
  (everything or one file); pick a style family, choose a range (e.g. quotes
  1–200), preview every item, then **Render → ZIP**.
- **Library**: saved quotes (search, tag and format filters, open in the
  studio, edit tags, export as text) and **History** of every export, any of
  which can be reopened.

On a phone the views stack and Shuffle / New image / Export stay in a bar at
the bottom of the screen.

## Batch mode

Paste quotes in any of three styles (they can be mixed):

```
Silence is not empty.                     ← plain: quotes separated by blank lines;
                                            a last line "— Name" is the author
Most people do not want the truth.
— Fred M

Comfort is a loan.                        ← "---" groups: hook / body… / punchline
It feels free when you take it.
You repay it in time.
---
@list                                     ← @format blocks for any of the 20 formats
title: Things I stopped doing
- Explaining myself twice
- Keeping score
- Arguing with weather
tags: self
```

`key: value` sets a field, lines without a key continue the previous field
(verse keeps its line breaks), `- item` adds list items, `tags:` feeds the
library, and `//` starts a comment.

For long files of one format, add `+` to the header. Every blank-line
separated chunk after it is one quote, and a chunk that is only a `tags:`
line sets the tags for all the quotes after it. `---` or another header ends
the section.

```
@qa+
tags: love

question: Does love last forever?
answer: As long as someone keeps choosing it.

question: Is it enough?
answer: Never on its own.

tags: death

question: What do the dead want?
answer: Nothing. That is the point.
```

### Importing files

**Batch → Upload files** (or drag files onto the text box) and **Library →
Import from files…** accept several files at once:

| File | Read as |
| --- | --- |
| `.txt`, `.md` | batch syntax (all of the above) |
| `.json` | an array of quotes, or `{ "quotes": [...] }`. Each item has `format` (default: the current format), the format's fields (`text`, `hook`, `items`…) and optional `tags` (array or comma list). A string item is a quote in the default format |
| `.csv` | header row of field names: `format`, any field keys, `tags` (split on `,` or `;`), list items split on `|`. A single `quote` column is read as `text` |

Lines with problems are reported with their line number and skipped; the
rest import. Library imports are keyed by content, so importing a file twice
never duplicates.

**Style families** (Ink, Paper, Fog, Midnight, Sandstone, Graphite, Deep Teal,
Oxblood, Bone, Pure Mono, or your current design) give every quote one
palette, pairing and ground, in a layout chosen per format that obeys the
design rules. For example, equations always get a monospace face. The
output is one ZIP with clean, ordered file names
(`007_classic_most-people-dont-want-the-truth.png`; carousels add
`_01of04`), a `manifest.json`, and splits of 60 images per ZIP for very large
batches. Rendering can be cancelled; whatever finished is still downloaded.

## The quote collection

`public/quotes/` holds **4,454 original quotes** on reality, life, death,
love, relationships, family, time, work, grief, aging and more, written cold
and unsentimental, every one tagged, in batch syntax:

- `cold-quotes.txt`: a 441-quote sampler covering all 20 formats
- `formats/<format>.txt`: 200 or more quotes for each format (`@format+` syntax)
- `index.json`: the file list with counts, used by the app

| File | Quotes |
| --- | ---: |
| `cold-quotes.txt` (Sampler (every format)) | 441 |
| `formats/classic.txt` (Classic) | 200 |
| `formats/hbp.txt` (Hook / Body / Punchline) | 200 |
| `formats/carousel.txt` (Carousel) | 200 |
| `formats/one-liner.txt` (One-liner) | 200 |
| `formats/highlight.txt` (Highlight) | 200 |
| `formats/contrast.txt` (Contrast) | 200 |
| `formats/myth-truth.txt` (Myth vs Truth) | 200 |
| `formats/then-now.txt` (Then / Now) | 200 |
| `formats/paradox.txt` (Paradox) | 200 |
| `formats/list.txt` (List) | 201 |
| `formats/qa.txt` (Question + Answer) | 201 |
| `formats/definition.txt` (Definition) | 205 |
| `formats/equation.txt` (Equation) | 202 |
| `formats/stat.txt` (Stat) | 201 |
| `formats/law.txt` (Law) | 200 |
| `formats/dialogue.txt` (Dialogue) | 202 |
| `formats/stanza.txt` (Stanza) | 200 |
| `formats/field-note.txt` (Field Note) | 201 |
| `formats/post-card.txt` (Post Card) | 200 |
| `formats/pull-quote.txt` (Pull Quote) | 200 |
| **Total** | **4,454** |

In the app: **Batch → Collection → Load** (everything, or one file) or
**Library → Import collection**. Importing twice never duplicates; quotes are
keyed by their content. Tests check that every file parses, holds only its
format, is tagged, has no duplicates across files and matches `index.json`,
and `scripts/check-quotes.ts` checks that every quote sets without overflow.

## Templates and the gallery

**Hand-tuned heroes** (60) live in `templates/<format>.json`. **The gallery**
(485 designs) is generated into `templates/gallery.json` by
`npm run templates`:

1. Every combination of format × layout × type pairing × palette ×
   background is enumerated: 168,000 in all.
2. Combinations that break a design rule are rejected, which leaves about
   83,000. The rules (`lib/templates/generator.ts`, unit-tested):
   - monospace pairings only for equations, field notes and posts;
     equations always monospace
   - never more than two font families
   - delicate display serifs never on busy photos without a scrim
   - photographs only for formats they support, never behind layouts
     that paint their own page (panels, notebook, typewriter) or that
     already divide the canvas
   - all-capital display faces never for long text
   - vignettes only on dark palettes, paper only on light ones,
     duotone never in pure black-and-white
   - frosted glass only over photos; Swiss grid only with a grotesk
3. The rest are scored for fit (pairing × format, palette × ground,
   layout × ground) and picked greedily for variety: repeats of a palette,
   pairing or layout cost points, both within a format and across the
   whole gallery. Photographs are capped at 40% per format.
4. Every pick is rendered at every export size with its sample text and a
   long stress text. It is kept only if nothing overflows, collides or
   fails contrast, and if the sample sets comfortably (no fallback, main
   text above its minimum size) on Instagram portrait, Stories and square.
   Each kept template records the sizes where it is comfortable, and the
   gallery can hide the rest.

**Layout archetypes** (25): centred, editorial, bottom-anchored, top-anchored,
split screen (photo/text), framed card, frosted glass panel, oversized
single word, Swiss grid poster, minimal corner, vertical strip, pull quote,
stacked hook/body/punchline, margin rule, numbered list, ruled list,
dictionary entry, equation block, ledger, stat hero, placard, script,
notebook page, typewriter sheet and post card.

**The gallery view** shows every design for the current format, rendered with
*your* text: filter by layout, mood, palette and photo/no photo, show only
favourites or your own templates, shuffle the order, or press
**Surprise me**. That picks a well-scoring design suited to the quote's
length and the current size. **Locks** (type, palette, background) keep
those choices while **R** shuffles. **Save as mine** stores the current
design in IndexedDB; **Copy JSON** gives you its config to edit or commit
to `templates/`.

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
  formats/             the 20 formats: registry (fields, layouts, samples) and composers
  stack.ts             joint auto-fit of stacked text blocks + drawing
  signature.ts         6 signature styles, adaptive ink
  pixels.ts            dithered gradients, scrims, paper, luminance sampling
  background.ts photo.ts palettes.ts pairings.ts presets.ts
  browser.ts           browser env + font loading
lib/images/            photo sourcing: providers, fallback chain, resolution rules,
                       keyword engine, calm-area scoring, browser client
app/api/images/        search, file proxy, Unsplash download ping, mock photos
templates/*.json       template configs, one file per format (duplicate and tweak freely),
                       plus the generated gallery.json
public/quotes/         the quote collection: sampler, formats/*.txt, index.json
scripts/               qa.ts (+ qa-worker.ts), generate-templates.ts (+ verify-worker.ts),
                       check-quotes.ts, render-sample.ts, render-formats.ts,
                       mock-photos.ts, fetch-fonts.ts, node-env.ts
tests/                 vitest unit tests
lib/templates/         template generator and combination rules
lib/studio/            browser-side logic: batch parser, gallery, IndexedDB
                       (library, history, favourites, own templates), export
components/            Studio (three panels), Gallery, Batch, Library, ThumbCanvas
```

## Deploying to Vercel

1. Push the repo to GitHub and import it at vercel.com/new (framework: Next.js).
2. Add `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY` and `PIXABAY_API_KEY` under
   Project → Settings → Environment Variables.
3. Deploy. No other configuration is needed. Fonts ship with the repo.

## Fonts

All fonts are from Google Fonts under the SIL Open Font License, committed as
static TTF instances in `assets/fonts/`.
