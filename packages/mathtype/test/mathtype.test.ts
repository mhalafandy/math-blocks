import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { readOmml } from "@mathblocks/math-omml";
import { parseTag } from "@mathblocks/ooxml";
import { convertDocx, convertFlatOpc, mathTypeObjectToLatex, mtefToLatex, readCfb, readMtef } from "../src";
import { ch, docx, line, mathTypeObject, matrix, mtef, nullLine, numberedParagraph, objectRun, pile, tf, tmpl, v } from "./build";

const latexOf = (...content: number[][]) => {
  const eq = readMtef(mtef(...content));
  return mtefToLatex(eq.items).latex;
};
const sub = (...s: number[][]) => tmpl(27, 0, line(...s), nullLine());
const sup = (...s: number[][]) => tmpl(28, 0, nullLine(), line(...s));
const eqSign = ch(tf.sym, "=");

describe("compound files", () => {
  it("reads streams by name", () => {
    const data = new Uint8Array(1500).map((_, i) => i % 251);
    const f = readCfb(mathTypeObject(new Uint8Array([5, 1, 2])));
    expect([...f.keys()]).toEqual(["\u0001CompObj", "Equation Native"]);
    const big = readCfb(mathTypeObject(data));
    expect(big.get("Equation Native")!.data.subarray(28)).toEqual(data);
  });
});

describe("MTEF records", () => {
  it("skips formatting records and reads MathType's TeX annotation", () => {
    const eq = readMtef(mtef(line(v("x"))));
    expect(eq.product).toBe("DSMT7 7.9");
    expect(eq.tex).toBe("x");
    expect(eq.items).toHaveLength(1);
  });

  it("rejects MTEF versions before MathType 4", () => {
    expect(() => readMtef(new Uint8Array([3, 0, 1, 0, 0]))).toThrow(/version 3/);
  });
});

describe("MathType → LaTeX", () => {
  it("variables, numbers, Greek and operators", () => {
    expect(latexOf(line(v("E"), eqSign, v("m"), ch(tf.v, "c"), sup(ch(tf.num, "2"))))).toBe("E=mc^{2}");
    expect(latexOf(line(ch(tf.lcGreek, 0x3c3), sub(v("sf")), ch(tf.sym, 0x2264), ch(tf.lcGreek, 0x3d5)))).toBe("\\sigma _{sf}\\leq \\phi");
  });

  it("vectors are bold; harpoon and arrow decorations are kept", () => {
    expect(latexOf(line(ch(tf.vec, "c", [14]), sub(v("i"))))).toBe("\\overrightharpoon{\\mathbf{c}}_{i}");
    expect(latexOf(line(ch(tf.vec, "S", [11])))).toBe("\\vec{\\mathbf{S}}");
    expect(latexOf(line(tmpl(31, 2, line(ch(tf.vec, "B")), ch(tf.expand, 0x20d7))))).toBe("\\vec{\\mathbf{B}}");
    expect(latexOf(line(ch(tf.v, "s", [9]), sub(ch(tf.num, "2"))))).toBe("\\hat{s}_{2}");
    expect(latexOf(line(ch(tf.lcGreek, 0x3c9, [2])))).toBe("\\dot{\\omega}");
    expect(latexOf(line(ch(tf.vec, 0x3c9)))).toBe("\\boldsymbol{\\omega}");
  });

  it("text-style d is an upright differential; functions are recognised", () => {
    expect(latexOf(line(ch(tf.text, "d"), v("m")))).toBe("\\mathrm{d}m");
    expect(latexOf(line(...[..."cos"].map((c) => ch(tf.fn, c)), ch(tf.lcGreek, 0x3d5)))).toBe("\\cos \\phi");
  });

  it("spaces", () => {
    expect(latexOf(line(v("a"), ch(tf.space, 0xef07), v("b"), ch(tf.space, 0xef06), v("c")))).toBe("a\\,b\\qquad c");
  });

  it("fractions, roots and integrals with limits", () => {
    expect(latexOf(line(tmpl(11, 0, line(v("a")), line(ch(tf.num, "2")))))).toBe("\\frac{a}{2}");
    expect(latexOf(line(tmpl(10, 0, line(ch(tf.num, "2")), nullLine())))).toBe("\\sqrt{2}");
    const integral = tmpl(15, 0x31, line(v("y")), line(ch(tf.num, "0")), line(v("a")), ch(tf.sym, 0x222b));
    expect(latexOf(line(integral, ch(tf.text, "d"), v("y")))).toBe("\\int_{0}^{a}y\\mathrm{d}y");
    const under = tmpl(15, 0x51, line(v("r")), line(ch(tf.vec, "B")), nullLine(), ch(tf.sym, 0x222b));
    expect(latexOf(line(under))).toBe("\\int\\limits_{\\mathbf{B}}r");
  });

  it("bracketed matrices become bmatrix, transposed", () => {
    const m = matrix(1, 3, line(ch(tf.num, "0")), line(v("y")), line(v("z")));
    const fenced = tmpl(3, 3, line(m), ch(tf.expand, "["), ch(tf.expand, "]"));
    expect(latexOf(line(fenced, sup(ch(tf.v, "T"))))).toBe("\\begin{bmatrix}0&y&z\\end{bmatrix}^{T}");
  });

  it("multi-line piles become aligned equations", () => {
    const p = pile(1, line(v("a"), eqSign, v("b")), line(v("c"), eqSign, v("d")));
    expect(latexOf(line(p))).toBe("\\begin{aligned}&a=b\\\\&c=d\\end{aligned}");
    const rel = pile(4, line(v("a"), eqSign, v("b")), line(v("c"), eqSign, v("d")));
    expect(latexOf(line(rel))).toBe("\\begin{aligned}a&=b\\\\c&=d\\end{aligned}");
  });

  it("a left brace around a pile is a piecewise definition", () => {
    const rows = pile(1, line(v("x"), ch(tf.marker, 9), v("a")), line(v("y"), ch(tf.marker, 9), v("b")));
    expect(latexOf(line(tmpl(2, 1, line(rows), ch(tf.expand, "{"), nullLine())))).toBe("\\begin{cases}x&a\\\\y&b\\end{cases}");
  });

  it("every result parses without errors", () => {
    for (const l of ["\\overrightharpoon{\\mathbf{p}}_{k}=\\int\\limits_{\\mathbf{V}_{k}}\\overrightharpoon{\\mathbf{x}}_{k}\\,\\mathrm{d}m", "\\begin{aligned}&a=b\\\\&c=d\\end{aligned}"]) {
      expect(parseLatex(l).diagnostics).toEqual([]);
    }
  });

  it("unknown templates keep their contents and warn", () => {
    const r = mtefToLatex(readMtef(mtef(line(tmpl(99, 0, line(v("x")))))).items);
    expect(r.latex).toBe("x");
    expect(r.warnings[0]).toMatch(/template 99/);
  });
});

