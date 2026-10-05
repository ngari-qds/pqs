/**
 * Generates large procedural test photographs into .mock-photos/ for the mock
 * image provider (PQS_MOCK_PHOTOS=1) and for QA of photo templates. They are
 * deliberately varied: calm skies, busy textures, light and dark scenes, and
 * one photo that is too small, to exercise the rejection rule.
 *   npm run mock:photos
 */
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { mulberry32 } from "../lib/render/random";

const dir = path.resolve(import.meta.dirname, "../.mock-photos");

interface Spec {
  file: string;
  w: number;
  h: number;
  tags: string[];
  author: string;
  draw: (ctx: SKRSContext2D, w: number, h: number, rnd: () => number) => void;
}

const vgrad = (ctx: SKRSContext2D, h: number, stops: [number, string][]) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [a, c] of stops) g.addColorStop(a, c);
  return g;
};

/** Film-like grain from a small noise tile, so 50 MP images stay fast to make. */
function grain(ctx: SKRSContext2D, w: number, h: number, rnd: () => number, alpha: number) {
  const T = 512;
  const tile = createCanvas(T, T);
  const t = tile.getContext("2d");
  const img = t.createImageData(T, T);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rnd() + rnd() - 1) * 90;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  t.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = ctx.createPattern(tile, "repeat")!;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function hills(ctx: SKRSContext2D, w: number, h: number, rnd: () => number, base: number, amp: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  const f1 = 1 + rnd() * 2, f2 = 3 + rnd() * 3, p = rnd() * 6;
  for (let x = 0; x <= w; x += w / 200) {
    const t = x / w;
    ctx.lineTo(x, base + Math.sin(t * Math.PI * f1 + p) * amp + Math.sin(t * Math.PI * f2) * amp * 0.35);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

const SPECS: Spec[] = [
  {
    file: "fog-field.jpg", w: 6600, h: 8400, tags: ["fog", "mist", "field", "minimal", "hills", "morning", "lake"], author: "Test Photographer A",
    draw: (ctx, w, h, rnd) => {
      ctx.fillStyle = vgrad(ctx, h, [[0, "#c9ced3"], [0.6, "#dfe2e4"], [1, "#b9bfc2"]]);
      ctx.fillRect(0, 0, w, h);
      hills(ctx, w, h, rnd, h * 0.72, h * 0.03, "rgba(150,158,163,0.55)");
      hills(ctx, w, h, rnd, h * 0.8, h * 0.025, "rgba(110,118,122,0.7)");
      grain(ctx, w, h, rnd, 0.08);
    },
  },
  {
    file: "night-city.jpg", w: 6600, h: 8400, tags: ["city", "night", "street", "lights", "rooftops", "dark"], author: "Test Photographer B",
    draw: (ctx, w, h, rnd) => {
      ctx.fillStyle = vgrad(ctx, h, [[0, "#070b14"], [0.55, "#16203a"], [1, "#0c0f17"]]);
      ctx.fillRect(0, 0, w, h);
      let x = 0;
      while (x < w) {
        const bw = w * (0.05 + rnd() * 0.1), bh = h * (0.2 + rnd() * 0.35);
        ctx.fillStyle = `rgb(${12 + rnd() * 12},${14 + rnd() * 12},${22 + rnd() * 14})`;
        ctx.fillRect(x, h - bh, bw, bh);
        for (let wy = h - bh + h * 0.01; wy < h - h * 0.01; wy += h * 0.012)
          for (let wx = x + bw * 0.08; wx < x + bw * 0.9; wx += bw * 0.12)
            if (rnd() < 0.32) {
              ctx.fillStyle = rnd() < 0.7 ? "rgba(255,214,150,0.9)" : "rgba(210,225,255,0.85)";
              ctx.fillRect(wx, wy, bw * 0.06, h * 0.006);
            }
        x += bw + w * 0.004;
      }
      grain(ctx, w, h, rnd, 0.1);
    },
  },
  {
    file: "sea-horizon.jpg", w: 9000, h: 6000, tags: ["ocean", "sea", "water", "horizon", "coast", "calm", "still"], author: "Test Photographer C",
    draw: (ctx, w, h, rnd) => {
      ctx.fillStyle = vgrad(ctx, h, [[0, "#8fa3b3"], [0.48, "#d3dbe0"], [0.5, "#5e7383"], [1, "#2f3f4b"]]);
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.18;
      for (let i = 0; i < 1400; i++) {
        const y = h * (0.5 + Math.pow(rnd(), 1.6) * 0.5);
        ctx.fillStyle = rnd() < 0.5 ? "#dfe8ee" : "#1b2730";
        ctx.fillRect(rnd() * w, y, w * (0.01 + rnd() * 0.05) * (y / h), h * 0.0015 * (y / h) * 3);
      }
      ctx.globalAlpha = 1;
      grain(ctx, w, h, rnd, 0.07);
    },
  },
  {
    file: "stone-wall.jpg", w: 6600, h: 8400, tags: ["stone", "texture", "wall", "granite", "rock", "marble", "weathered"], author: "Test Photographer D",
    draw: (ctx, w, h, rnd) => {
      ctx.fillStyle = "#8b857c";
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += h * 0.05) {
        let x = -rnd() * w * 0.1;
        while (x < w) {
          const bw = w * (0.12 + rnd() * 0.15);
          const v = 95 + rnd() * 90;
          ctx.fillStyle = `rgb(${v},${v * 0.96},${v * 0.9})`;
          ctx.fillRect(x + w * 0.004, y + h * 0.003, bw - w * 0.008, h * 0.044);
          x += bw;
        }
      }
      grain(ctx, w, h, rnd, 0.35);
    },
  },
  {
    file: "desert-dunes.jpg", w: 6600, h: 8400, tags: ["desert", "dunes", "sand", "horizon", "dry", "salt"], author: "Test Photographer E",
    draw: (ctx, w, h, rnd) => {
      ctx.fillStyle = vgrad(ctx, h, [[0, "#d9c7ae"], [0.55, "#efe2cf"], [1, "#c59a6c"]]);
      ctx.fillRect(0, 0, w, h);
      hills(ctx, w, h, rnd, h * 0.62, h * 0.04, "#d6ae80");
      hills(ctx, w, h, rnd, h * 0.74, h * 0.05, "#b98653");
      hills(ctx, w, h, rnd, h * 0.86, h * 0.04, "#9c6a3d");
      grain(ctx, w, h, rnd, 0.1);
    },
  },
  {
    file: "concrete-stairs.jpg", w: 6600, h: 8400, tags: ["architecture", "concrete", "stairs", "staircase", "brutalist", "shadow", "wall", "building"], author: "Test Photographer F",
    draw: (ctx, w, h, rnd) => {
      ctx.fillStyle = "#c8c5bf";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(60,58,55,0.55)";
      ctx.beginPath();
      ctx.moveTo(w * 0.35, 0);
      ctx.lineTo(w, h * 0.55);
      ctx.lineTo(w, 0);
      ctx.fill();
      for (let i = 0; i < 14; i++) {
        const y = h * 0.58 + i * h * 0.03;
        ctx.fillStyle = i % 2 ? "#9f9b94" : "#b8b4ad";
        ctx.fillRect(w * 0.1 + i * w * 0.02, y, w * 0.9, h * 0.03);
      }
      grain(ctx, w, h, rnd, 0.12);
    },
  },
  {
    file: "dark-forest.jpg", w: 6600, h: 8400, tags: ["forest", "trees", "pine", "woods", "dark", "path"], author: "Test Photographer G",
    draw: (ctx, w, h, rnd) => {
      ctx.fillStyle = vgrad(ctx, h, [[0, "#3b4a44"], [0.5, "#5b6b63"], [1, "#1c2420"]]);
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const tw = w * (0.006 + rnd() * 0.03);
        ctx.fillStyle = `rgba(${15 + rnd() * 20},${20 + rnd() * 20},${18 + rnd() * 15},${0.5 + rnd() * 0.5})`;
        ctx.fillRect(rnd() * w, 0, tw, h);
      }
      grain(ctx, w, h, rnd, 0.12);
    },
  },
  {
    file: "small-fog.jpg", w: 1600, h: 1200, tags: ["fog", "mist", "minimal", "sea", "city", "stone", "forest", "desert"], author: "Test Photographer H",
    draw: (ctx, w, h, rnd) => {
      ctx.fillStyle = vgrad(ctx, h, [[0, "#d0d4d8"], [1, "#9aa2a8"]]);
      ctx.fillRect(0, 0, w, h);
      grain(ctx, w, h, rnd, 0.1);
    },
  },
];

async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function ensureMockPhotos(force = false) {
  await mkdir(dir, { recursive: true });
  const manifest = [];
  for (const [i, s] of SPECS.entries()) {
    const thumb = s.file.replace(".jpg", "-thumb.jpg");
    if (force || !(await exists(path.join(dir, s.file)))) {
      const c = createCanvas(s.w, s.h);
      s.draw(c.getContext("2d"), s.w, s.h, mulberry32(1000 + i));
      await writeFile(path.join(dir, s.file), await c.encode("jpeg", 90));
      const tw = 480, th = Math.round((s.h / s.w) * tw);
      const t = createCanvas(tw, th);
      const tctx = t.getContext("2d");
      tctx.imageSmoothingQuality = "high";
      tctx.drawImage(c, 0, 0, tw, th);
      await writeFile(path.join(dir, thumb), await t.encode("jpeg", 85));
      console.log(`  ${s.file}  ${s.w}×${s.h}`);
    }
    manifest.push({ file: s.file, thumb, width: s.w, height: s.h, tags: s.tags, author: s.author });
  }
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  ensureMockPhotos(process.argv.includes("--force")).then(() => console.log(`Mock photos ready in ${dir}`));
}
