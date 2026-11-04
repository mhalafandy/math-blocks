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

describe("round trip regressions (palette audit)", () => {
  it("keeps an empty last matrix row (3×1 column of empty slots)", () => {
    const src = "\\begin{bmatrix} \\\\  \\\\ {} \\end{bmatrix}";
    const once = parseLatex("\\begin{bmatrix}{}\\\\ {}\\\\ {}\\end{bmatrix}").root.children[0]!;
    expect(once.kind === "matrix" && once.rows.length).toBe(3);
    const out = serializeLatex(parseLatex("\\begin{bmatrix}{}\\\\ {}\\\\ {}\\end{bmatrix}").root);
    const again = parseLatex(out).root.children[0]!;
    expect(again.kind === "matrix" && again.rows.length, out).toBe(3);
    expect(parseLatex(src).root.children[0]!.kind).toBe("matrix");
  });

  it("still drops the row after a trailing \\\\", () => {
    const m = parseLatex("\\begin{bmatrix} 1 \\\\ 2 \\\\ \\end{bmatrix}").root.children[0]!;
    expect(m.kind === "matrix" && m.rows.length).toBe(2);
  });

  it("keeps \\bot (ordinary) and \\perp (relation) apart", () => {
    expect(serializeLatex(parseLatex("\\bot").root)).toBe("\\bot");
    expect(serializeLatex(parseLatex("a\\perp b").root)).toBe("a\\perp b");
    expect(serializeLatex(parseLatex("\\leq").root)).toBe("\\leq");
  });
});

describe("operator class survives serialization", () => {
  it("keeps a plain colon (relation) distinct from \\colon (punctuation)", () => {
    expect(serializeLatex(parseLatex("q_{1:3}").root)).toBe("q_{1:3}");
    expect(serializeLatex(parseLatex("f\\colon A\\to B").root)).toContain("\\colon");
  });
});