describe("document conversion", () => {
  const eq1 = mathTypeObject(mtef(line(ch(tf.vec, "F"), eqSign, v("m"), ch(tf.vec, "a"))));
  const eq2 = mathTypeObject(mtef(line(v("x"))));
  const eq3 = mathTypeObject(mtef(line(tmpl(11, 0, line(v("a")), line(v("b"))))));

  it("reads a whole OLE object", () => {
    expect(mathTypeObjectToLatex(eq1).latex).toBe("\\mathbf{F}=m\\mathbf{a}");
  });

  it("Classic pictures keep the planned IDs: in the alt text, the title and (via the picture callback) the hidden source", () => {
    const input = docx([numberedParagraph(1, "A.1"), `<w:p><w:r><w:t xml:space="preserve">where </w:t></w:r>${objectRun(2)}</w:p>`], [eq1, eq2]);
    const plan = convertDocx(input);
    const tags = plan.equations.map((e) => e.tag);
    expect(tags.every((t) => t && parseTag(t))).toBe(true);
    const seen: string[] = [];
    const pic = { emf: new Uint8Array([1, 2, 3, 4]), svg: "<svg/>", png: new Uint8Array(), widthPt: 10, heightPt: 12, depthPt: 3 };
    const r = convertDocx(input, { tags, picture: (_l, _d, tag) => (seen.push(tag), pic) });
    expect(seen).toEqual(tags); // the picture is typeset with the ID that ends up on it
    expect(r.equations.map((e) => e.tag)).toEqual(tags);
    const doc = strFromU8(unzipSync(r.docx)["word/document.xml"]!);
    for (const t of tags) {
      expect(doc).toContain(`(${t}): `); // alt text "MathBlocks numbered (mb1|-|…): …"
      expect(doc).toContain(`title="${t}"`);
    }
    expect(doc).not.toContain("<w:sdt"); // a Classic picture is the equation, no content control
  });

  it("replaces MathType objects by native equations, keeping numbers and bookmarks", () => {
    const input = docx(
      [
        numberedParagraph(1, "A.1"),
        `<w:p><w:r><w:t xml:space="preserve">where </w:t></w:r>${objectRun(2)}<w:r><w:t xml:space="preserve"> is the position.</w:t></w:r></w:p>`,
        `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${objectRun(3)}</w:p>`,
      ],
      [eq1, eq2, eq3],
    );
    const r = convertDocx(input);
    expect(r.converted).toBe(3);
    expect(r.equations.map((e) => [e.display, e.number, e.latex])).toEqual([
      [true, "(A.1)", "\\mathbf{F}=m\\mathbf{a}"],
      [false, null, "x"],
      [true, null, "\\frac{a}{b}"],
    ]);

    const files = unzipSync(r.docx);
    const doc = strFromU8(files["word/document.xml"]!);
    expect(doc).not.toContain("<w:object");
    expect(doc).not.toContain("mb-converted");
    // Numbered equation: tabs, field and bookmark untouched, math inline between them.
    expect(doc).toMatch(/<w:tab\/><\/w:r><w:sdt>.*?<m:oMath>.*?<\/w:sdt><w:r><w:tab\/><\/w:r><w:bookmarkStart w:id="1" w:name="ZEqnNum1"\/>.*MACROBUTTON MTPlaceRef/s);
    // Alone in its paragraph: a display equation.
    expect(doc).toMatch(/<w:jc w:val="center"\/><\/w:pPr><w:sdt>.*?<m:oMathPara>/s);
    // Tags identify MathBlocks equations; boxes are hidden.
    const tags = [...doc.matchAll(/<w:tag w:val="([^"]+)"/g)].map((m) => parseTag(m[1]));
    expect(tags.every((t) => t && t.blockId === null)).toBe(true);
    expect(doc.match(/w15:appearance w15:val="hidden"/g)).toHaveLength(3);
    // OMML round-trips to the same LaTeX.
    const first = /<m:oMath>.*?<\/m:oMath>/s.exec(doc)![0];
    expect(serializeLatex(readOmml(first.replace("<m:oMath>", `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`))!.root)).toBe("\\mathbf{F}=m\\mathbf{a}");
    // Embedded objects and their previews are gone.
    expect(Object.keys(files).filter((n) => /embeddings|media/.test(n))).toEqual([]);
    expect(strFromU8(files["word/_rels/document.xml.rels"]!)).not.toContain("oleObject");
  });

  it("skips objects it cannot read and leaves them in place", () => {
    const input = docx([`<w:p>${objectRun(1)}</w:p>`], [new Uint8Array(600)]);
    const r = convertDocx(input);
    expect(r.skipped).toBe(1);
    expect(r.equations[0]!.messages[0]).toMatch(/OLE/);
    const files = unzipSync(r.docx);
    expect(strFromU8(files["word/document.xml"]!)).toContain("<w:object");
    expect(files["word/embeddings/oleObject1.bin"]).toBeDefined();
  });

  it("converts a Flat OPC package from Word (Range.WordOpenXML)", () => {
    const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64").replace(/(.{76})/g, "$1\n");
    const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"';
    const flat = `<?xml version="1.0" standalone="yes"?><?mso-application progid="Word.Document"?><pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage">` +
      `<pkg:part pkg:name="/word/document.xml" pkg:contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"><pkg:xmlData><w:document ${ns}><w:body>${numberedParagraph(1, "2.3")}</w:body></w:document></pkg:xmlData></pkg:part>` +
      `<pkg:part pkg:name="/word/_rels/document.xml.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml"><pkg:xmlData><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdOle1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="embeddings/oleObject1.bin"/></Relationships></pkg:xmlData></pkg:part>` +
      `<pkg:part pkg:name="/word/embeddings/oleObject1.bin" pkg:contentType="application/vnd.openxmlformats-officedocument.oleObject" pkg:compression="store"><pkg:binaryData>${b64(eq1)}</pkg:binaryData></pkg:part></pkg:package>`;
    const r = convertFlatOpc(flat);
    expect(r.equations.map((e) => [e.status, e.number, e.latex])).toEqual([["converted", "(2.3)", "\\mathbf{F}=m\\mathbf{a}"]]);
    expect(r.flatOpc).not.toContain("<w:object");
    expect(r.flatOpc).toContain("<m:oMath>");
    expect(r.flatOpc).toContain("MACROBUTTON MTPlaceRef");
    expect(convertFlatOpc(flat.replace(/<w:object[\s\S]*<\/w:object>/, "")).flatOpc).toBeNull();
  });
});
