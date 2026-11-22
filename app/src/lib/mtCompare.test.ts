import { describe, expect, it } from "vitest";
import { parseLatex } from "@mathblocks/math-latex";
import { CATEGORIES, categoryOf, COMPARISON_SHEET } from "./mtCompare";

describe("the MathType comparison sheet", () => {
  it("has at least two equations in every category the comparison scores", () => {
    for (const c of CATEGORIES) expect(COMPARISON_SHEET.filter((e) => categoryOf(e.latex) === c.id).length, c.label).toBeGreaterThanOrEqual(2);
  });
  it("is standard LaTeX that MathBlocks reads without a problem", () => {
    for (const e of COMPARISON_SHEET) expect(parseLatex(e.latex).diagnostics ?? [], e.latex).toEqual([]);
  });
  it("has inline and display equations", () => {
    expect(COMPARISON_SHEET.some((e) => !e.display)).toBe(true);
    expect(COMPARISON_SHEET.some((e) => e.display)).toBe(true);
  });
});
