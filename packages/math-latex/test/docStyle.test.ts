import { describe, expect, it } from "vitest";
import { applyPreset, DEFAULT_PROFILE, DEFAULT_STYLE, expandNotation, letterRoles, looksOf, normalizeStyle, STYLE_PRESET_BY_ID, styleAst, styleHash, withLetterRoles, type MathStyle } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "../src";

/** How the style draws an equation, written as explicit LaTeX (what the renderer receives). */
const drawn = (latex: string, style: MathStyle) => serializeLatex(styleAst(parseLatex(latex).root, style));
/** A style written as a v1 (flat) style, read through the migration: every test below checks that it draws as v1 did. */
const withLooks = (v: Record<string, unknown>): MathStyle => normalizeStyle(v);

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
    expect(drawn("A_{ij}", withLetterRoles(s, { i: "counter", j: "counter" }))).toBe("A_{ij}");
  });

  it("ISO: upright d, e, i, π; e's exponent is an expression, not a label", () => {
    const iso = applyPreset(DEFAULT_STYLE, STYLE_PRESET_BY_ID.get("iso")!);
    const isoI = withLetterRoles(iso, { i: "constant" });
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
    expect(looksOf(s).labels).toBe("upright");
    expect(letterRoles(s)).toEqual({ i: "counter" });
    expect(s.global.sizePt).toBe(DEFAULT_STYLE.global.sizePt);
    expect(styleHash(s)).not.toBe(styleHash(DEFAULT_STYLE));
    expect(styleHash(normalizeStyle(JSON.parse(JSON.stringify(s))))).toBe(styleHash(s));
    expect(styleHash({ ...s, exceptions: ["x"] })).toBe(styleHash(s));
  });

  it("a kind can set its own frame-label shape", () => {
    const up = withLooks({ labels: "upright" });
    const own = { ...up, notation: { ...up.notation, overrides: { ...up.notation.overrides, dcm: { frames: { position: "sub" as const, separator: "" as const, shape: "italic" as const } } } } };
    expect(drawn("\\dcm{A}{B}+\\pvec[P]{r}", own)).toBe("\\dcm{A}{B}+\\pvec[\\mathrm{P}]{r}");
    expect(drawn("\\dcm{A}{B}", up)).toBe("\\dcm{\\mathrm{A}}{\\mathrm{B}}");
  });

  it("Roman numerals in indices are labels, upright by default, recognised without \\mathrm", () => {
    // Default style: other index letters italic, numerals upright.
    expect(drawn("\\vectrix{F}_{I}+\\vectrix{F}_{II}+\\bvec{f}_1^{I}+\\bvec{f}_2^{IV}+x_{i}", DEFAULT_STYLE)).toBe("\\vectrix{F}_{\\mathrm{I}}+\\vectrix{F}_{\\mathrm{II}}+\\bvec{f}_1^{\\mathrm{I}}+\\bvec{f}_2^{\\mathrm{IV}}+x_i");
    // Not Roman numerals: IIV, lowercase, other capitals.
    expect(drawn("A_{IIV}+A_{ii}+A_{B}", DEFAULT_STYLE)).toBe("A_{IIV}+A_{ii}+A_B");
    // The category can be italic; a single letter the user classified keeps that meaning.
    expect(drawn("F_{II}", withLooks({ romans: "italic" }))).toBe("F_{II}");
    expect(drawn("F_{I}+F_{II}", withLooks({ letters: { I: "variable" } }))).toBe("F_I+F_{\\mathrm{II}}");
    // Outside indices an I is a variable as before.
    expect(drawn("I+V", DEFAULT_STYLE)).toBe("I+V");
  });

  it("a DCM between frames with their own index: the frame letters labels, the numerals upright", () => {
    const up = withLooks({ labels: "upright" });
    // Drawn as C with subscript F_I F, a thin space after the frame with an index.
    expect(serializeLatex(expandNotation(parseLatex("\\dcm{F_I}{F}").root, DEFAULT_PROFILE))).toBe("\\mathbf{C}_{F_I \\,F}");
    expect(drawn("\\dcm{F_{I}}{F}", DEFAULT_STYLE)).toBe("\\dcm{F_{\\mathrm{I}}}{F}");
    expect(drawn("\\dcm{F_{II}}{F_{I}}", up)).toBe("\\dcm{\\mathrm{F}_{\\mathrm{II}}}{\\mathrm{F}_{\\mathrm{I}}}");
    // Stored styles from before keep their fingerprint (the numerals' default is left out of it).
    expect(styleHash(normalizeStyle({ labels: "upright" }))).toBe(styleHash(normalizeStyle({ labels: "upright", romans: "upright" })));
    expect(styleHash(withLooks({ romans: "italic" }))).not.toBe(styleHash(DEFAULT_STYLE));
  });
});
