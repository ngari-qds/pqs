/**
 * Structured formats: List, Question + Answer, Definition, Equation, Stat,
 * Law and Dialogue.
 */
import type { Composition, LayoutContext } from "../compose";
import type { BlockSpec } from "../stack";
import { list, str, type QuoteContent } from "../template";
import { body, boldDisplay, display, gap, label, marker, math, mathFace, pad2, ruleAbove, sq } from "./common";

const center = (layout: string) => layout === "centered";

// --------------------------------------------------------------------- list

export const LIST_LAYOUTS = ["numbered", "ruled"] as const;

/** A title plus 3–7 items, numbered in the margin or separated by hairlines. */
export function composeList(lc: LayoutContext, c: QuoteContent, layout: string): Composition {
  const title = str(c, "title");
  const items = list(c, "items").slice(0, 7);
  const specs: BlockSpec[] = [];
  const itemGap = gap(lc, items.length > 5 ? 0.024 : 0.032);
  if (layout === "ruled") {
    if (title) specs.push(label(lc, "title", title, { color: lc.accent }));
    items.forEach((it, i) =>
      specs.push(
        display(lc, `item-${i}`, it, 0.06, {
          size: { ratio: 1, min: lc.ref * 0.03, max: lc.ref * 0.06 },
          measure: [10, 40],
          gapBefore: i === 0 ? gap(lc, 0.05) : itemGap * 2,
          ruleAbove: i === 0 ? undefined : ruleAbove(lc, 0.25, 1),
          hangPunctuation: false,
        }),
      ),
    );
  } else {
    if (title) specs.push(display(lc, "title", title, 0.085, { face: boldDisplay(lc) }));
    const numerals = items.map((_, i) => pad2(i + 1));
    items.forEach((it, i) =>
      specs.push(
        display(lc, `item-${i}`, it, 0.06, {
          size: { ratio: 0.72, min: lc.ref * 0.032, max: lc.ref * 0.066 },
          measure: [10, 40],
          gapBefore: i === 0 ? gap(lc, 0.06) : itemGap,
          hangPunctuation: false,
          marker: marker(lc, numerals[i], numerals, lc.pairing.label, { sizeEm: 0.56, color: lc.accent, trackingEm: 0.04 }),
        }),
      ),
    );
  }
  return { stacks: [{ specs, box: lc.box, valign: "optical" }] };
}

// ----------------------------------------------------------------------- qa

export const QA_LAYOUTS = ["margin", "stacked"] as const;

export function composeQa(lc: LayoutContext, c: QuoteContent, layout: string): Composition {
  const q = str(c, "question"), a = str(c, "answer");
  if (layout === "stacked") {
    return {
      stacks: [
        {
          specs: [
            label(lc, "label-q", "Question"),
            display(lc, "question", q, 0.08, { gapBefore: gap(lc, 0.028) }),
            label(lc, "label-a", "Answer", { gapBefore: gap(lc, 0.1), color: lc.accent, ruleAbove: ruleAbove(lc, 0.3, 1) }),
            display(lc, "answer", a, 0.08, { size: { ratio: 0.78, min: lc.ref * 0.03, max: lc.ref * 0.07 }, face: lc.pairing.displayEm, gapBefore: gap(lc, 0.028) }),
          ],
          box: lc.box,
          valign: "center",
        },
      ],
    };
  }
  // margin: "Q." and "A." hang in a margin column.
  const marks = ["Q.", "A."];
  return {
    stacks: [
      {
        specs: [
          display(lc, "question", q, 0.08, { hangPunctuation: false, marker: marker(lc, "Q.", marks, lc.pairing.displayEm, { color: lc.muted }) }),
          display(lc, "answer", a, 0.08, {
            size: { ratio: 0.78, min: lc.ref * 0.03, max: lc.ref * 0.07 },
            gapBefore: gap(lc, 0.08),
            hangPunctuation: false,
            marker: marker(lc, "A.", marks, lc.pairing.displayEm, { color: lc.accent }),
          }),
        ],
        box: lc.box,
        valign: "optical",
      },
    ],
  };
}

// --------------------------------------------------------------- definition

