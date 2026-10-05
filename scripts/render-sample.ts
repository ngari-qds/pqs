/**
 * Renders sample exports with the exact production render function and
 * writes them to samples/. Includes a 400% crop to inspect edge quality.
 *   npm run sample
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { renderQuote, type RenderInput, type TemplateConfig } from "../lib/render";
import { getPreset } from "../lib/render/presets";
import { newCanvas, nodeEnv } from "./node-env";
import templates from "../templates/classic.json";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ensureMockPhotos } from "./mock-photos";

const out = path.resolve(import.meta.dirname, "../samples");
const env = nodeEnv();
const QUOTE = "Most people don't want the truth. They want a *quieter* version of it they can live next to.";

async function render(name: string, presetId: string, scale: number, input: RenderInput) {
  const p = getPreset(presetId);
  const { canvas, ctx } = newCanvas(p.width * scale, p.height * scale);
  const report = renderQuote(ctx, env, input);
  const file = path.join(out, `${name}.png`);
  await writeFile(file, canvas.toBuffer("image/png"));
  console.log(`${name}.png  ${canvas.width}×${canvas.height}  ${report.ms.toFixed(0)}ms  contrast ${report.blocks.map((b) => b.contrast.toFixed(1)).join("/")}  ${report.collisions.join("; ") || "no collisions"}${report.overflow ? "  OVERFLOW" : ""}`);
  return { canvas, report };
}

async function main() {
  await mkdir(out, { recursive: true });
  const tpl = templates as TemplateConfig[];
  const styles = ["line", "stacked", "caps", "rule", "monogram", "vertical"] as const;

  // Hero: WhatsApp status at 3x (3240×5760).
  const hero = await render("01-status-3x", "status", 3, {
    content: { format: "classic", text: QUOTE },
    template: tpl[0],
    signature: { enabled: true, style: "line" },
  });

  // 400% crop of the hero around the first line of text.
  const b = hero.report.blocks[0].rect;
  const cw = 360, ch = 200;
  const crop = createCanvas(cw * 4, ch * 4);
  const cctx = crop.getContext("2d");
  cctx.imageSmoothingEnabled = false; // nearest-neighbour: shows the real pixels
  cctx.drawImage(hero.canvas, b.x + b.w / 2 - cw / 2, b.y - 30, cw, ch, 0, 0, cw * 4, ch * 4);
  await writeFile(path.join(out, "02-status-3x-crop-400pct.png"), crop.toBuffer("image/png"));
  console.log("02-status-3x-crop-400pct.png");

  // Every hero template at Instagram portrait 2x, cycling signature styles.
  for (const [i, t] of tpl.entries()) {
    await render(`1${i}-${t.id}`, "ig-portrait", 2, {
      content: { format: "classic", text: i % 3 === 2 ? "Stone keeps time better than men do." : QUOTE, author: i % 2 ? "Fred M" : undefined },
      template: t,
      signature: { enabled: true, style: styles[i % styles.length] },
    });
  }
  // Photo treatments (generated test photos stand in for API results).
  await ensureMockPhotos();
  const mock = path.resolve(import.meta.dirname, "../.mock-photos");
  const photoOf = async (file: string) => ({ image: await loadImage(path.join(mock, file)), credit: { name: "Test Photographer", source: "Test" } });
  const photoTemplates = tpl.filter((t) => t.background.kind.startsWith("photo"));
  const files = ["sea-horizon.jpg", "fog-field.jpg", "sea-horizon.jpg", "desert-dunes.jpg", "dark-forest.jpg", "concrete-stairs.jpg"];
  const photoHero = await render("30-photo-status-3x", "status", 3, {
    content: { format: "classic", text: "The ocean is honest about its size. Most people are not." },
    template: photoTemplates[0],
    signature: { enabled: true, style: "line" },
    photo: await photoOf("sea-horizon.jpg"),
    showCredit: true,
  });
  const pc = createCanvas(360 * 4, 200 * 4);
  const pctx = pc.getContext("2d");
  pctx.imageSmoothingEnabled = false;
  pctx.drawImage(photoHero.canvas, photoHero.canvas.width * 0.55, photoHero.canvas.height * 0.52, 360, 200, 0, 0, 360 * 4, 200 * 4);
  await writeFile(path.join(out, "31-photo-status-3x-crop-400pct.png"), pc.toBuffer("image/png"));
  console.log("31-photo-status-3x-crop-400pct.png");
  for (const [i, t] of photoTemplates.entries()) {
    await render(`4${i}-${t.id}`, "ig-portrait", 2, {
      content: { format: "classic", text: QUOTE, author: i % 2 ? "Fred M" : undefined },
      template: t,
      signature: { enabled: true, style: styles[(i + 1) % styles.length] },
      photo: await photoOf(files[i % files.length]),
    });
  }

  // Wide format sanity check.
  await render("20-x-wide", "x", 2, { content: { format: "classic", text: QUOTE }, template: tpl[3], signature: { enabled: true, style: "stacked" } });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
