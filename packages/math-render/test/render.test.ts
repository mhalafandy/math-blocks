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
