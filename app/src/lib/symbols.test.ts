import { describe, expect, it } from "vitest";
import { parseLatex } from "@mathblocks/math-latex";
import { listSymbols, renameInLatex } from "./symbols";

const keys = (latex: string) => listSymbols(parseLatex(latex).root).map((s) => `${s.key}×${s.count}`);

describe("symbols", () => {
  it("names symbols with their subscripts, not powers; skips differentials and functions", () => {
    expect(keys("v^2=v_0^2+2a\\,\\mathrm{d}x+\\sin\\theta")).toEqual(["v×1", "v_0×1", "a×1", "x×1", "\\theta×1"]);
    expect(keys("\\hat{s}_2\\cdot\\vec{r}+\\mathbf{c}_{sf}")).toEqual(["\\hat{s}_2×1", "\\vec{r}×1", "\\mathbf{c}_{sf}×1"]);
  });

  it("finds symbols inside fractions, roots, integrals and matrices", () => {
    expect(keys("\\frac{m_b}{2\\pi r_b}+\\sqrt{x}+\\int_0^a y\\,\\mathrm{d}y+\\begin{bmatrix}x&y\\end{bmatrix}")).toEqual(["m_b×1", "\\pi×1", "r_b×1", "x×2", "y×3", "a×1"]);
  });

  it("renames everywhere and keeps powers", () => {
    expect(renameInLatex("v^2=v_0^2+2ax", { v_0: "u_1", x: "s" })).toBe("v^2=u_1^2+2as");
    expect(renameInLatex("\\frac{m_b}{r_b}", { m_b: "M", r_b: "\\rho" })).toBe("\\frac{M}{\\rho}");
    expect(renameInLatex("x-x_0+\\vec{x}", { x: "s" })).toBe("s-x_0+\\vec{x}");
    expect(renameInLatex("\\theta^2+\\theta", { "\\theta": "\\phi_k" })).toBe("\\phi_k^2+\\phi_k");
  });
});
