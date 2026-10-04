"use client";
/**
 * Browser rendering environment. Fonts are self-hosted through next/font and
 * explicitly loaded before every render: the renderer never draws with a
 * fallback face.
 */
import { NEXT_FONTS } from "../fonts/next-fonts";
import { pairingFaces, type Pairing } from "./pairings";
import type { CanvasLike, FaceRef, RenderEnv } from "./types";

export function familyCss(family: string): string {
  const f = NEXT_FONTS[family as keyof typeof NEXT_FONTS];
  if (!f) throw new Error(`Font not registered: ${family}`);
  return f.style.fontFamily;
}

export const browserEnv: RenderEnv = {
  createCanvas: (w, h) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c as unknown as CanvasLike;
  },
  fontFamily: familyCss,
};

const loaded = new Set<string>();

/** Loads every face (and the signature's label weights) and verifies each one. */
export async function ensureFonts(faces: FaceRef[]): Promise<void> {
  const specs = faces.map((f) => `${f.style === "italic" ? "italic " : ""}${f.weight} 100px ${familyCss(f.family)}`);
  const todo = specs.filter((s) => !loaded.has(s));
  if (!todo.length) return;
  await Promise.all(todo.map((s) => document.fonts.load(s, "Aa“’")));
  await document.fonts.ready;
  const missing = todo.filter((s) => !document.fonts.check(s, "Aa"));
  if (missing.length) throw new Error(`Fonts failed to load: ${missing.join(", ")}`);
  todo.forEach((s) => loaded.add(s));
}

export function facesForRender(pairing: Pairing): FaceRef[] {
  const faces = pairingFaces(pairing);
  faces.push({ ...pairing.label, weight: Math.max(pairing.label.weight, 500) });
  return faces;
}

export async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), type, quality),
  );
}
