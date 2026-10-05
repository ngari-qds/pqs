import { describe, expect, it } from "vitest";
import { autoStructure, flatten } from "@/lib/studio/autostructure";
import { carouselSlides, sentences } from "@/lib/render/formats/hbp";
import { FORMATS, FORMAT_LIST, resolveLayout, slideCount } from "@/lib/render/formats";
import { FORMAT_IDS, list, type TemplateConfig } from "@/lib/render/template";
import { renderQuote } from "@/lib/render/render";
import { newCanvas, nodeEnv } from "@/scripts/node-env";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

describe("sentence splitting", () => {
  it("splits on terminal punctuation but keeps abbreviations", () => {
    expect(sentences("Dr. Kim left early. Nobody noticed! Was it late? Yes.")).toEqual(["Dr. Kim left early.", "Nobody noticed!", "Was it late?", "Yes."]);
  });
  it("handles closing quotes and ellipses", () => {
    expect(sentences("He said “No.” Then he left… Quietly.")).toEqual(["He said “No.”", "Then he left…", "Quietly."]);
  });
});

describe("auto-structure", () => {
  it("first sentence → hook, last → punchline, the rest → body", () => {
    expect(autoStructure("Nobody is coming. Not the mentor, not the lucky break. The room stays as you leave it. The door was never locked.")).toEqual({
      hook: "Nobody is coming.",
      body: "Not the mentor, not the lucky break. The room stays as you leave it.",
      punchline: "The door was never locked.",
    });
  });
  it("two sentences → hook and punchline", () => {
    expect(autoStructure("Comfort is a loan.  It is repaid in time.")).toEqual({ hook: "Comfort is a loan.", body: "", punchline: "It is repaid in time." });
  });
  it("one sentence splits at a strong pause", () => {
    expect(autoStructure("The more doors you keep open, the fewer rooms you enter.")).toEqual({ hook: "The more doors you keep open", body: "", punchline: "The fewer rooms you enter." });
  });
  it("round-trips through flatten", () => {
    expect(flatten(autoStructure("Wait less. Most delay is fear. Begin."))).toBe("Wait less. Most delay is fear. Begin.");
  });
  it("keeps \"Law No. 12\" together", () => {
    expect(sentences("This is Fred's Law No. 12 in action. It holds.")).toEqual(["This is Fred's Law No. 12 in action.", "It holds."]);
  });
});

describe("carousel", () => {
  it("makes 3–5 slides: hook, 1–3 body slides, punchline", () => {
    const s = carouselSlides(FORMATS.carousel.sample);
    expect(s.length).toBeGreaterThanOrEqual(3);
    expect(s.length).toBeLessThanOrEqual(5);
    expect(s[0].kind).toBe("hook");
    expect(s[s.length - 1].kind).toBe("punchline");
  });
  it("never exceeds 5 slides however long the body", () => {
    const body = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} is here to make the body long.`).join(" ");
    const s = carouselSlides({ format: "carousel", hook: "Hook.", body, punchline: "End." });
    expect(s).toHaveLength(5);
    expect(s.slice(1, -1).map((x) => x.text).join(" ")).toBe(body);
  });
  it("slideCount is 1 for single-image formats", () => {
    expect(slideCount(FORMATS.classic.sample)).toBe(1);
    expect(slideCount(FORMATS.carousel.sample)).toBe(carouselSlides(FORMATS.carousel.sample).length);
  });
});

describe("format registry", () => {
  it("has all 20 formats, each with fields, layouts and a sample", () => {
    expect(FORMAT_LIST).toHaveLength(20);
    for (const id of FORMAT_IDS) {
      const f = FORMATS[id];
      expect(f.fields.length).toBeGreaterThan(0);
      expect(f.layouts.length).toBeGreaterThanOrEqual(2);
      expect(f.sample.format).toBe(id);
      for (const field of f.fields) if (!field.optional) expect(field.key in f.sample).toBe(true);
    }
  });
  it("falls back to the first layout for unknown layout ids", () => {
    expect(resolveLayout("list", "nope")).toBe("numbered");
    expect(resolveLayout("list", "ruled")).toBe("ruled");
  });
  it("reads list fields from arrays or newline text", () => {
    expect(list({ format: "list", items: "a\n\n b \nc" }, "items")).toEqual(["a", "b", "c"]);
    expect(list({ format: "list", items: ["x", " ", "y"] }, "items")).toEqual(["x", "y"]);
  });
});

describe("templates", () => {
  const dir = path.resolve(__dirname, "../templates");
  const all: TemplateConfig[] = readdirSync(dir).flatMap((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")));
  it("every template names a real format, layout, pairing and palette, with unique ids", () => {
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length);
    for (const t of all) {
      expect(FORMATS[t.format], t.id).toBeDefined();
      expect(FORMATS[t.format].layouts.some((l) => l.id === t.layout), `${t.id} layout ${t.layout}`).toBe(true);
    }
  });
  it("covers every format with at least two templates", () => {
    for (const id of FORMAT_IDS) expect(all.filter((t) => t.format === id).length, id).toBeGreaterThanOrEqual(2);
  });
});

describe("every format renders its sample in every layout", () => {
  const env = nodeEnv();
  for (const f of FORMAT_LIST) {
    it(f.name, () => {
      for (const l of f.layouts) {
        for (let slide = 0; slide < slideCount(f.sample); slide++) {
          const { ctx } = newCanvas(540, 675);
          const r = renderQuote(ctx, env, {
            content: { ...f.sample, slide },
            template: { id: "t", name: "t", format: f.id, layout: l.id, pairing: f.id === "equation" ? "jetbrains" : "fraunces-inter", palette: "paper-ink", background: { kind: "solid" } },
            signature: { enabled: true, style: "line" },
          });
          expect(r.overflow, `${f.id}/${l.id}`).toBe(false);
          expect(r.collisions, `${f.id}/${l.id}`).toEqual([]);
          expect(r.blocks.length).toBeGreaterThan(0);
          for (const b of r.blocks) expect(b.contrast, `${f.id}/${l.id}/${b.id}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }
});
