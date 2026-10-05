/**
 * Renders every format's sample in every layout (Instagram portrait, 1x)
 * into samples/formats/, plus one contact sheet per batch. For review.
 *   npx tsx scripts/render-formats.ts [palette] [pairing]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { renderQuote, type TemplateConfig } from "../lib/render";
import { FORMAT_LIST, slideCount } from "../lib/render/formats";
import { newCanvas, nodeEnv } from "./node-env";

const [palette = "paper-ink", pairing = "fraunces-inter"] = process.argv.slice(2);
const out = path.resolve(import.meta.dirname, "../samples/formats");
const env = nodeEnv();
const STYLES = ["line", "stacked", "caps", "rule", "monogram", "vertical"] as const;

async function main() {
  await mkdir(out, { recursive: true });
  const files: string[] = [];
  let i = 0;
  for (const f of FORMAT_LIST) {
    for (const l of f.layouts) {
      const n = slideCount(f.sample);
      for (let s = 0; s < (f.id === "carousel" ? n : 1); s++) {
        const { canvas, ctx } = newCanvas(1080, 1350);
        const t: TemplateConfig = { id: "x", name: "x", format: f.id, layout: l.id, pairing: f.id === "equation" ? "jetbrains" : pairing, palette, background: { kind: "solid" } };
        const r = renderQuote(ctx, env, { content: { ...f.sample, slide: s }, template: t, signature: { enabled: true, style: STYLES[i++ % 6] } });
        const name = `${f.id}_${l.id}${f.id === "carousel" ? `_${s + 1}of${n}` : ""}.png`;
        await writeFile(path.join(out, name), canvas.toBuffer("image/png"));
        files.push(name);
        const issues = [...r.collisions, ...(r.overflow ? ["OVERFLOW"] : []), ...r.blocks.filter((b) => b.contrast < 4.5).map((b) => `${b.id} ${b.contrast.toFixed(1)}`)];
        if (issues.length) console.log(`  ! ${name}: ${issues.join("; ")}`);
      }
    }
  }
  // Contact sheets of 12.
  for (let k = 0; k < files.length; k += 12) {
    const batch = files.slice(k, k + 12);
    const cw = 360, chh = 450, cols = 4;
    const sheet = createCanvas(cols * (cw + 12) + 12, Math.ceil(batch.length / cols) * (chh + 34) + 12);
    const sctx = sheet.getContext("2d");
    sctx.fillStyle = "#777";
    sctx.fillRect(0, 0, sheet.width, sheet.height);
    for (const [j, name] of batch.entries()) {
      const im = await loadImage(path.join(out, name));
      const x = 12 + (j % cols) * (cw + 12), y = 12 + Math.floor(j / cols) * (chh + 34);
      sctx.drawImage(im, x, y, cw, chh);
      sctx.fillStyle = "#fff";
      sctx.font = "16px sans-serif";
      sctx.fillText(name.replace(".png", ""), x, y + chh + 22);
    }
    await writeFile(path.join(out, `_sheet-${String(k / 12 + 1).padStart(2, "0")}.png`), sheet.toBuffer("image/png"));
  }
  console.log(`${files.length} renders, ${Math.ceil(files.length / 12)} sheets in samples/formats/`);
}
main();