export const DEFINITION_LAYOUTS = ["entry", "centered"] as const;

/** Styled like a dictionary entry: headword, pronunciation, part of speech, sense, usage. */
export function composeDefinition(lc: LayoutContext, c: QuoteContent, layout: string): Composition {
  const align: BlockSpec["align"] = center(layout) ? "center" : "left";
  const word = str(c, "word"), phon = str(c, "phonetic"), pos = str(c, "pos"), def = str(c, "definition"), usage = str(c, "usage");
  const specs: BlockSpec[] = [display(lc, "word", word, 0.14, { face: boldDisplay(lc), align, maxLines: 2, measure: [0, 30], hangPunctuation: false })];
  const meta = [phon && `/${phon.replace(/^\/|\/$/g, "")}/`, pos].filter(Boolean).join("   ");
  if (meta) specs.push(body(lc, "meta", meta, 0.3, { face: lc.pairing.displayEm, color: lc.muted, align, gapBefore: gap(lc, 0.022), size: { ratio: 0.3, min: lc.ref * 0.026, max: lc.ref * 0.042 } }));
  specs.push(
    display(lc, "definition", def, 0.07, {
      size: { ratio: 0.5, min: lc.ref * 0.03, max: lc.ref * 0.06 },
      align,
      gapBefore: gap(lc, 0.07),
      ruleAbove: ruleAbove(lc, 0.3, align === "center" ? 0.2 : 1),
      hangPunctuation: false,
      marker: align === "left" ? marker(lc, "1.", ["1."], lc.pairing.display, { color: lc.muted }) : undefined,
    }),
  );
  if (usage) specs.push(body(lc, "usage", `“${sq(usage).replace(/^[“"]+|[”"]+$/g, "")}”`, 0.32, { align, color: lc.muted, face: lc.pairing.displayEm, gapBefore: gap(lc, 0.04) }));
  return { stacks: [{ specs, box: lc.box, valign: "optical", hAlign: align === "center" ? "center" : "left" }] };
}

// ----------------------------------------------------------------- equation

export const EQUATION_LAYOUTS = ["centered", "ledger"] as const;

/** Formula-style ideas in a monospace face, operators aligned on "=". */
export function composeEquation(lc: LayoutContext, c: QuoteContent, layout: string): Composition {
  const face = mathFace(lc, 600);
  const lines = str(c, "equation").split("\n").map((l) => math(l.trim())).filter(Boolean);
  const caption = str(c, "caption");
  const aligned = lines.length > 1 && lines.every((l) => l.includes("="));
  const lhs = lines.map((l) => (aligned ? l.slice(0, l.indexOf("=")).trim() : ""));
  const specs: BlockSpec[] = lines.map((l, i) => {
    const base: BlockSpec = {
      id: `eq-${i}`,
      role: "mono",
      text: aligned ? l.slice(l.indexOf("=")).trim() : l,
      face,
      color: lc.ink,
      align: aligned || layout === "ledger" ? "left" : "center",
      size: { ratio: 1, min: lc.ref * 0.03, max: lc.ref * 0.085 },
      measure: [0, 40],
      balance: true,
      // An equation reads as one unit: keep short ones on a single line.
      maxLines: l.length <= 40 ? 1 : 2,
      gapBefore: i === 0 ? 0 : gap(lc, 0.035),
      hangPunctuation: false,
    };
    if (aligned) base.marker = marker(lc, lhs[i], lhs, face, { color: lc.ink, align: "right", gapEm: 0.6 });
    // Ledger: a rule above the final line, like a total.
    if (layout === "ledger" && i === lines.length - 1 && i > 0) base.ruleAbove = ruleAbove(lc, 0.6, 1);
    return base;
  });
  if (caption) specs.push(body(lc, "caption", caption, 0.4, { align: aligned || layout === "ledger" ? "left" : "center", color: lc.muted, gapBefore: gap(lc, 0.07) }));
  const centered = layout !== "ledger";
  return { stacks: [{ specs, box: lc.box, valign: centered ? "center" : "optical", hAlign: centered ? "center" : "left" }] };
}

// --------------------------------------------------------------------- stat

