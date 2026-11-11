import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { writeCfb } from "@mathblocks/ooxml";
import { convertDocx, mathTypeObjectToLatex, readCfb, SYNTHETIC_EQUATIONS, syntheticMathTypeDocument, syntheticMathTypeObject } from "../src";

/**
 * Convert MathType on a small synthetic MathType document (generic equations, appendix numbering,
 * MTDisplayEquation paragraphs, an inline equation, two references): only the MathType objects may
 * change — every paragraph's properties must be byte-identical, numbers and references kept.
 */
const paragraphs = (xml: string) => [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((m) => m[0]);
const pPr = (p: string) => /^<w:p\b[^>]*>(<w:pPr>[\s\S]*?<\/w:pPr>)?/.exec(p)![1] ?? "";
const count = (xml: string, re: RegExp) => (xml.match(re) ?? []).length;

describe("synthetic MathType document", () => {
  const doc = syntheticMathTypeDocument();
  const before = strFromU8(unzipSync(doc.docx)["word/document.xml"]!);
  const plan = convertDocx(doc.docx);
  const tags = plan.equations.map((e) => e.tag);
  const out = convertDocx(doc.docx, {
    tags,
    picture: (latex, _d, tag) => ({
      emf: new Uint8Array([1, 2, 3, 4]),
      svg: "<svg/>",
      png: new Uint8Array(),
      widthPt: 20,
      heightPt: 14,
      depthPt: 4,
      object: writeCfb({ MathBlocks: new TextEncoder().encode(JSON.stringify({ version: 1, latex, tag })) }),
    }),
  });
  const files = unzipSync(out.docx);
  const after = strFromU8(files["word/document.xml"]!);

  it("each synthetic object reads back as its LaTeX", () => {
    for (const [name, e] of Object.entries(SYNTHETIC_EQUATIONS)) {
      expect(readCfb(syntheticMathTypeObject(name as keyof typeof SYNTHETIC_EQUATIONS)).has("Equation Native"), name).toBe(true);
      expect(mathTypeObjectToLatex(syntheticMathTypeObject(name as keyof typeof SYNTHETIC_EQUATIONS)).latex, name).toBe(e.latex);
    }
  });

  it("converts all five equations (four numbered display, one inline) to MathBlocks objects", () => {
    expect(plan.converted).toBe(5);
    expect(plan.equations.map((e) => [e.display, e.number])).toEqual(doc.equations.map((e) => [e.display, e.number]));
    expect(after).not.toContain('ProgID="Equation.DSMT4"');
    expect(count(after, /ProgID="MathBlocks\.Equation\.1"/g)).toBe(5);
  });

  it("keeps every paragraph's properties byte-identical", () => {
    const a = paragraphs(before);
    const b = paragraphs(after);
    expect(b.length).toBe(a.length);
    expect(a.map((p, i) => [i, pPr(p), pPr(b[i]!)]).filter(([, x, y]) => x !== y)).toEqual([]);
  });

  it("keeps the MTDisplayEquation paragraphs, the numbers, the bookmarks and the references", () => {
    expect(count(after, /<w:pStyle w:val="MTDisplayEquation"\/>/g)).toBe(4);
    expect(count(after, /<w:pStyle w:val="MTDisplayEquation"\/>/g)).toBe(count(before, /<w:pStyle w:val="MTDisplayEquation"\/>/g));
    expect(count(after, /MACROBUTTON MTPlaceRef/g)).toBe(4);
    expect(count(after, /w:name="ZEqnNum\d+"/g)).toBe(4);
    expect(count(after, /REF ZEqnNum\d+/g)).toBe(2);
  });
});
