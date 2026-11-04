import { describe, expect, it, vi } from "vitest";
import { normalizeBold } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";

vi.mock("mathlive", () => ({ MathfieldElement: class {} }));
const { toggledBold } = await import("./MathEditor");

describe("bold toggle (Ctrl+Shift+B): the base only, like MathType", () => {
  it("bolds the letter, not its scripts", () => {
    expect(toggledBold("x_1", "base")).toBe("\\mathbf{x}_1");
    expect(toggledBold("r_{P/O}", "base")).toBe("\\mathbf{r}_{P/O}");
    expect(toggledBold("\\omega^{B/N}", "base")).toBe("\\boldsymbol{\\omega}^{B/N}");
    expect(toggledBold("A^{T}", "base")).toBe("\\mathbf{A}^T");
  });

  it("bolds the letter under an accent; the accent keeps its weight", () => {
    expect(toggledBold("\\overrightharpoon{x}", "base")).toBe("\\overrightharpoon{\\mathbf{x}}");
    expect(toggledBold("\\vec{r}", "base")).toBe("\\vec{\\mathbf{r}}");
    expect(toggledBold("\\hat{s}_2", "base")).toBe("\\hat{\\mathbf{s}}_2");
    expect(toggledBold("\\omega", "base")).toBe("\\boldsymbol{\\omega}");
  });

  it("toggling twice restores exactly what was there", () => {
    for (const src of ["x_1", "\\mathrm{d}m", "\\overrightharpoon{x}_{i}", "\\omega^{B/N}", "q_{ab}+x"]) {
      const on = toggledBold(src, "base");
      expect(toggledBold(on, "base"), src).toBe(src);
    }
  });

  it("removes bold when every base letter is bold", () => {
    expect(toggledBold("\\vec{\\mathbf{r}}", "base")).toBe("\\vec{r}");
    expect(toggledBold("\\bm{\\vec{r}}", "base")).toBe("\\vec{r}");
    expect(toggledBold("\\mathbf{q}_{ab}+x", "base")).toBe("\\mathbf{q}_{ab}+\\mathbf{x}");
  });

  it("other scopes: base and scripts, or the whole selection", () => {
    expect(toggledBold("x_1", "scripts")).toBe("\\mathbf{x}_{\\mathbf{1}}");
    expect(toggledBold("\\int_{B}x\\,\\mathrm{d}m", "all")).toContain("\\mathbf{B}");
  });
});

describe("normalize bold", () => {
  const norm = (l: string) => {
    const root = parseLatex(l).root;
    const n = normalizeBold(root);
    return [serializeLatex(root), n] as const;
  };
  it("takes bold out of scripts of bold letters", () => {
    expect(norm("\\mathbf{r}_{\\mathbf{P/O}}")[0]).toBe("\\mathbf{r}_{P/O}");
    expect(norm("\\hat{\\mathbf{b}}_{\\mathbf{1}}")).toEqual(["\\hat{\\mathbf{b}}_1", 1]);
  });
  it("leaves the transpose mark and plain scripts alone", () => {
    expect(norm("\\mathbf{A}^{\\mathbf{T}}")[1]).toBe(0);
    expect(norm("x_{\\mathbf{1}}")[1]).toBe(0);
  });
});
