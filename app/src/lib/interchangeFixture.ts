/**
 * A synthetic document written to the LaTeX interchange convention (generic content only): a numbered
 * chapter and an appendix with \mbnumbering markers, inline, display, numbered and multi-line
 * equations, references, legacy typed numbers and MathType-style forms, Word's autocorrect artefacts,
 * and a few deliberate errors. Used by CI (the plan) and the Word self-test (the conversion itself).
 */
import { strToU8, zipSync } from "fflate";
import type { InterchangeScan, ScanParagraph } from "./latexInterchange";

const NBSP = "\u00A0";
const EN_DASH = "\u2013";
const RSQUO = "\u2019";
const LDQUO = "\u201C";
const RDQUO = "\u201D";

export const INTERCHANGE_PARAGRAPHS: { style: string; text: string }[] = [
  { style: "Heading 1", text: "Kinematics" },
  { style: "Normal", text: "\\mbnumbering{3}" },
  { style: "Normal", text: "A particle at $\\pvec{r}$ moves in the frame of reference." },
  { style: "Heading 2", text: "Position" },
  { style: "Normal", text: "\\mbnumbering{3.1}" },
  { style: "Normal", text: "The position $\\pvec{r} = \\vectrix{F}^{\\T}\\cmat{r}$ uses the unit vectors $\\bvec{f}_1$, see \\eqref{eq:3.1.2}." },
  { style: "MTDisplayEquation", text: "\t$$\\pvec{r} = x\\bvec{f}_1 + y\\bvec{f}_2$$\t\\label{eq:3.1.1}" },
  { style: "MTDisplayEquation", text: "\t$$\\cmat{r} = \\begin{bmatrix} x & y & 0 \\end{bmatrix}^{\\T}$$\t\\label{eq:3.1.2}" },
  { style: "MTDisplayEquation", text: "\t$$\\pvec{r}\\cdot\\pvec{r} = x^{2} + y^{2}$$" },
  { style: "Heading 2", text: "Velocity" },
  { style: "Normal", text: "\\mbnumbering{3.2}" },
  { style: "MTDisplayEquation", text: "\t$$\\pvec{v} = \\frac{\\mathrm{d}\\pvec{r}}{\\mathrm{d}t}$$\t\\label{eq:3.2.1}" },
  { style: "MTDisplayEquation", text: "\t$$\\begin{aligned} \\pvec{v} &= \\dot{x}\\bvec{f}_1 + \\dot{y}\\bvec{f}_2 \\\\ &= \\vectrix{F}^{\\T}\\dot{\\cmat{r}} \\end{aligned}$$\t\\label{eq:3.2.2}" },
  { style: "Normal", text: "From \\eqref{eq:3.1.1} and equation \\ref{eq:3.2.1} the velocity follows." },
  { style: "Heading 1", text: "Dynamics" },
  { style: "Normal", text: "\\mbnumbering{4}" },
  { style: "MTDisplayEquation", text: "\t$$\\pvec{F} = m\\pvec{a}$$\t\\label{eq:newton}" },
  { style: "Heading 2", text: "Momentum" },
  { style: "Normal", text: "\\mbnumbering{4.1}" },
  { style: "MTDisplayEquation", text: "\t$$\\pvec{p} = m\\pvec{v}$$\t\\label{eq:4.1.1}" },
  { style: "MTDisplayEquation", text: "\t$$\\pvec{h} = \\dyadic{J}_{c}\\cdot\\boldsymbol{\\omega}$$\t\\label{eq:4.1.9}" },
  { style: "Heading 2", text: "Energy" },
  { style: "Normal", text: "\\mbnumbering{4.2}" },
  { style: "MTDisplayEquation", text: "\t$$T = \\tfrac{1}{2}mv^{2}$$\t\\label{eq:3.3.1}" },
  { style: "Normal", text: "Using \\eqref{eq:4.1.1} in \\eqref{eq:3.2.2} gives the energy." },
  { style: "Heading 1", text: "Appendix A" },
  { style: "Normal", text: "\\mbnumbering{A}" },
  { style: "Heading 2", text: "A.1 Frames" },
  { style: "Normal", text: "\\mbnumbering{A.1}" },
  { style: "MTDisplayEquation", text: "\t$$\\mathbf{\\overset{\\scriptscriptstyle\\rightharpoonup}{h}} = \\vec{\\mathbf{I}}\\cdot\\boldsymbol{\\omega}$$\t(A.1.1)" },
  { style: "MTDisplayEquation", text: "\t$$\\vec{\\mathbf{S}}^{\\T}\\left[\\begin{array}{ccc}\\hat{s}_1&\\hat{\\mathbf{s}}_2&\\mathbf{\\hat{s}}_3\\end{array}\\right]^{\\T}$$\t(A.1.5)" },
  { style: "Heading 2", text: "A.2 Oscillator" },
  { style: "Normal", text: "\\mbnumbering{A.2}" },
  { style: "MTDisplayEquation", text: "\t$$m\\ddot{x} + kx = 0$$\t\\label{eq:A.2.1}" },
  { style: "Normal", text: `Word artefacts: $x ${EN_DASH} y$, $f${RSQUO}(x)$, $a${NBSP}+ b$ and ${LDQUO}quotes${RDQUO} around \\eqref{eq:A.2.1}.` },
  { style: "Normal", text: "Errors: $\\frac{1}{$ is unclosed, $\\unknowncmd x$ is unknown, and \\eqref{eq:9.9.9} has no label." },
  { style: "MTDisplayEquation", text: "\t$$y = 2$$\t\\label{eq:3.1.1}" },
  { style: "Normal", text: "Text before \t$$z = 1$$" },
];

