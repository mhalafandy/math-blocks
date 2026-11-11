/**
 * Synthetic MathType data for tests and the Word self-test: MTEF records built by hand, the OLE
 * object MathType embeds ("Equation Native"), and a small MathType-style Word document with
 * generic content — appendix numbering (A.n), MTDisplayEquation paragraphs with MathType's tab
 * stops, one inline equation and two references. Nothing here comes from any user document.
 */
import { strToU8, zipSync } from "fflate";
import { compObjStream, objInfoStream, writeCfb } from "@mathblocks/ooxml";

// ------------------------------------------------------------------ MTEF records

export const tf = { text: 1, fn: 2, v: 3, lcGreek: 4, ucGreek: 5, sym: 6, vec: 7, num: 8, expand: 22, marker: 23, space: 24 };

const u16 = (n: number) => [n & 0xff, n >> 8];

export const line = (...items: number[][]) => [1, 0, ...items.flat(), 0];
export const nullLine = () => [1, 1];
export function ch(typeface: number, c: string | number, embells: number[] = []) {
  const code = typeof c === "number" ? c : c.codePointAt(0)!;
  const emb = embells.length ? [...embells.flatMap((e) => [6, 0, e]), 0] : [];
  return [2, embells.length ? 1 : 0, typeface + 128, ...u16(code), ...emb];
}
export const v = (s: string) => [...s].flatMap((c) => ch(tf.v, c));
export const tmpl = (selector: number, variation: number, ...slots: number[][]) => [3, 0, selector, variation, 0, ...slots.flat(), 0];
export const pile = (halign: number, ...lines: number[][]) => [4, 0, halign, 1, ...lines.flat(), 0];
export function matrix(rows: number, cols: number, ...cells: number[][]) {
  const partition = (n: number) => new Array(Math.ceil(((n + 1) * 2) / 8)).fill(0);
  return [5, 0, 1, 1, 1, rows, cols, ...partition(rows), ...partition(cols), ...cells.flat(), 0];
}

/** A whole MTEF v5 equation, with the formatting records MathType writes before the content. */
export function mtef(...content: number[][]) {
  const header = [5, 1, 0, 7, 9, ...strToU8("DSMT7"), 0, 1];
  const annotation = [...strToU8("TeX Input Language"), 0, ...strToU8("x"), 0];
  const future = [0x66, annotation.length, ...annotation];
  const encoding = [19, ...strToU8("MTCode"), 0];
  const font = [17, 1, ...strToU8("Times New Roman"), 0];
  const size = [9, 101, ...u16(240)];
  return new Uint8Array([...header, ...future, ...encoding, ...font, ...size, ...content.flat(), 0]);
}

// ------------------------------------------------------------------ generic equations

const eq = (...items: number[][]) => line(...items);
const sign = (c: string) => ch(tf.sym, c);
const sup = (...s: number[][]) => tmpl(28, 0, nullLine(), line(...s));

/** Generic equations (no user content): LaTeX they convert to, and their MTEF. */
export const SYNTHETIC_EQUATIONS = {
  x: { latex: "x", mtef: () => mtef(eq(v("x"))) },
  pythagoras: { latex: "a^{2}+b^{2}=c^{2}", mtef: () => mtef(eq(v("a"), sup(ch(tf.num, "2")), sign("+"), v("b"), sup(ch(tf.num, "2")), sign("="), v("c"), sup(ch(tf.num, "2")))) },
  fraction: { latex: "\\frac{a}{b}=y", mtef: () => mtef(eq(tmpl(11, 0, line(v("a")), line(v("b"))), sign("="), v("y"))) },
  matrix: {
    latex: "\\begin{bmatrix}0&y&z\\end{bmatrix}",
    mtef: () => mtef(eq(tmpl(3, 3, line(matrix(1, 3, line(ch(tf.num, "0")), line(v("y")), line(v("z")))), ch(tf.expand, "["), ch(tf.expand, "]")))),
  },
  force: { latex: "\\mathbf{F}=m\\mathbf{a}", mtef: () => mtef(eq(ch(tf.vec, "F"), sign("="), v("m"), ch(tf.vec, "a"))) },
} as const;
export type SyntheticEquation = keyof typeof SYNTHETIC_EQUATIONS;

/** MathType's class (Equation.DSMT4). */
const MATHTYPE_CLSID = "{0002CE03-0000-0000-C000-000000000046}";

