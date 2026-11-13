import { describe, expect, it } from "vitest";
import { applyPreset, DEFAULT_STYLE, STYLE_PRESET_BY_ID } from "@mathblocks/math-core";
import { stripRedundantFonts } from "./fonts";

describe("Save as block keeps meaning, not a look", () => {
  const iso = applyPreset(DEFAULT_STYLE, STYLE_PRESET_BY_ID.get("iso")!);
  it("removes a font command the kinds would draw anyway", () => {
    expect(stripRedundantFonts("\\frac{\\mathrm{d}x}{\\mathrm{d}t}", iso)).toEqual({ latex: "\\frac{dx}{dt}", kept: [] });
    expect(stripRedundantFonts("v_{\\mathrm{max}}", iso).latex).toBe("v_{max}");
  });
  it("keeps (and lists) a look the kinds would not give", () => {
    const r = stripRedundantFonts("\\mathrm{x}+y", DEFAULT_STYLE);
    expect(r.latex).toBe("\\mathrm{x}+y");
    expect(r.kept).toEqual(["\\mathrm{x}"]);
  });
  it("leaves bold (meaning) alone", () => {
    expect(stripRedundantFonts("\\mathbf{r}", DEFAULT_STYLE).latex).toBe("\\mathbf{r}");
  });
});
