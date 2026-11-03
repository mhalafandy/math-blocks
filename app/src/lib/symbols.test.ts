import { describe, expect, it } from "vitest";
import { parseLatex } from "@mathblocks/math-latex";
import { listSymbols, renameInLatex } from "./symbols";
import { indexEquations } from "./symbolIndex";

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

  it("indexes a document: where each symbol is defined and used", () => {
    const eq = (latex: string, page: number) => ({ tag: `t${page}`, page, context: "", latex, display: true, blockId: null });
    const idx = indexEquations([eq("v=v_0+at", 1), eq("v_0=\\sqrt{2gh}", 2), eq("E=\\frac{1}{2}mv^2", 3)]);
    const v = idx.find((s) => s.key === "v")!;
    expect(v.equations.map((e) => e.page)).toEqual([1, 3]);
    expect(v.definedIn?.page).toBe(1);
    expect(idx.find((s) => s.key === "v_0")!.definedIn?.page).toBe(2);
    expect(idx.find((s) => s.key === "m")!.definedIn).toBeNull();
  });
});
