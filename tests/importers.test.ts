import { describe, expect, it } from "vitest";
import { csvRows, parseCsv, parseImportFile, parseJson } from "@/lib/studio/importers";

describe("CSV import", () => {
  it("handles quotes, doubled quotes, commas and newlines inside cells", () => {
    expect(csvRows('a,b\n"x, y","he said ""no"""\n"multi\nline",z\n')).toEqual([["a", "b"], ["x, y", 'he said "no"'], ["multi\nline", "z"]]);
  });
  it("maps columns to fields, splits list items and tags", () => {
    const items = parseCsv(`format,text,author,title,items,tags
classic,"Love does not conquer anything.",Fred M,,,"love; money"
list,,,Things I stopped doing,"Explaining myself twice | Answering at midnight | Keeping score",self
,Silence is an answer.,,,,`);
    expect(items[0]).toMatchObject({ content: { format: "classic", text: "Love does not conquer anything.", author: "Fred M" }, tags: ["love", "money"], errors: [] });
    expect(items[1].content).toEqual({ format: "list", title: "Things I stopped doing", items: ["Explaining myself twice", "Answering at midnight", "Keeping score"] });
    expect(items[2].content).toEqual({ format: "classic", text: "Silence is an answer." });
  });
  it("reports missing fields and unknown formats with row numbers", () => {
    const items = parseCsv("format,question\nqa,Why?\npoem,x");
    expect(items[0]).toMatchObject({ line: 2, errors: ["missing answer"] });
    expect(items[1].errors[0]).toMatch(/Unknown format/);
  });
  it("accepts a single 'quote' column", () => {
    expect(parseCsv("quote\nNobody is coming.\nHope is not a plan.", "one-liner").map((i) => i.content)).toEqual([
      { format: "one-liner", text: "Nobody is coming." },
      { format: "one-liner", text: "Hope is not a plan." },
    ]);
  });
});

describe("JSON import", () => {
  it("accepts contents, {content, tags} and {quotes: []}", () => {
    expect(parseJson('[{"format":"one-liner","text":"Nobody is coming.","tags":["reality"]}]')[0]).toMatchObject({ content: { format: "one-liner", text: "Nobody is coming." }, tags: ["reality"] });
    expect(parseJson('{"quotes":[{"content":{"format":"law","number":"3","statement":"The person who cares less wins."},"tags":"love, power"}]}')[0]).toMatchObject({
      content: { format: "law", number: "3", statement: "The person who cares less wins." },
      tags: ["love", "power"],
    });
  });
  it("reads plain strings as quotes in the default format", () => {
    expect(parseJson('["Nobody is coming."]', "one-liner")[0]).toMatchObject({ content: { format: "one-liner", text: "Nobody is coming." }, errors: [] });
  });
});

describe("parseImportFile", () => {
  it("routes by extension", () => {
    expect(parseImportFile("q.txt", "@one-liner+\nA.\n\nB.").length).toBe(2);
    expect(parseImportFile("q.MD", "Plain quote.").length).toBe(1);
    expect(parseImportFile("q.csv", "text\nOne\nTwo").length).toBe(2);
    expect(parseImportFile("q.json", '[{"text":"x"}]')[0].content).toEqual({ format: "classic", text: "x" });
  });
});