/** The OLE object MathType embeds for an equation: CompObj, Ole, ObjInfo, "Equation Native" (28-byte header + MTEF). */
export function syntheticMathTypeObject(name: SyntheticEquation): Uint8Array {
  const m = SYNTHETIC_EQUATIONS[name].mtef();
  const native = new Uint8Array(28 + m.length);
  native[0] = 28;
  new DataView(native.buffer).setUint32(8, m.length, true);
  native.set(m, 28);
  const ole = new Uint8Array(20);
  new DataView(ole.buffer).setUint32(0, 0x02000001, true);
  return writeCfb(
    {
      "\u0001CompObj": compObjStream("MathType 7.0 Equation", "Equation.DSMT4", MATHTYPE_CLSID),
      "\u0001Ole": ole,
      "\u0003ObjInfo": objInfoStream(),
      "Equation Native": native,
    },
    MATHTYPE_CLSID,
  );
}

// ------------------------------------------------------------------ a MathType-style test document

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"';

/** A MathType object run as Word stores it (cached picture n, object n), lowered by `lowerHalfPt`. */
export const mathTypeRun = (n: number, widthPt = 40, heightPt = 18, lowerHalfPt = 12) =>
  `<w:r><w:rPr><w:position w:val="-${lowerHalfPt}"/></w:rPr><w:object w:dxaOrig="${widthPt * 20}" w:dyaOrig="${heightPt * 20}"><v:shape id="_x0000_i${1024 + n}" type="#_x0000_t75" style="width:${widthPt}pt;height:${heightPt}pt" o:ole=""><v:imagedata r:id="rIdImg${n}" o:title=""/></v:shape><o:OLEObject Type="Embed" ProgID="Equation.DSMT4" ShapeID="_x0000_i${1024 + n}" DrawAspect="Content" ObjectID="_${1200000000 + n}" r:id="rIdOle${n}"/></w:object></w:r>`;

export const text = (t: string) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
const MT_DISPLAY = `<w:pPr><w:pStyle w:val="MTDisplayEquation"/></w:pPr>`;

