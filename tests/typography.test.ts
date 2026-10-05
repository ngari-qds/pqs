import { describe, expect, it } from "vitest";
import { breakLines, raggedness, type Token } from "@/lib/render/typography/linebreak";
import { autofit, layoutAtSize, type FitParams } from "@/lib/render/typography/autofit";
import { smartQuotes, mathSymbols } from "@/lib/render/typography/smart";
import { tokenize } from "@/lib/render/typography/tokens";

// Fake monospace metrics: every glyph is 0.5em wide.
const CW = 0.5;
const toks = (s: string): Token[][] => tokenize(s).map((p) => p.map((t) => ({ ...t, width: t.text.length * CW })));
const text = (lines: { tokens: Token[] }[]) => lines.map((l) => l.tokens.map((t) => t.text).join(" "));

describe("breakLines", () => {
  it("never exceeds the max width", () => {
    const p = toks("Most people do not want the truth. They want reassurance that sounds like the truth.");
    const lines = breakLines(p, CW, 12, { balance: false })!;
    for (const l of lines) expect(l.width).toBeLessThanOrEqual(12 + 1e-9);
  });

  it("returns null when a single word cannot fit", () => {
    expect(breakLines(toks("incomprehensibilities"), CW, 5)).toBeNull();
  });

  it("avoids a single-word last line", () => {
    const p = toks("The city does not care about your plans, and that is a gift");
    for (const w of [8, 10, 12, 14, 16]) {
      const lines = breakLines(p, CW, w, { balance: true })!;
      expect(lines[lines.length - 1].tokens.length).toBeGreaterThan(1);
    }
  });

  it("balancing keeps the line count and reduces raggedness", () => {
    const p = toks("Comfort is a slow negotiation with regret, signed one quiet evening at a time.");
    const greedy = breakLines(p, CW, 22, { balance: false })!;
    const balanced = breakLines(p, CW, 22, { balance: true })!;
    expect(balanced.length).toBe(greedy.length);
    expect(raggedness(balanced)).toBeLessThanOrEqual(raggedness(greedy) + 1e-9);
  });

  it("preserves hard line breaks", () => {
    const lines = breakLines(toks("Stone keeps time\nbetter than men"), CW, 40)!;
    expect(text(lines)).toEqual(["Stone keeps time", "better than men"]);
  });

  it("carries emphasis flags through", () => {
    const lines = breakLines(toks("Silence is *not* empty"), CW, 40)!;
    expect(lines[0].tokens.map((t) => !!t.em)).toEqual([false, false, true, false]);
  });
});

const params = (s: string, over: Partial<FitParams> = {}): FitParams => ({
  paragraphs: toks(s),
  space: CW,
  maxWidthPx: 800,
  maxHeightPx: 1000,
  minSize: 20,
  maxSize: 200,
  avgCharWidth: CW,
  capHeight: 0.7,
  descent: 0.25,
  lineHeight: () => 1.2,
  balance: true,
  ...over,
});

describe("autofit", () => {
  it("finds the largest size that fits (and size + 1 does not)", () => {
    const p = params("Most people never leave. They just stop arriving.", { maxLines: 3 });
    const r = autofit(p);
    expect(r.fits).toBe(true);
    expect(r.lines.length).toBeLessThanOrEqual(3);
    expect(r.height).toBeLessThanOrEqual(1000);
    expect(layoutAtSize(p, r.size + 1).fits).toBe(false);
  });

  it("respects max size for very short text", () => {
    const r = autofit(params("Wait.", { maxSize: 120 }));
    expect(r.size).toBe(120);
  });

  it("shrinks long text to stay inside the box", () => {
    const long = "The ocean is honest about its size. ".repeat(12);
    const r = autofit(params(long, { maxHeightPx: 600 }));
    expect(r.fits).toBe(true);
    expect(r.height).toBeLessThanOrEqual(600);
  });

  it("enforces the character measure", () => {
    const r = autofit(params("Every room you leave keeps a version of you that never learned how to go.", { maxCharsPerLine: 32 }));
    for (const l of r.lines) expect(l.width * r.size).toBeLessThanOrEqual(32 * CW * r.size + 1e-6);
  });

  it("reports failure instead of overflowing when nothing fits", () => {
    const r = autofit(params("word ".repeat(400), { maxHeightPx: 100 }));
    expect(r.fits).toBe(false);
  });
});

describe("smart typography", () => {
  it("curls quotes and apostrophes", () => {
    expect(smartQuotes(`"It's late," she said. 'Fine.'`)).toBe("“It’s late,” she said. ‘Fine.’");
  });
  it("makes ellipses and dashes", () => {
    expect(smartQuotes("Wait... no -- never")).toBe("Wait… no — never");
  });
  it("uses true math symbols", () => {
    expect(mathSymbols("Comfort x Time = Regret")).toBe("Comfort × Time = Regret");
    expect(mathSymbols("Effort - Ego = Progress")).toBe("Effort − Ego = Progress");
  });
});

describe("measure rules", () => {
  it("accepts two short lines when one line would exceed the maximum measure", () => {
    // 57 characters, max 55 per line: two lines averaging 28.5 < 30 must still fit.
    const p = params("She found closure the day she stopped checking her phone.", { minCharsPerLine: 30, maxCharsPerLine: 55 });
    const r = autofit(p);
    expect(r.fits).toBe(true);
    expect(r.lines.length).toBe(2);
  });
});
