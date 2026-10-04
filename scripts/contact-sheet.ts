/** Builds a contact sheet of PNGs: tsx scripts/contact-sheet.ts out.png a.png b.png ... */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { writeFile } from "node:fs/promises";

const [out, ...files] = process.argv.slice(2);
const cols = Math.min(3, files.length), cellW = 600;
const imgs = await Promise.all(files.map((f) => loadImage(f)));
const cellH = Math.max(...imgs.map((i) => (i.height / i.width) * cellW));
const rows = Math.ceil(files.length / cols);
const c = createCanvas(cols * (cellW + 16) + 16, rows * (cellH + 16) + 16);
const ctx = c.getContext("2d");
ctx.fillStyle = "#7a7a7a";
ctx.fillRect(0, 0, c.width, c.height);
ctx.imageSmoothingQuality = "high";
imgs.forEach((im, i) => ctx.drawImage(im, 16 + (i % cols) * (cellW + 16), 16 + Math.floor(i / cols) * (cellH + 16), cellW, (im.height / im.width) * cellW));
await writeFile(out, c.toBuffer("image/png"));
