import { describe, expect, it } from "vitest";
import { batchFileStem, parseBatch, STYLE_FAMILIES, templateFor } from "@/lib/studio/batch";
import { FORMAT_IDS, type FormatId } from "@/lib/render/template";
import { violations } from "@/lib/templates/generator";
import { getPairing } from "@/lib/render/pairings";
import { getPalette } from "@/lib/render/palettes";

describe("parseBatch: plain paste", () => {
  it("splits on blank lines and reads a trailing author line", () => {
    const items = parseBatch("Silence is not empty.\n\nMost people do not want the truth.\nThey want a quieter version.\n— Fred M\n\n\n");
    expect(items).toHaveLength(2);
    expect(items[0].content).toEqual({ format: "classic", text: "Silence is not empty." });
    expect(items[1].content).toEqual({ format: "classic", text: "Most people do not want the truth. They want a quieter version.", author: "Fred M" });
  });
  it("uses the chosen default format", () => {
    const [a] = parseBatch("The city does not remember the people who waited.", "one-liner");
    expect(a.content).toEqual({ format: "one-liner", text: "The city does not remember the people who waited." });
  });
  it("auto-structures a single paragraph for hook/body/punchline", () => {
    const [a] = parseBatch("Nobody is coming. Not the mentor. The door was never locked.", "hbp");
    expect(a.content).toMatchObject({ hook: "Nobody is coming.", body: "Not the mentor.", punchline: "The door was never locked." });
  });
});

describe("parseBatch: --- groups", () => {
  it("reads hook / body / punchline lines per group", () => {
    const items = parseBatch("Comfort is a loan.\nIt feels free.\nThe interest is invisible.\nYou repay it in time.\n---\nWait less.\nBegin.", "hbp");
    expect(items).toHaveLength(2);
    expect(items[0].content).toMatchObject({ hook: "Comfort is a loan.", body: "It feels free. The interest is invisible.", punchline: "You repay it in time." });
    expect(items[1].content).toMatchObject({ hook: "Wait less.", body: "", punchline: "Begin." });
  });
});

describe("parseBatch: @format blocks", () => {
  const text = `// a comment line
@definition
word: Solitude
phonetic: ˈsɒl.ɪ.tjuːd
pos: noun
definition: The condition in which a person
finally hears their own opinion.
tags: solitude, #Truth

@list
title: Things I stopped doing
- Explaining myself twice
- Answering at midnight
- Keeping score

@stanza
title: Stone
text: The river argues with the stone
for a thousand years

and wins.

@one-liner
The city does not remember the people who waited.

@nonsense
foo: bar
`;
  const items = parseBatch(text);
  it("parses fields, continuation lines and tags", () => {
    expect(items[0].content).toEqual({ format: "definition", word: "Solitude", phonetic: "ˈsɒl.ɪ.tjuːd", pos: "noun", definition: "The condition in which a person\nfinally hears their own opinion." });
    expect(items[0].tags).toEqual(["solitude", "truth"]);
    expect(items[0].errors).toEqual([]);
  });
  it("collects list items", () => {
    expect(items[1].content).toEqual({ format: "list", title: "Things I stopped doing", items: ["Explaining myself twice", "Answering at midnight", "Keeping score"] });
  });
  it("keeps verse line breaks, including blank lines between stanzas", () => {
    expect(items[2].content.text).toBe("The river argues with the stone\nfor a thousand years\n\nand wins.");
  });
  it("fills the first field when there is no key", () => {
    expect(items[3].content).toEqual({ format: "one-liner", text: "The city does not remember the people who waited." });
  });
  it("reports unknown formats and missing fields with line numbers", () => {
    expect(items[4].errors[0]).toMatch(/Unknown format/);
    expect(items[4].line).toBe(text.split("\n").indexOf("@nonsense") + 1);
    const [bad] = parseBatch("@qa\nquestion: Why?");
    expect(bad.errors).toEqual(["missing answer"]);
  });
});

describe("style families", () => {
  it("give every format a template that obeys the design rules", () => {
    for (const fam of STYLE_FAMILIES)
      for (const format of FORMAT_IDS) {
        const t = templateFor({ format }, fam);
        expect(t.format).toBe(format);
        const v = violations({ format, layout: t.layout, pairing: getPairing(t.pairing), palette: getPalette(t.palette), background: t.background });
        expect(v, `${fam.id}/${format}`).toEqual([]);
        expect(t.palette).toBe(fam.palette);
      }
  });
  it("uses a monospace pairing for equations", () => {
    expect(getPairing(templateFor({ format: "equation" as FormatId }, STYLE_FAMILIES[0]).pairing).mono).toBe(true);
  });
  it("makes clean, ordered file names", () => {
    expect(batchFileStem(6, { format: "classic" }, "Most people don't *want* the truth!")).toBe("007_classic_most-people-dont-want-the-truth");
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { toBatchText } from "@/lib/studio/batch";

describe("toBatchText", () => {
  it("round-trips the whole collection through parseBatch", () => {
    const text = readFileSync(path.resolve(__dirname, "../public/quotes/cold-quotes.txt"), "utf8");
    const items = parseBatch(text);
    const again = parseBatch(toBatchText(items));
    expect(again.map((i) => i.content)).toEqual(items.map((i) => i.content));
    expect(again.map((i) => i.tags)).toEqual(items.map((i) => i.tags));
  });
});
