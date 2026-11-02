import { describe, expect, it } from "vitest";
import type { MathNode, Row } from "@mathblocks/math-core";
import { parseLatex } from "../src";

const parse = (s: string) => {
  const r = parseLatex(s);
  return r;
};
const only = (s: string): MathNode => {
  const { root, diagnostics } = parse(s);
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(root.children).toHaveLength(1);
  return root.children[0]!;
};
const texts = (r: Row) => r.children.map((c) => ("text" in c ? c.text : c.kind));

describe("parseLatex — atoms", () => {
  it("parses identifiers, numbers and operators", () => {
    const { root } = parse("F = m a + 3.14 - 2");
    expect(texts(root)).toEqual(["F", "=", "m", "a", "+", "3.14", "−", "2"]);
    expect(root.children[1]).toMatchObject({ kind: "operator", opClass: "relation" });
  });

  it("maps Greek and symbol commands to Unicode", () => {
    const { root } = parse("\\alpha \\Omega \\partial \\nabla \\infty \\leq \\times");
    expect(texts(root)).toEqual(["α", "Ω", "∂", "∇", "∞", "≤", "×"]);
  });

  it("accepts Unicode characters typed directly", () => {
    const { root } = parse("α ≤ β");
    expect(root.children[1]).toMatchObject({ kind: "operator", text: "≤", opClass: "relation" });
  });

  it("keeps text verbatim", () => {
    expect(only("\\text{if } ")).toEqual({ kind: "text", text: "if " });
  });
});

describe("parseLatex — structures", () => {
  it("fractions", () => {
    expect(only("\\frac{a}{b+1}")).toMatchObject({ kind: "fraction", bar: true, num: { children: [{ text: "a" }] } });
    expect(only("\\dfrac12")).toMatchObject({ kind: "fraction", size: "display", num: { children: [{ text: "1" }] }, den: { children: [{ text: "2" }] } });
  });

  it("scripts follow TeX single-token rule (x^23 = x² 3)", () => {
    const { root } = parse("x^23");
    expect(root.children).toHaveLength(2);
    expect(root.children[0]).toMatchObject({ kind: "scripts", sup: { children: [{ text: "2" }] } });
  });

  it("sub and sup in either order", () => {
    expect(only("x_i^2")).toMatchObject({ kind: "scripts", sub: { children: [{ text: "i" }] }, sup: { children: [{ text: "2" }] } });
    expect(only("x^2_i")).toMatchObject({ kind: "scripts", sub: { children: [{ text: "i" }] }, sup: { children: [{ text: "2" }] } });
  });

  it("primes", () => {
    expect(only("f''")).toMatchObject({ kind: "scripts", sup: { children: [{ text: "′" }, { text: "′" }] } });
  });

  it("roots", () => {
    expect(only("\\sqrt{x}")).toMatchObject({ kind: "radical", body: { children: [{ text: "x" }] } });
    expect(only("\\sqrt[3]{x}")).toMatchObject({ kind: "radical", index: { children: [{ text: "3" }] } });
  });

  it("large operators capture their body up to a relation", () => {
    const { root } = parse("\\sum_{i=1}^{n} a_i + b = c");
    const sum = root.children[0]!;
    expect(sum).toMatchObject({ kind: "nary", op: "∑", limits: "auto" });
    if (sum.kind !== "nary") throw new Error();
    expect(sum.body.children).toHaveLength(1); // stops at "+"
    expect(texts(root).slice(1)).toEqual(["+", "b", "=", "c"]);
  });

  it("nested sums", () => {
    const sum = only("\\sum_i \\sum_j a_{ij}");
    if (sum.kind !== "nary") throw new Error();
    expect(sum.body.children[0]).toMatchObject({ kind: "nary", body: { children: [{ kind: "scripts" }] } });
  });

  it("integrals with differential and \\limits", () => {
    const int = only("\\int\\limits_0^\\infty e^{-x^2}\\,\\mathrm{d}x");
    expect(int).toMatchObject({ kind: "nary", op: "∫", limits: "limits" });
    if (int.kind !== "nary") throw new Error();
    expect(int.body.children.map((c) => c.kind)).toEqual(["scripts", "space", "ident", "ident"]);
    expect(int.body.children[2]).toMatchObject({ text: "d", variant: "normal" });
  });

  it("contour and multiple integrals", () => {
    expect(only("\\oint_C \\vec F")).toMatchObject({ kind: "nary", op: "∮" });
    expect(only("\\iiint_V \\rho")).toMatchObject({ kind: "nary", op: "∭" });
  });

  it("functions capture arguments", () => {
    expect(only("\\sin^2\\theta")).toMatchObject({ kind: "function", name: "sin", sup: { children: [{ text: "2" }] }, arg: { children: [{ text: "θ" }] } });
    expect(only("\\exp(-x)")).toMatchObject({ kind: "function", arg: { children: [{ text: "(" }, { text: "−" }, { text: "x" }, { text: ")" }] } });
    const lim = only("\\lim_{x\\to 0}\\frac{\\sin x}{x}");
    expect(lim).toMatchObject({ kind: "function", name: "lim", limits: true, sub: { children: [{ text: "x" }, { text: "→" }, { text: "0" }] } });
    if (lim.kind !== "function") throw new Error();
    expect(lim.arg.children[0]).toMatchObject({ kind: "fraction" });
  });

  it("operatorname", () => {
    expect(only("\\operatorname{tr} A")).toMatchObject({ kind: "function", name: "tr", limits: false, arg: { children: [{ text: "A" }] } });
  });

  it("stretchy delimiters with \\middle", () => {
    const d = only("\\left\\{ x \\middle| x>0 \\right\\}");
    expect(d).toMatchObject({ kind: "delimited", open: "{", close: "}", separator: "|" });
    if (d.kind !== "delimited") throw new Error();
    expect(d.parts).toHaveLength(2);
    expect(only("\\left. \\frac{df}{dx} \\right|_{x=0}")).toMatchObject({ kind: "scripts", base: { children: [{ kind: "delimited", open: "", close: "|" }] } });
  });

  it("accents and fonts", () => {
    expect(only("\\vec{F}")).toMatchObject({ kind: "accent", accent: "vec" });
    expect(only("\\dot{\\theta}")).toMatchObject({ kind: "accent", accent: "dot" });
    expect(only("\\mathbf{v}")).toMatchObject({ kind: "ident", text: "v", variant: "bold" });
    expect(only("\\mathbb{R}")).toMatchObject({ kind: "ident", variant: "double-struck" });
  });

  it("binomials", () => {
    expect(only("\\binom{n}{k}")).toMatchObject({ kind: "delimited", open: "(", parts: [{ children: [{ kind: "fraction", bar: false }] }] });
  });

  it("over/under braces with annotations", () => {
    expect(only("\\underbrace{a+b}_{n}")).toMatchObject({ kind: "stack", position: "under", brace: true, annotation: { children: [{ text: "n" }] } });
    expect(only("\\overset{!}{=}")).toMatchObject({ kind: "stack", position: "over", brace: false });
  });

  it("tensor prescripts", () => {
    expect(only("{}^{a}_{b}T")).toMatchObject({ kind: "prescripts", base: { children: [{ text: "T" }] }, sub: { children: [{ text: "b" }] } });
  });
});