export const STAT_LAYOUTS = ["hero", "centered"] as const;

/** One big number plus a short line of context. */
export function composeStat(lc: LayoutContext, c: QuoteContent, layout: string): Composition {
  const align: BlockSpec["align"] = center(layout) ? "center" : "left";
  const specs: BlockSpec[] = [
    display(lc, "number", str(c, "number"), 0.42, {
      face: boldDisplay(lc),
      align,
      maxLines: 1,
      measure: [0, 12],
      size: { ratio: 1, min: lc.ref * 0.08, max: lc.ref * 0.42 },
      trackingBase: (lc.pairing.displayTracking ?? 0) - 0.02,
      hangPunctuation: false,
    }),
    display(lc, "context", str(c, "context"), 0.06, {
      align,
      size: { ratio: 0.22, min: lc.ref * 0.032, max: lc.ref * 0.06 },
      gapBefore: gap(lc, 0.04),
      measure: [14, 34],
      hangPunctuation: false,
    }),
  ];
  const src = str(c, "source");
  if (src) specs.push(label(lc, "source", src, { align, gapBefore: gap(lc, 0.05) }));
  return { stacks: [{ specs, box: lc.box, valign: center(layout) ? "center" : "optical", hAlign: align === "center" ? "center" : "left" }] };
}

// ---------------------------------------------------------------------- law

export const LAW_LAYOUTS = ["placard", "centered"] as const;

/** "Fred's Law No. 12" followed by the statement. */
export function composeLaw(lc: LayoutContext, c: QuoteContent, layout: string): Composition {
  const align: BlockSpec["align"] = center(layout) ? "center" : "left";
  const name = str(c, "name") || "Fred’s Law";
  const no = str(c, "number");
  const heading = no ? `${name} No. ${no}` : name;
  return {
    stacks: [
      {
        specs: [
          label(lc, "heading", heading, { align, color: lc.accent }),
          display(lc, "statement", str(c, "statement"), 0.095, { align, gapBefore: gap(lc, 0.075), ruleAbove: ruleAbove(lc, 0.45, align === "center" ? 0.14 : 1) }),
        ],
        box: lc.box,
        valign: center(layout) ? "center" : "optical",
        hAlign: align === "center" ? "center" : "left",
      },
    ],
  };
}

// ----------------------------------------------------------------- dialogue

export const DIALOGUE_LAYOUTS = ["script", "stacked"] as const;

/** Two short speaker lines. */
export function composeDialogue(lc: LayoutContext, c: QuoteContent, layout: string): Composition {
  const sa = str(c, "speakerA") || "A", sb = str(c, "speakerB") || "B";
  const la = str(c, "lineA"), lb = str(c, "lineB");
  if (layout === "stacked") {
    const q = (t: string) => `“${t.replace(/^[“"]+|[”"]+$/g, "")}”`;
    return {
      stacks: [
        {
          specs: [
            label(lc, "speaker-a", sa),
            display(lc, "line-a", q(la), 0.08, { gapBefore: gap(lc, 0.025) }),
            label(lc, "speaker-b", sb, { gapBefore: gap(lc, 0.09), color: lc.accent }),
            display(lc, "line-b", q(lb), 0.08, { gapBefore: gap(lc, 0.025), face: lc.pairing.displayEm }),
          ],
          box: lc.box,
          valign: "center",
        },
      ],
    };
  }
  // script: speaker names in small capitals in a margin column, like a screenplay.
  const names = [sa, sb];
  const mk = (name: string, color: string) => marker(lc, name, names, lc.pairing.label, { sizeEm: 0.36, uppercase: true, trackingEm: 0.12, color, gapEm: 0.7 });
  return {
    stacks: [
      {
        specs: [
          display(lc, "line-a", la, 0.075, { hangPunctuation: false, marker: mk(sa, lc.muted), measure: [10, 30] }),
          display(lc, "line-b", lb, 0.075, { hangPunctuation: false, marker: mk(sb, lc.accent), gapBefore: gap(lc, 0.07), measure: [10, 30] }),
        ],
        box: lc.box,
        valign: "optical",
      },
    ],
  };
}
