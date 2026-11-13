import { describe, expect, it } from "vitest";
import { fillSlots, flagsOf, inkBox, medianScale, printEntries, printParagraphs, type Measured } from "./printCheck";
import { planInterchange } from "./latexInterchange";

describe("print check: the document", () => {
  it("every palette entry once, its slots filled", () => {
    expect(fillSlots("\\frac{#0}{#?}")).toBe("\\frac{x}{a}");
    expect(fillSlots("\\sqrt[#?]{#?}")).toBe("\\sqrt[a]{b}");
    const e = printEntries();
    expect(e.length).toBeGreaterThan(300);
    expect(new Set(e.map((x) => x.latex)).size).toBe(e.length);
    expect(e.every((x) => !/#0|#\?|#@/.test(x.latex))).toBe(true);
  });

  it("Convert LaTeX reads the document: every entry inline and as a display equation", () => {
    const entries = printEntries();
    let pos = 0;
    const paragraphs = printParagraphs(entries).map((p) => ({ ...p, start: pos, end: (pos += p.text.length + 1) - 1 }));
    const plan = planInterchange({ name: "print", fullName: "print", bookmarks: [], paragraphs });
    const errors = plan.issues.filter((i) => i.severity === "error");
    expect(errors.map((i) => i.snippet).slice(0, 5)).toEqual([]);
    expect(plan.counts.inline).toBe(entries.length);
    expect(plan.counts.display).toBe(entries.length);
  });
});

describe("print check: the flags", () => {
  const ink = (x0: number, x1: number, bottom: number, top: number) => ({ x0, x1, bottom, top });
  const good: Measured = { pdf: ink(0, 10, -2, 8), expected: ink(0, 10, -2, 8) };
  it("a faithful print has no flags", () => {
    expect(flagsOf(good, { scale: 1, inline: true })).toEqual([]);
  });
  it("empty, missing glyph, clipped, touching, off the baseline, a different size", () => {
    expect(flagsOf({ ...good, pdf: null }, { scale: 1, inline: true })).toEqual(["empty"]);
    expect(flagsOf({ ...good, missingGlyph: true }, { scale: 1, inline: false })).toEqual(["missing glyph"]);
    expect(flagsOf({ ...good, pdf: ink(0, 10, 2, 8) }, { scale: 1, inline: false })).toContain("clipped");
    expect(flagsOf({ ...good, touchesSides: true }, { scale: 1, inline: true })).toContain("touches its neighbours");
    expect(flagsOf({ ...good, pdf: ink(0, 10, -3.5, 6.5) }, { scale: 1, inline: true })).toEqual(["off the baseline"]);
    expect(flagsOf({ ...good, pdf: ink(0, 12, -2.4, 9.6) }, { scale: 1, inline: false })).toEqual(["different size"]);
    expect(flagsOf({ ...good, notConverted: "parse error" }, { scale: 1, inline: true })).toEqual(["not converted"]);
  });
  it("sizes are judged against the neighbours (the median ratio)", () => {
    const list: Measured[] = [1.33, 1.34, 1.33, 1.6, 1.33].map((r) => ({ pdf: ink(0, 10 * r, -2 * r, 8 * r), expected: ink(0, 10, -2, 8) }));
    const s = medianScale(list);
    expect(s).toBeCloseTo(1.33, 2);
    expect(flagsOf(list[3]!, { scale: s, inline: false })).toEqual(["different size"]);
    expect(flagsOf(list[0]!, { scale: s, inline: false })).toEqual([]);
  });
  it("finds the ink of an image region", () => {
    const w = 4;
    const data = new Uint8ClampedArray(w * 3 * 4).fill(255);
    const dark = (x: number, y: number) => data.set([0, 0, 0, 255], (y * w + x) * 4);
    dark(1, 1);
    dark(2, 2);
    expect(inkBox(data, w, 0, 0, 4, 3)).toEqual({ x0: 1, y0: 1, x1: 3, y1: 3 });
    expect(inkBox(new Uint8ClampedArray(16).fill(255), 2, 0, 0, 2, 2)).toBeNull();
  });
});
