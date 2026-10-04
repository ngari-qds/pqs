/** Small deterministic PRNG so dither and grain are reproducible per seed. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Precomputed triangular-PDF dither table in [-amp, amp]. Triangular noise
 * decorrelates quantisation error from the signal, which is what removes
 * visible gradient bands; amplitude ~1/255 keeps it invisible.
 */
export function ditherTable(seed: number, size = 65536, amp = 1): Float32Array {
  const rnd = mulberry32(seed);
  const t = new Float32Array(size);
  for (let i = 0; i < size; i++) t[i] = (rnd() + rnd() - 1) * amp;
  return t;
}
