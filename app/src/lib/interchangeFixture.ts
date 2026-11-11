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
  { style: "Normal", text: "A particle at $\\pvec{r}$ moves with velocity $\\pvec{v}$, defined in \\eqref{eq:velocity}." },
  { style: "MTDisplayEquation", text: "\t$$\\pvec{v} = \\frac{\\mathrm{d}\\pvec{r}}{\\mathrm{d}t}$$\t\\label{eq:velocity}" },
  { style: "MTDisplayEquation", text: "\t$$\\pvec{a} = \\dot{\\pvec{v}}$$" },
  { style: "MTDisplayEquation", text: "\t$$\\begin{aligned} \\pvec{r} &= \\vectrix{F}^{\\T}\\cmat{r} \\\\ &= x\\uvec{e}_1 + y\\uvec{e}_2 \\end{aligned}$$\t\\label{eq:position}" },
  { style: "Normal", text: "Equations \\ref{eq:velocity} and \\ref{eq:position} hold in the frame $\\vectrix{F}$; the dyadic $\\dyadic{I}$ is constant." },
  { style: "Heading 1", text: "Appendix A" },
  { style: "Normal", text: "\\mbnumbering{A}" },
  { style: "MTDisplayEquation", text: "\t$$\\mathbf{\\overset{\\scriptscriptstyle\\rightharpoonup}{h}} = \\vec{\\mathbf{I}}\\cdot\\boldsymbol{\\omega}$$\t(A.1)" },
  { style: "MTDisplayEquation", text: "\t$$\\vec{\\mathbf{S}}^{\\T}\\left[\\begin{array}{ccc}1&0&0\\end{array}\\right]^{\\T}$$\t(A.5)" },
  { style: "MTDisplayEquation", text: "\t$$m\\ddot{x} + kx = 0$$\t\\label{eq:oscillator}" },
  { style: "Normal", text: `Word artefacts: $x ${EN_DASH} y$, $f${RSQUO}(x)$, $a${NBSP}+ b$ and ${LDQUO}quotes${RDQUO} around \\eqref{eq:oscillator}.` },
  { style: "Normal", text: "Errors: $\\frac{1}{$ is unclosed, $\\unknowncmd x$ is unknown, and \\eqref{eq:nowhere} has no label." },
  { style: "MTDisplayEquation", text: "\t$$y = 2$$\t\\label{eq:velocity}" },
  { style: "Normal", text: "Text before \t$$z = 1$$" },
];

/** What the plan of this document must find (CI and the self-test check against it). */
export const INTERCHANGE_EXPECTED = {
  markers: 2,
  inline: 7,
  display: 1,
  numbered: 5,
  references: 4,
  unresolved: 1,
  errors: 5,
  warnings: 1,
  mapped: 2,
  numbers: { velocity: "(3.1)", position: "(3.2)", oscillator: "(A.3)" } as Record<string, string>,
  legacyNumbers: ["(A.1)", "(A.2)"],
  bookmarks: ["_MBEq_velocity", "_MBEq_position", "_MBEq_oscillator"],
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
const STYLE_ID: Record<string, string> = { Normal: "Normal", "Heading 1": "Heading1", MTDisplayEquation: "MTDisplayEquation" };
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
  `<w:style w:type="paragraph" w:customStyle="1" w:styleId="MTDisplayEquation"><w:name w:val="MTDisplayEquation"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="center" w:pos="4513"/><w:tab w:val="right" w:pos="9026"/></w:tabs></w:pPr></w:style>` +
  `</w:styles>`;

/** The document as a .docx (A4, 2.54 cm margins: centre tab 4513, right tab 9026 twips). */
export function interchangeDocx(paragraphs = INTERCHANGE_PARAGRAPHS): Uint8Array {
  const body = paragraphs.map((p) => `<w:p><w:pPr><w:pStyle w:val="${STYLE_ID[p.style]}"/></w:pPr>${runs(p.text)}</w:p>`).join("");
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
  ];
  for (let i = 0; i < 100; i++) {
    out.push({ style: "MTDisplayEquation", text: `\t$$\\pvec{c}_{${i}} = \\int_{0}^{${i + 1}} \\frac{x^{2}}{1+x}\\,\\mathrm{d}x + \\vectrix{F}^{\\T}\\cmat{r}_{${i}}$$\t\\label{eq:s${i}}` });
    if (i % 2 === 0) out.push({ style: "Normal", text: `With $\\omega_{${i}}^{2}$ from \\eqref{eq:s${i}}.` });
  }
  return out;
}