/** What the plan of this document must find (CI and the self-test check against it). */
export const INTERCHANGE_EXPECTED = {
  markers: 9,
  inline: 6,
  display: 1,
  numbered: 10,
  references: 6,
  unresolved: 1,
  errors: 6,
  warnings: 3,
  mapped: 2,
  numbers: {
    "3.1.1": "(3.1.1)",
    "3.1.2": "(3.1.2)",
    "3.2.1": "(3.2.1)",
    "3.2.2": "(3.2.2)",
    "4.1.1": "(4.1.1)",
    "4.1.9": "(4.1.2)",
    "3.3.1": "(4.2.1)",
    "A.2.1": "(A.2.1)",
  } as Record<string, string>,
  legacyNumbers: ["(A.1.1)", "(A.1.2)"],
  bookmarks: ["_MBEq_3_1_1", "_MBEq_3_1_2", "_MBEq_3_2_1", "_MBEq_3_2_2", "_MBEq_4_1_1", "_MBEq_4_1_9", "_MBEq_3_3_1", "_MBEq_A_2_1"],
  referenceTexts: ["eqref:(3.1.2)", "eqref:(3.1.1)", "ref:3.2.1", "eqref:(4.1.1)", "eqref:(3.2.2)", "eqref:(A.2.1)"],
};