describe("parseLatex — environments", () => {
  it("matrices", () => {
    const m = only("\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}");
    expect(m).toMatchObject({ kind: "matrix", matrixKind: "pmatrix" });
    if (m.kind !== "matrix") throw new Error();
    expect(m.rows.map((r) => r.length)).toEqual([2, 2]);
  });

  it("drops the empty row after a trailing \\\\", () => {
    const m = only("\\begin{bmatrix} 1 \\\\ 2 \\\\ \\end{bmatrix}");
    if (m.kind !== "matrix") throw new Error();
    expect(m.rows).toHaveLength(2);
  });

  it("cases", () => {
    const c = only("|x| = \\begin{cases} x & x \\ge 0 \\\\ -x & x < 0 \\end{cases}".replace(/^\|x\| = /, ""));
    expect(c).toMatchObject({ kind: "cases" });
    if (c.kind !== "cases") throw new Error();
    expect(c.rows).toHaveLength(2);
    expect(c.rows[0]).toHaveLength(2);
  });

  it("aligned derivations", () => {
    const a = only("\\begin{aligned} (a+b)^2 &= (a+b)(a+b) \\\\ &= a^2 + 2ab + b^2 \\end{aligned}");
    expect(a).toMatchObject({ kind: "aligned", env: "aligned" });
    if (a.kind !== "aligned") throw new Error();
    expect(a.rows.map((r) => r.length)).toEqual([2, 2]);
    expect(a.rows[1]![0]!.children).toHaveLength(0);
  });

  it("align* normalises to aligned", () => {
    expect(only("\\begin{align*} x &= 1 \\end{align*}")).toMatchObject({ kind: "aligned", env: "aligned" });
  });
});

describe("parseLatex — diagnostics", () => {
  it("reports a missing brace with its position", () => {
    const { diagnostics } = parse("\\frac{a}{b");
    expect(diagnostics[0]).toMatchObject({ severity: "error", message: "Missing closing brace '}'" });
  });

  it("reports each problem once", () => {
    expect(parse("\\frac{a}{b").diagnostics).toHaveLength(1);
    expect(parse("{{x").diagnostics).toHaveLength(2);
  });

  it("keeps unknown commands as raw nodes", () => {
    const { root, diagnostics } = parse("\\foo x");
    expect(root.children[0]).toMatchObject({ kind: "raw", latex: "\\foo" });
    expect(diagnostics[0]).toMatchObject({ severity: "warning", start: 0, end: 4 });
  });

  it("reports missing \\right", () => {
    expect(parse("\\left( x").diagnostics.some((d) => d.message === "Missing \\right")).toBe(true);
  });

  it("reports mismatched environments", () => {
    expect(parse("\\begin{matrix} a \\end{pmatrix}").diagnostics[0]!.message).toContain("closed by");
  });

  it("never throws on garbage", () => {
    for (const s of ["}", "^", "_{", "\\", "\\left", "&&", "\\begin{", "\\sqrt[", "{{{", "a^^b"]) {
      expect(() => parse(s)).not.toThrow();
    }
  });
});
