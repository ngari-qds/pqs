/**
 * Line breaking that minimises raggedness (a small Knuth–Plass style dynamic
 * program) with optional balancing, orphan control and hard breaks.
 *
 * All widths are normalised to a 1px font size, so a break computed for the
 * preview is identical to the break at export resolution.
 */

export interface Token {
  text: string;
  /** Advance width at 1px font size. */
  width: number;
  em?: boolean;
}

export interface Line {
  tokens: Token[];
  /** Width at 1px font size, including inter-word spaces. */
  width: number;
}

export interface BreakOptions {
  /** Equalise line lengths (display text). Body text uses "pretty" breaking. */
  balance?: boolean;
  /** Avoid a single short word alone on the last line. */
  avoidOrphans?: boolean;
}

const lineWidth = (tokens: Token[], from: number, to: number, space: number) => {
  let w = 0;
  for (let i = from; i < to; i++) w += tokens[i].width;
  return w + space * Math.max(0, to - from - 1);
};

/**
 * Optimal-fit breaking of one paragraph. Returns null when a single token is
 * wider than `maxWidth` (the caller should shrink the font).
 */
function breakParagraph(tokens: Token[], space: number, maxWidth: number, avoidOrphans: boolean): Line[] | null {
  const n = tokens.length;
  if (n === 0) return [{ tokens: [], width: 0 }];
  const cost = new Array<number>(n + 1).fill(Infinity);
  const prev = new Array<number>(n + 1).fill(-1);
  cost[0] = 0;
  const orphanPenalty = maxWidth * maxWidth * 8;
  for (let i = 0; i < n; i++) {
    if (cost[i] === Infinity) continue;
    let w = -space;
    for (let j = i + 1; j <= n; j++) {
      w += tokens[j - 1].width + space;
      if (w > maxWidth + 1e-9) break;
      const slack = maxWidth - w;
      let c = slack * slack;
      // Last line: allow it to be shorter, but strongly avoid a lone orphan word.
      if (j === n) {
        c *= 0.6;
        if (avoidOrphans && j - i === 1 && n >= 3) c += orphanPenalty;
      }
      // Avoid ending a line on a tiny function word ("a", "I", "of").
      if (j < n && tokens[j - 1].text.length <= 2 && /^[a-z]+$/i.test(tokens[j - 1].text)) c += slack * slack * 0.5 + maxWidth * maxWidth * 0.02;
      const total = cost[i] + c;
      if (total < cost[j]) {
        cost[j] = total;
        prev[j] = i;
      }
    }
  }
  if (cost[n] === Infinity) return null;
  const lines: Line[] = [];
  for (let j = n; j > 0; j = prev[j]) {
    const i = prev[j];
    lines.unshift({ tokens: tokens.slice(i, j), width: lineWidth(tokens, i, j, space) });
  }
  return lines;
}

/**
 * Breaks paragraphs (hard breaks preserved) into lines no wider than
 * `maxWidth`. Returns null if any token cannot fit at all.
 */
export function breakLines(paragraphs: Token[][], space: number, maxWidth: number, opts: BreakOptions = {}): Line[] | null {
  const { balance = false, avoidOrphans = true } = opts;
  const out: Line[] = [];
  for (const para of paragraphs) {
    let lines = breakParagraph(para, space, maxWidth, avoidOrphans);
    if (!lines) return null;
    if (balance && lines.length > 1) {
      // Find the narrowest measure that keeps the same number of lines.
      const target = lines.length;
      let lo = Math.max(...para.map((t) => t.width));
      let hi = maxWidth;
      let best = lines;
      for (let k = 0; k < 24 && hi - lo > 1e-4; k++) {
        const mid = (lo + hi) / 2;
        const trial = breakParagraph(para, space, mid, avoidOrphans);
        if (trial && trial.length <= target) {
          best = trial;
          hi = mid;
        } else lo = mid;
      }
      lines = best;
    }
    out.push(...lines);
  }
  return out;
}

/** Raggedness metric used by tests and QA: std-dev of line widths / max width. */
export function raggedness(lines: Line[]): number {
  if (lines.length < 2) return 0;
  const ws = lines.map((l) => l.width);
  const max = Math.max(...ws);
  const mean = ws.reduce((a, b) => a + b, 0) / ws.length;
  const sd = Math.sqrt(ws.reduce((a, b) => a + (b - mean) ** 2, 0) / ws.length);
  return sd / max;
}