/** Numbered display paragraph as MathType writes it: tab, equation, tab, MACROBUTTON number with a ZEqnNum bookmark. */
export const numbered = (n: number, bookmark: number, label: string) =>
  `<w:p>${MT_DISPLAY}<w:r><w:tab/></w:r>${mathTypeRun(n)}<w:r><w:tab/></w:r><w:bookmarkStart w:id="${bookmark}" w:name="ZEqnNum${100000 + bookmark}"/>` +
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> MACROBUTTON MTPlaceRef \\* MERGEFORMAT </w:instrText></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
  `<w:r><w:instrText xml:space="preserve"> SEQ MTEqn \\h \\* MERGEFORMAT </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:instrText>(</w:instrText></w:r>` +
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> SEQ MTSec \\c \\* Alphabetic \\* MERGEFORMAT </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:instrText>A</w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>` +
  `<w:r><w:instrText>.</w:instrText></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> SEQ MTEqn \\c \\* Arabic \\* MERGEFORMAT </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:instrText>${label}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>` +
  `<w:r><w:instrText>)</w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:bookmarkEnd w:id="${bookmark}"/></w:p>`;

/** A MathType reference to a numbered equation: GOTOBUTTON with a nested REF to its bookmark. */
export const reference = (bookmark: number, shown: string) =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> GOTOBUTTON ZEqnNum${100000 + bookmark}  \\* MERGEFORMAT </w:instrText></w:r>` +
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> REF ZEqnNum${100000 + bookmark} \\* Charformat \\! \\* MERGEFORMAT </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:instrText>${shown}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>` +
  `<w:r><w:fldChar w:fldCharType="end"/></w:r>`;

/** The styles MathType defines (its product defaults): MTDisplayEquation with a centre and a right tab stop. */
const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}>` +
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:customStyle="1" w:styleId="MTDisplayEquation"><w:name w:val="MTDisplayEquation"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="center" w:pos="4394"/><w:tab w:val="right" w:pos="8787"/></w:tabs></w:pPr></w:style>` +
  `</w:styles>`;

export interface SyntheticDocument {
  docx: Uint8Array;
  /** The equations in document order. */
  equations: { name: SyntheticEquation; display: boolean; number: string | null }[];
}

/**
 * A small MathType document: an "Appendix" heading, four numbered display equations (A.1)–(A.4) in
 * MTDisplayEquation paragraphs, one inline equation in a sentence, and two references to (A.1)
 * and (A.3). Generic content only.
 */
export function syntheticMathTypeDocument(): SyntheticDocument {
  const order: { name: SyntheticEquation; display: boolean; number: string | null }[] = [
    { name: "pythagoras", display: true, number: "(A.1)" },
    { name: "x", display: false, number: null },
    { name: "fraction", display: true, number: "(A.2)" },
    { name: "matrix", display: true, number: "(A.3)" },
    { name: "force", display: true, number: "(A.4)" },
  ];
  const paragraphs = [
    `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${text("Appendix A")}</w:p>`,
    `<w:p>${text("A sample derivation with generic equations.")}</w:p>`,
    numbered(1, 1, "1"),
    `<w:p>${text("where the unknown ")}${mathTypeRun(2, 8, 10, 2)}${text(" is a length.")}</w:p>`,
    numbered(3, 2, "2"),
    numbered(4, 3, "3"),
    numbered(5, 4, "4"),
    `<w:p>${text("From ")}${reference(1, "(A.1)")}${text(" and ")}${reference(3, "(A.3)")}${text(" the result follows.")}</w:p>`,
  ];
  return { docx: mathTypeDocx(paragraphs, order.map((e) => e.name)), equations: order };
}

/**
 * A MathType-style .docx from paragraphs (WordprocessingML) and the MathType objects they use (object n
 * of mathTypeRun(n) is objects[n - 1]); styles: Normal, Heading 1, Heading 2, MTDisplayEquation.
 */
export function mathTypeDocx(paragraphs: string[], objects: SyntheticEquation[]): Uint8Array {
  const rels = objects
    .map((_, i) => `<Relationship Id="rIdOle${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="embeddings/oleObject${i + 1}.bin"/><Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${i + 1}.wmf"/>`)
    .join("");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="bin" ContentType="application/vnd.openxmlformats-officedocument.oleObject"/><Default Extension="wmf" ContentType="image/x-wmf"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${paragraphs.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`),
    "word/styles.xml": strToU8(STYLES),
    "word/_rels/document.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${rels}</Relationships>`,
    ),
  };
  objects.forEach((name, i) => {
    files[`word/embeddings/oleObject${i + 1}.bin`] = syntheticMathTypeObject(name);
    files[`word/media/image${i + 1}.wmf`] = new Uint8Array([0xd7, 0xcd, 0xc6, 0x9a, 0, 0]);
  });
  return zipSync(files);
}

/** A paragraph of plain text in a style (Normal when omitted); tabs as real tabs. */
export const styledParagraph = (t: string, style?: string) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${t
    .split("\t")
    .map((part, i) => (i ? "<w:r><w:tab/></w:r>" : "") + (part ? text(part.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")) : ""))
    .join("")}</w:p>`;

/**
 * A MathType chapter/section break as MathType writes it: a hidden paragraph with MACROBUTTON
 * MTEditEquationSection2 and hidden SEQ fields that set the counters (the equation counter restarts).
 */
export const mathTypeBreak = (chapter: number, section: number) => {
  const hidden = "<w:rPr><w:vanish/></w:rPr>";
  const f = (code: string) =>
    `<w:r>${hidden}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${hidden}<w:instrText xml:space="preserve"> ${code} </w:instrText></w:r><w:r>${hidden}<w:fldChar w:fldCharType="end"/></w:r>`;
  return (
    `<w:p><w:pPr><w:rPr><w:vanish/></w:rPr></w:pPr><w:r>${hidden}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${hidden}<w:instrText xml:space="preserve"> MACROBUTTON MTEditEquationSection2 </w:instrText></w:r>` +
    `<w:r>${hidden}<w:instrText>Equation Chapter ${chapter} Section ${section}</w:instrText></w:r>` +
    f("SEQ MTEqn \\r \\h \\* MERGEFORMAT") + f(`SEQ MTSec \\r ${section} \\h \\* MERGEFORMAT`) + f(`SEQ MTChap \\r ${chapter} \\h \\* MERGEFORMAT`) +
    `<w:r>${hidden}<w:fldChar w:fldCharType="end"/></w:r></w:p>`
  );
};
