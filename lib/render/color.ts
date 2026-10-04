/** Colour utilities: parsing, WCAG luminance/contrast, OKLab mixing. */

export type RGB = [number, number, number]; // 0..255

export function hexToRgb(hex: string): RGB {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

const srgbToLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const linearToSrgb = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return c * 255;
};

/** Lookup table: 8-bit sRGB channel -> linear light. */
export const LINEAR_LUT = new Float32Array(256).map((_, i) => srgbToLinear(i));

/** WCAG 2.x relative luminance (0..1). */
export function luminance(rgb: RGB | string): number {
  const [r, g, b] = typeof rgb === "string" ? hexToRgb(rgb) : rgb;
  return 0.2126 * LINEAR_LUT[r | 0] + 0.7152 * LINEAR_LUT[g | 0] + 0.0722 * LINEAR_LUT[b | 0];
}

export function contrastFromLuminance(a: number, b: number): number {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

export function contrastRatio(a: RGB | string, b: RGB | string): number {
  return contrastFromLuminance(luminance(a), luminance(b));
}

/** Alpha-composite `fg` at `alpha` over `bg`, in sRGB space (what canvas does). */
export function blend(fg: RGB | string, bg: RGB | string, alpha: number): RGB {
  const f = typeof fg === "string" ? hexToRgb(fg) : fg;
  const b = typeof bg === "string" ? hexToRgb(bg) : bg;
  return [0, 1, 2].map((i) => f[i] * alpha + b[i] * (1 - alpha)) as RGB;
}

// --- OKLab (perceptual interpolation for gradients) ---
export type Lab = [number, number, number];

export function rgbToOklab(rgb: RGB): Lab {
  const r = LINEAR_LUT[rgb[0] | 0], g = LINEAR_LUT[rgb[1] | 0], b = LINEAR_LUT[rgb[2] | 0];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Returns float sRGB 0..255 (unrounded, so callers can dither before quantising). */
export function oklabToRgbFloat([L, a, b]: Lab): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const clamp = (v: number) => Math.max(0, Math.min(255, linearToSrgb(Math.max(0, v))));
  return [clamp(r), clamp(g), clamp(bl)];
}

export function mixOklab(a: string | RGB, b: string | RGB, t: number): RGB {
  const A = rgbToOklab(typeof a === "string" ? hexToRgb(a) : a);
  const B = rgbToOklab(typeof b === "string" ? hexToRgb(b) : b);
  return oklabToRgbFloat([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

export const rgba = (c: string | RGB, a: number) => {
  const [r, g, b] = typeof c === "string" ? hexToRgb(c) : c;
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
};
