import { describe, expect, it } from "vitest";
import { parseLatex, serializeLatex } from "../src";
import { REFERENCE_EQUATIONS } from "../../../fixtures/reference-equations";

/**
 * Structural round trip: LaTeX → AST → LaTeX → AST must give the same AST.
 * This is the guarantee that switching between visual and LaTeX mode never
 * changes the mathematics.
 */
describe("LaTeX round trip", () => {
  for (const eq of REFERENCE_EQUATIONS) {
    it(`${eq.id}: ${eq.title}`, () => {
      const first = parseLatex(eq.latex);
      expect(first.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      const latex2 = serializeLatex(first.root);
      const second = parseLatex(latex2);
      expect(second.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(second.root).toEqual(first.root);
      // Serialisation is stable after one normalisation pass.
      expect(serializeLatex(second.root)).toBe(latex2);
    });
  }

  it("normalises spacing between commands and letters", () => {
    expect(serializeLatex(parseLatex("\\alpha x").root)).toBe("\\alpha x");
    expect(serializeLatex(parseLatex("\\mathrm{d}x").root)).toBe("\\mathrm{d}x");
  });
});
