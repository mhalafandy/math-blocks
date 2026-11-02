import { describe, expect, it } from "vitest";
import { XMLValidator } from "fast-xml-parser";
import { parseLatex } from "@mathblocks/math-latex";
import { walk } from "@mathblocks/math-core";
import { toOmml, TUNED_PROFILE, WORD_DEFAULT_PROFILE } from "../src";
import { REFERENCE_EQUATIONS } from "../../../fixtures/reference-equations";

const omml = (latex: string, display = false, profile = WORD_DEFAULT_PROFILE) =>
  toOmml(parseLatex(latex).root, { display, standalone: true, profile });

/** Strips run font properties so expectations stay readable. */
const lean = (xml: string) =>
  xml
    .replace(/<m:ctrlPr>.*?<\/m:ctrlPr>/g, "")
    .replace(/<w:rPr><w:rFonts[^>]*\/><\/w:rPr>/g, "")
    .replace(/ xml:space="preserve"/g, "")
    .replace(/ xmlns:\w+="[^"]*"/g, "")
    .replace(/<(m:\w+Pr)><\/\1>/g, "<$1/>");

describe("toOmml — structures", () => {
  it("fraction", () => {
    expect(lean(omml("\\frac{a}{b}"))).toBe(
      "<m:oMath><m:f><m:fPr/><m:num><m:r><m:t>a</m:t></m:r></m:num><m:den><m:r><m:t>b</m:t></m:r></m:den></m:f></m:oMath>",
    );
  });

  it("sub/superscripts", () => {
    expect(lean(omml("x_i^2"))).toBe(
      "<m:oMath><m:sSubSup><m:sSubSupPr/><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sub><m:r><m:t>i</m:t></m:r></m:sub><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSubSup></m:oMath>",
    );
  });

  it("square root hides the degree", () => {
    expect(lean(omml("\\sqrt{x}"))).toContain('<m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>');
  });

  it("sum uses under/over limits, integral uses side limits", () => {
    expect(lean(omml("\\sum_{i=1}^n a_i"))).toContain('<m:chr m:val="∑"/><m:limLoc m:val="undOvr"/>');
    expect(lean(omml("\\int_0^1 f"))).toContain('<m:chr m:val="∫"/><m:limLoc m:val="subSup"/>');
    expect(lean(omml("\\int\\limits_0^1 f"))).toContain('<m:limLoc m:val="undOvr"/>');
  });

  it("missing limits are hidden", () => {
    expect(lean(omml("\\oint f"))).toContain('<m:subHide m:val="1"/><m:supHide m:val="1"/>');
  });

  it("stretchy delimiters with separator and empty side", () => {
    expect(lean(omml("\\left\\{ x \\middle| x>0 \\right."))).toContain(
      '<m:dPr><m:begChr m:val="{"/><m:sepChr m:val="|"/><m:endChr m:val=""/></m:dPr>',
    );
  });

  it("function names are upright, lim puts the limit underneath", () => {
    expect(lean(omml("\\sin x"))).toBe(
      '<m:oMath><m:func><m:funcPr/><m:fName><m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t>sin</m:t></m:r></m:fName><m:e><m:r><m:t>x</m:t></m:r></m:e></m:func></m:oMath>',
    );
    expect(lean(omml("\\lim_{x\\to 0} f"))).toContain("<m:fName><m:limLow>");
  });

  it("accents and bars", () => {
    expect(lean(omml("\\vec{F}"))).toContain('<m:accPr><m:chr m:val="⃗"/></m:accPr>');
    expect(lean(omml("\\overline{z}"))).toContain('<m:barPr><m:pos m:val="top"/></m:barPr>');
  });

  it("vector style profile can render vectors bold instead of arrows", () => {
    const xml = omml("\\vec{F}", false, { ...WORD_DEFAULT_PROFILE, vectorStyle: "bold" });
    expect(xml).not.toContain("m:acc");
    expect(xml).toContain('<m:sty m:val="b"/>');
  });

  it("font variants", () => {
    expect(lean(omml("\\mathrm{d}"))).toContain('<m:sty m:val="p"/>');
    expect(lean(omml("\\mathbb{R}"))).toContain('<m:scr m:val="double-struck"/><m:sty m:val="p"/>');
  });

  it("text uses normal (non-math) runs", () => {
    expect(lean(omml("\\text{if }"))).toContain("<m:r><m:rPr><m:nor/></m:rPr><m:t>if </m:t></m:r>");
  });

  it("matrices: delimiters, column count, profile spacing", () => {
    const def = lean(omml("\\begin{pmatrix} a & b \\\\ c \\end{pmatrix}"));
    expect(def).toContain('<m:begChr m:val="("/>');
    expect(def).toContain('<m:count m:val="2"/>');
    expect(def).toContain("<m:mr><m:e><m:r><m:t>c</m:t></m:r></m:e><m:e/></m:mr>"); // padded
    const tuned = lean(omml("\\begin{pmatrix} a \\end{pmatrix}", false, TUNED_PROFILE));
    expect(tuned).toContain('<m:rSpRule m:val="1"/>');
    expect(tuned).toContain('<m:cGpRule m:val="1"/>');
  });

  it("the tuned profile pads matrix brackets by default (user's choice, D-017)", () => {
    expect(TUNED_PROFILE.matrix.bracketPadding).toBe("scripts");
    expect(omml("\\begin{bmatrix} 0 & y & z \\end{bmatrix}^{\\mathbf{T}}", false, TUNED_PROFILE)).toContain("<m:phant>");
  });

  it("matrix bracket padding adds an invisible zero-width strut inside the brackets", () => {
    const base = { ...WORD_DEFAULT_PROFILE, matrix: { bracketPadding: "scripts" as const } };
    const xml = lean(omml("\\begin{bmatrix} a \\end{bmatrix}", false, base));
    expect(xml).toContain('<m:phant><m:phantPr><m:show m:val="0"/><m:zeroWid m:val="1"/></m:phantPr>');
    expect(xml.match(/<m:m>/g)).toHaveLength(2); // strut copy + visible matrix
    const match = lean(omml("\\begin{bmatrix} a \\end{bmatrix}", false, { ...WORD_DEFAULT_PROFILE, matrix: { bracketPadding: "match" } }));
    expect(match).toContain('<m:shp m:val="match"/>');
  });

  it("aligned derivations mark alignment points", () => {
    const xml = lean(omml("\\begin{aligned} a &= b \\\\ &= c \\end{aligned}"));
    expect(xml).toContain("<m:eqArr>");
    expect(xml.match(/<m:aln\/>/g)).toHaveLength(2);
    expect(xml).toContain('<m:r><m:rPr><m:aln/></m:rPr><m:t>=</m:t></m:r>');
  });

  it("cases use a left brace around an equation array", () => {
    const xml = lean(omml("\\begin{cases} x & x>0 \\\\ 0 & \\text{otherwise} \\end{cases}"));
    expect(xml).toContain('<m:begChr m:val="{"/><m:endChr m:val=""/>');
    expect(xml).toContain("<m:eqArr>");
  });

  it("display equations are wrapped in oMathPara", () => {
    expect(omml("x", true)).toMatch(/^<m:oMathPara [^>]*><m:oMathParaPr><m:jc m:val="centerGroup"\/><\/m:oMathParaPr><m:oMath>/);
  });

  it("escapes XML special characters", () => {
    expect(omml("a<b")).toContain("<m:t xml:space=\"preserve\">&lt;</m:t>");
    expect(omml("\\text{R&D}")).toContain("R&amp;D");
  });

  it("writes the profile font on every run", () => {
    const xml = toOmml(parseLatex("x+1").root, { profile: { ...TUNED_PROFILE, mathFont: "STIX Two Math" } });
    expect(xml.match(/w:ascii="STIX Two Math"/g)).toHaveLength(3);
  });
});

describe("toOmml — reference equations", () => {
  for (const eq of REFERENCE_EQUATIONS) {
    it(`${eq.id} converts to well-formed OMML without unparsed parts`, () => {
      const { root } = parseLatex(eq.latex);
      walk(root, (n) => expect(n.kind).not.toBe("raw"));
      const xml = toOmml(root, { display: eq.display, standalone: true, profile: TUNED_PROFILE });
      expect(XMLValidator.validate(xml)).toBe(true);
    });
  }
});
