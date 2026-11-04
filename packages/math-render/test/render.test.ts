import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLatex } from "@mathblocks/math-latex";
import { emfComment, loadFont, renderEmf, renderSvg, type FontSet } from "../src";
import { REFERENCE_EQUATIONS } from "../../../fixtures/reference-equations";

const L = "/usr/share/fonts/truetype/liberation/LiberationSerif-";
const STIX = new URL("../node_modules/@fontsource/stix-two-math/files/stix-two-math-latin-400-normal.woff", import.meta.url);
const available = existsSync(L + "Regular.ttf") && existsSync(STIX);

describe.skipIf(!available)("MathBlocks typesetting engine", () => {
  const fonts: FontSet = available
    ? {
        regular: loadFont(readFileSync(L + "Regular.ttf")),
        italic: loadFont(readFileSync(L + "Italic.ttf")),
        bold: loadFont(readFileSync(L + "Bold.ttf")),
        boldItalic: loadFont(readFileSync(L + "BoldItalic.ttf")),
        math: loadFont(readFileSync(STIX)),
      }
    : (null as unknown as FontSet);

  it("renders every reference equation to a finite, non-empty SVG", () => {
    for (const eq of REFERENCE_EQUATIONS) {
      const r = renderSvg(parseLatex(eq.latex).root, { fonts, display: eq.display });
      expect(Number.isFinite(r.widthPt) && r.widthPt > 0, eq.title).toBe(true);
      expect(Number.isFinite(r.heightPt) && r.heightPt > 0, eq.title).toBe(true);
      expect(r.svg).not.toContain("NaN");
      expect(r.svg).toMatch(/<path /);
    }
  });

  it("puts fractions on the math axis and scripts above the baseline", () => {
    const frac = renderSvg(parseLatex("\\frac{a}{b}").root, { fonts });
    expect(frac.box.h).toBeGreaterThan(0.6);
    expect(frac.box.d).toBeGreaterThan(0.3);
    const sup = renderSvg(parseLatex("x^2").root, { fonts });
    expect(sup.box.h).toBeGreaterThan(0.6);
  });

  it("centres multi-line piles and matrices where MathType does (numbers sit level with them)", () => {
    for (const latex of ["\\begin{aligned}a&=b\\\\&=c\\\\&=d\\end{aligned}", "\\begin{bmatrix}1&0&0\\\\0&c&s\\\\0&-s&c\\end{bmatrix}", "\\begin{cases}1&x>0\\\\0&x\\le 0\\end{cases}"]) {
      const b = renderSvg(parseLatex(latex).root, { fonts }).box;
      expect(Math.abs((b.h - b.d) / 2 - 0.246), latex).toBeLessThan(0.01);
    }
  });

  it("multline: first line flush left, last line flush right; gathered: lines centred", () => {
    // One glyph per line: its x tells where the line sits.
    const xs = (latex: string) => {
      const r = renderSvg(parseLatex(latex).root, { fonts });
      const gs = r.box.items.filter((i) => i.k === "g").sort((a, b) => b.y - a.y);
      return { w: r.box.w, xs: gs.map((g) => g.x) };
    };
    const ml = xs("\\begin{multline}a\\\\ b\\\\ c\\end{multline}");
    expect(ml.xs[0]).toBeCloseTo(0, 2);
    expect(ml.xs[2]).toBeGreaterThan(ml.xs[1]!);
    expect(ml.xs[1]).toBeGreaterThan(ml.xs[0]!);
    expect(ml.w).toBeGreaterThan(1.4); // one em of stagger beyond the widest line
    const ga = xs("\\begin{gathered}a+b+c\\\\ d\\end{gathered}");
    const dx = ga.xs[ga.xs.length - 1]!;
    expect(dx).toBeGreaterThan(0.5); // centred under a+b+c, not flush right or left
    expect(dx).toBeLessThan(ga.w - 0.7);
  });

  it("golden: a 3-line derivation and a broken long equation (SVG snapshots)", async () => {
    const derivation = "\\begin{aligned}\\pvec[P/O]{r}&=\\dcm{b}{a}\\,\\cmat{c}\\\\ &=\\begin{bmatrix}c_\\theta&s_\\theta\\\\-s_\\theta&c_\\theta\\end{bmatrix}\\cmat{c}\\\\ &\\quad+\\crossmat{\\omega}\\,\\pvec{\\omega}_{2}\\end{aligned}";
    const broken = "\\begin{multline}T=\\frac{1}{2}m\\,\\dot{x}^{2}+\\frac{1}{2}m\\,\\dot{y}^{2}+\\frac{1}{2}m\\,\\dot{z}^{2}\\\\ +\\frac{1}{2}I_{1}\\omega_{1}^{2}+\\frac{1}{2}I_{2}\\omega_{2}^{2}\\\\ +\\frac{1}{2}I_{3}\\omega_{3}^{2}\\end{multline}";
    for (const [name, latex] of [["derivation-3-lines", derivation], ["multline-broken", broken]] as const) {
      const r = renderSvg(parseLatex(latex).root, { fonts, display: true });
      await expect(r.svg).toMatchFileSnapshot(`./golden/${name}.svg`);
    }
  });

  it("matrix brackets stay centred on their contents", () => {
    const r = renderSvg(parseLatex("\\begin{pmatrix}a\\\\b\\\\c\\end{pmatrix}").root, { fonts });
    expect(Math.abs((r.box.h - r.box.d) / 2 - 0.246)).toBeLessThan(0.02);
  });

  it("stretches brackets around tall contents", () => {
    const small = renderSvg(parseLatex("\\left(x\\right)").root, { fonts });
    const tall = renderSvg(parseLatex("\\left(\\frac{\\frac{a}{b}}{c}\\right)").root, { fonts });
    expect(tall.box.h + tall.box.d).toBeGreaterThan(small.box.h + small.box.d + 1);
  });

  it("writes a vector EMF that carries the equation's source", () => {
    const r = renderSvg(parseLatex("\\frac{a}{b}+\\sqrt{x}").root, { fonts });
    const emf = renderEmf(r, { comment: '{"latex":"\\\\frac{a}{b}"}' });
    const dv = new DataView(emf.buffer);
    expect(dv.getUint32(0, true)).toBe(1); // EMR_HEADER
    expect(dv.getUint32(40, true)).toBe(0x464d4520); // " EMF"
    expect(dv.getUint32(48, true)).toBe(emf.length); // nBytes
    expect(emfComment(emf)).toBe('{"latex":"\\\\frac{a}{b}"}');
  });
});
