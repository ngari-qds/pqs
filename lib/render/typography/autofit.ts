/**
 * Auto-fit: binary-search the largest font size whose balanced line breaks
 * fit the box, respect the line-count limit and the target measure.
 */
import { breakLines, type Line, type Token } from "./linebreak";

export interface FitParams {
  paragraphs: Token[][];
  /** Space advance at 1px. */
  space: number;
  maxWidthPx: number;
  maxHeightPx: number;
  minSize: number;
  maxSize: number;
  maxLines?: number;
  /** Measure targets in characters; the measure is capped at maxChars * avgCharWidth. */
  minCharsPerLine?: number;
  maxCharsPerLine?: number;
  /** Average glyph advance at 1px (used to translate char targets to widths). */
  avgCharWidth: number;
  /** Cap height and descent at 1px, for trimmed block height. */
  capHeight: number;
  descent: number;
  /** Line height multiplier as a function of size in px. */
  lineHeight: (sizePx: number) => number;
  balance?: boolean;
  /** Paragraph gap in lines (blank lines between stanzas count fully). */
}

export interface FitResult {
  size: number;
  lines: Line[];
  lineHeight: number;
  /** Trimmed height: cap-top of first line to descender of last line. */
  height: number;
  fits: boolean;
  reason?: string;
}

const charCount = (l: Line) => l.tokens.reduce((n, t) => n + t.text.length, 0) + Math.max(0, l.tokens.length - 1);

export function blockHeight(lineCount: number, size: number, lh: number, capHeight: number, descent: number) {
  if (lineCount === 0) return 0;
  return capHeight * size + (lineCount - 1) * lh * size + descent * size;
}

export function layoutAtSize(p: FitParams, size: number): FitResult {
  const lh = p.lineHeight(size);
  let measurePx = p.maxWidthPx;
  if (p.maxCharsPerLine) measurePx = Math.min(measurePx, p.maxCharsPerLine * p.avgCharWidth * size);
  const lines = breakLines(p.paragraphs, p.space, measurePx / size, { balance: p.balance ?? true });
  if (!lines) return { size, lines: [], lineHeight: lh, height: Infinity, fits: false, reason: "word-too-wide" };
  const height = blockHeight(lines.length, size, lh, p.capHeight, p.descent);
  let reason: string | undefined;
  if (p.maxLines && lines.length > p.maxLines) reason = "too-many-lines";
  else if (height > p.maxHeightPx + 0.01) reason = "too-tall";
  else if (p.minCharsPerLine && lines.length > 1) {
    const nonEmpty = lines.filter((l) => l.tokens.length);
    const avg = nonEmpty.reduce((n, l) => n + charCount(l), 0) / Math.max(1, nonEmpty.length);
    const multiWordParas = p.paragraphs.some((para) => para.length > 1);
    if (multiWordParas && avg < p.minCharsPerLine) reason = "measure-too-short";
  }
  return { size, lines, lineHeight: lh, height, fits: !reason, reason };
}

export function autofit(p: FitParams): FitResult {
  let lo = p.minSize;
  let hi = p.maxSize;
  const top = layoutAtSize(p, hi);
  if (top.fits) return top;
  let best = layoutAtSize(p, lo);
  if (!best.fits) {
    // The measure rule must never cause an overflow: relax it at the minimum size.
    const relaxed = layoutAtSize({ ...p, minCharsPerLine: undefined }, lo);
    return relaxed;
  }
  for (let i = 0; i < 22 && hi - lo > 0.25; i++) {
    const mid = (lo + hi) / 2;
    const r = layoutAtSize(p, mid);
    if (r.fits) {
      best = r;
      lo = mid;
    } else hi = mid;
  }
  return best;
}