/** The scan the add-in would return for it (positions as Word counts them: one mark per paragraph). */
export function interchangeScan(): InterchangeScan {
  let pos = 0;
  const paragraphs: ScanParagraph[] = INTERCHANGE_PARAGRAPHS.map((p) => {
    const s: ScanParagraph = { start: pos, end: pos + p.text.length, text: p.text, style: p.style };
    pos += p.text.length + 1;
    return s;
  });
  return { name: "interchange test.docx", fullName: "C:\\interchange test.docx", paragraphs: paragraphs.filter((p) => /[$\\]/.test(p.text)), bookmarks: [] };
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const STYLE_ID: Record<string, string> = { Normal: "Normal", "Heading 1": "Heading1", "Heading 2": "Heading2", MTDisplayEquation: "MTDisplayEquation" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const runs = (text: string) =>
  text
    .split("\t")
    .map((part, i) => (i > 0 ? "<w:r><w:tab/></w:r>" : "") + (part ? `<w:r><w:t xml:space="preserve">${esc(part)}</w:t></w:r>` : ""))
    .join("");
const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}>` +
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:customStyle="1" w:styleId="MTDisplayEquation"><w:name w:val="MTDisplayEquation"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="center" w:pos="4513"/><w:tab w:val="right" w:pos="9026"/></w:tabs></w:pPr></w:style>` +
  `</w:styles>`;

/** The document as a .docx (A4, 2.54 cm margins: centre tab 4513, right tab 9026 twips). */
export function interchangeDocx(paragraphs: { style: string; text: string; keepNext?: boolean }[] = INTERCHANGE_PARAGRAPHS): Uint8Array {
  const body = paragraphs.map((p) => `<w:p><w:pPr><w:pStyle w:val="${STYLE_ID[p.style]}"/>${p.keepNext ? "<w:keepNext/>" : ""}</w:pPr>${runs(p.text)}</w:p>`).join("");
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`,
    ),
    "word/styles.xml": strToU8(STYLES),
    "word/_rels/document.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
  });
}

/** A larger document for the time per equation: 100 numbered display equations and 50 inline ones. */
export function interchangeSpeedParagraphs(): { style: string; text: string }[] {
  const out: { style: string; text: string }[] = [
    { style: "Heading 1", text: "Speed test" },
    { style: "Normal", text: "\\mbnumbering{2}" },
    { style: "Normal", text: "\\mbnumbering{2.1}" },
  ];
  for (let i = 0; i < 100; i++) {
    out.push({ style: "MTDisplayEquation", text: `\t$$\\pvec{c}_{${i}} = \\int_{0}^{${i + 1}} \\frac{x^{2}}{1+x}\\,\\mathrm{d}x + \\vectrix{F}^{\\T}\\cmat{r}_{${i}}$$\t\\label{eq:s${i}}` });
    if (i % 2 === 0) out.push({ style: "Normal", text: `With $\\omega_{${i}}^{2}$ from \\eqref{eq:s${i}}.` });
  }
  return out;
}

/**
 * A document part converted from MathType and a section pasted after it (generic content): Appendix A
 * with a MathType break, section heading "A.1 Frames", three MathType equations numbered (A.1)–(A.3)
 * (two-level, MathType's fields and ZEqnNum bookmarks) and a paragraph referring to (A.1) and (A.3);
 * then, as pasted from a transcription, one more equation for A.1, section A.2 with \mbnumbering and a
 * labelled equation, and references to old and new equations by number.
 */
/**
 * Generic chapters numbered chapter.section.equation by MathType, with breaks in chapters and sections
 * that have no equations yet, a section heading without a break, a reference, and LaTeX to convert
 * afterwards into the later sections (each label is the number the new equation must get).
 */
export async function mathTypeChaptersDocx(): Promise<Uint8Array> {
  const { mathTypeDocx, styledParagraph, mathTypeBreak, mathTypeNumbered3, mathTypeReference } = await import("@mathblocks/mathtype");
  const run = (t: string) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
  return mathTypeDocx(
    [
      styledParagraph("Introduction", "Heading1"),
      mathTypeBreak(1, 0),
      styledParagraph("A chapter without equations."),
      styledParagraph("Models", "Heading1"),
      mathTypeBreak(2, 0),
      styledParagraph("2.1 Kinematics", "Heading2"),
      mathTypeBreak(2, 1),
      mathTypeNumbered3(1, 1, 2, 1, 1),
      mathTypeNumbered3(2, 2, 2, 1, 2),
      `<w:p>${run("By ")}${mathTypeReference(2, "(2.1.2)")}${run(" the model follows.")}</w:p>`,
      styledParagraph("2.2 Dynamics", "Heading2"),
      mathTypeBreak(2, 2),
      styledParagraph("\t$$p = m v$$\t\\label{eq:2.2.1}", "MTDisplayEquation"),
      styledParagraph("2.3 Control", "Heading2"),
      styledParagraph("\t$$u = -k x$$\t\\label{eq:2.3.1}", "MTDisplayEquation"),
      styledParagraph("Results", "Heading1"),
      mathTypeBreak(3, 0),
      styledParagraph("3.1 Simulation", "Heading2"),
      mathTypeBreak(3, 1),
      styledParagraph("\t$$e = x - r$$\t\\label{eq:3.1.1}", "MTDisplayEquation"),
    ],
    ["pythagoras", "fraction"],
  );
}

export async function mathTypeNumberingDocx(withPastedSection = true): Promise<Uint8Array> {
  const { mathTypeDocx, styledParagraph, mathTypeBreak, mathTypeNumbered, mathTypeReference } = await import("@mathblocks/mathtype");
  const run = (t: string) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
  const paragraphs = [
    styledParagraph("Appendix A", "Heading1"),
    mathTypeBreak(1, 1),
    styledParagraph("A.1 Frames", "Heading2"),
    styledParagraph("Generic equations, converted from MathType."),
    mathTypeNumbered(1, 1, "1"),
    mathTypeNumbered(2, 2, "2"),
    mathTypeNumbered(3, 3, "3"),
    `<w:p>${run("From ")}${mathTypeReference(1, "(A.1)")}${run(" and ")}${mathTypeReference(3, "(A.3)")}${run(" the result follows.")}</w:p>`,
  ];
  if (withPastedSection) {
    paragraphs.push(
      styledParagraph("\t$$x = y + 1$$\t\\label{eq:A.1.4}", "MTDisplayEquation"),
      styledParagraph("A.2 Oscillator", "Heading2"),
      styledParagraph("\\mbnumbering{A.2}"),
      styledParagraph("\t$$m\\ddot{x} + kx = 0$$\t\\label{eq:A.2.1}", "MTDisplayEquation"),
      styledParagraph("From \\eqref{eq:A.1.3}, equation \\ref{eq:A.1.1}, \\eqref{eq:A.1.4} and \\eqref{eq:A.2.1}."),
    );
  }
  return mathTypeDocx(paragraphs, ["pythagoras", "fraction", "force"]);
}
