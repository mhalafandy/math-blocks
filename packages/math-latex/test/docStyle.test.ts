import { describe, expect, it } from "vitest";
import { applyPreset, DEFAULT_STYLE, normalizeStyle, STYLE_PRESET_BY_ID, styleAst, styleHash, type MathStyle } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "../src";

/** How the style draws an equation, written as explicit LaTeX (what the renderer receives). */
const drawn = (latex: string, style: MathStyle) => serializeLatex(styleAst(parseLatex(latex).root, style));
const withLooks = (v: Partial<MathStyle>): MathStyle => ({ ...DEFAULT_STYLE, ...v });

describe("document style (render time)", () => {
  it("the default style changes nothing", () => {
    for (const l of ["\\sigma_{sf}=E\\varepsilon_{ij}", "\\frac{dx}{dt}", "e^{i\\pi}+1=0", "\\int_0^1 f(x)\\,dx", "\\Omega_{n}+\\sin\\theta", "\\pvec[B/N]{r}"]) expect(drawn(l, DEFAULT_STYLE)).toBe(serializeLatex(parseLatex(l).root));
  });

  it("index labels: italic or upright, the source unchanged", () => {
    const up = withLooks({ labels: "upright" });
    expect(drawn("\\sigma_{sf}+B_{max}", up)).toBe("\\sigma_{\\mathrm{sf}}+B_{\\mathrm{max}}");
    expect(drawn("\\sigma_{sf}", withLooks({ labels: "italic" }))).toBe("\\sigma_{sf}");
    // Frame labels of a kind are labels.
    expect(drawn("\\pvec[B/N]{r}", up)).toBe("\\pvec[\\mathrm{B}/\\mathrm{N}]{r}");
  });

  it("single-letter indices follow their classification; undecided ones are drawn as variables", () => {
    const s = withLooks({ labels: "upright", counters: "italic", letters: { i: "counter", f: "label" } });
    expect(drawn("x_i+v_f+y_t", s)).toBe("x_i+v_{\\mathrm{f}}+y_t");
    // Two counters together stay counters; a word with a counter is a label.
    expect(drawn("A_{ij}", s)).toBe("A_{\\mathrm{ij}}");
    expect(drawn("A_{ij}", { ...s, letters: { i: "counter", j: "counter" } })).toBe("A_{ij}");
  });

  it("ISO: upright d, e, i, π; e's exponent is an expression, not a label", () => {
    const iso = applyPreset(DEFAULT_STYLE, STYLE_PRESET_BY_ID.get("iso")!);
    const isoI = { ...iso, letters: { i: "constant" as const } };
    expect(drawn("\\frac{dx}{dt}", iso)).toBe("\\frac{\\mathrm{d}x}{\\mathrm{d}t}");
    expect(drawn("\\int_0^1 f(x)\\,dx", iso)).toBe("\\int_0^1 f(x)\\,\\mathrm{d}x");
    expect(drawn("e^{i\\pi}+1=0", isoI)).toBe("\\mathrm{e}^{\\mathrm{i\\pi}}+1=0");
    // A d that is a variable (d = 2r) stays italic.
    expect(drawn("d=2r", iso)).toBe("d=2r");
  });

  it("variables: Latin and Greek, lowercase and capitals", () => {
    expect(drawn("\\alpha+\\Omega+x+X", withLooks({ greekLower: "upright", greekUpper: "italic", latinUpper: "upright" }))).toBe("\\mathrm{\\alpha}+\\mathit{\\Omega}+x+\\mathrm{X}");
  });

  it("transpose mark and bold scope", () => {
    expect(drawn("\\mathbf{A}^T", withLooks({ transpose: "italic" }))).toBe("\\mathbf{A}^T");
    expect(drawn("\\mathbf{A}^T", withLooks({ transpose: "upright" }))).toBe("\\mathbf{A}^{\\mathrm{T}}");
    expect(drawn("\\mathbf{A}^T", withLooks({ transpose: "bold" }))).toBe("\\mathbf{A}^{\\mathbf{T}}");
    expect(drawn("\\mathbf{r}_{sf}", withLooks({ boldScope: "scripts", labels: "upright" }))).toBe("\\mathbf{r}_{\\mathbf{sf}}");
    expect(drawn("\\mathbf{r}_{sf}", withLooks({ boldScope: "base", labels: "upright" }))).toBe("\\mathbf{r}_{\\mathrm{sf}}");
  });

  it("explicitly styled letters are left as written", () => {
    expect(drawn("v_{\\mathit{max}}", withLooks({ labels: "upright" }))).toBe("v_{\\mathit{max}}");
    expect(drawn("\\mathrm{x}", DEFAULT_STYLE)).toBe("\\mathrm{x}");
  });

  it("stored styles are normalised; the hash follows the look", () => {
    const s = normalizeStyle({ labels: "upright", letters: { i: "counter", q: "nonsense" }, sizePt: 500 });
    expect(s.labels).toBe("upright");
    expect(s.letters).toEqual({ i: "counter" });
    expect(s.sizePt).toBe(DEFAULT_STYLE.sizePt);
    expect(styleHash(s)).not.toBe(styleHash(DEFAULT_STYLE));
    expect(styleHash(normalizeStyle(JSON.parse(JSON.stringify(s))))).toBe(styleHash(s));
    expect(styleHash({ ...s, exceptions: ["x"] })).toBe(styleHash(s));
  });
});
