/**
 * Test document: ways to number a display equation in Word while keeping display size
 * (full-size fractions) and Word cross-references. The user opens it in Word and reports which
 * looks like MathType. Run: pnpm tsx tools/make-numbering-spike.ts <out.docx>
 */
import { writeFileSync } from "node:fs";
import { parseLatex } from "@mathblocks/math-latex";
import { toOmml, TUNED_PROFILE, withFont } from "@mathblocks/math-omml";
import { buildDocx, heading, paragraph, textRun } from "@mathblocks/ooxml";

const LATEX = "f(\\vec{\\mathbf{r}})=\\frac{-\\mu}{r^2}\\vec{\\mathbf{r}}";
const TEXT_WIDTH = 9026; // A4, 2.54 cm margins (twips)

const math = (font: string, display: boolean) => toOmml(parseLatex(LATEX).root, { profile: withFont(TUNED_PROFILE, font), display });
const fld = (instr: string, shown: string) => `<w:fldSimple w:instr=" ${instr} "><w:r><w:t>${shown}</w:t></w:r></w:fldSimple>`;
const t = (s: string) => `<w:r><w:t xml:space="preserve">${s}</w:t></w:r>`;
let bm = 0;
/** "(1.n)" as fields, inside a bookmark. */
const number = (name: string, n: number) => {
  const id = ++bm;
  return `<w:bookmarkStart w:id="${id}" w:name="${name}"/>${t("(1.")}${fld("SEQ Spike \\* ARABIC", String(n))}${t(")")}<w:bookmarkEnd w:id="${id}"/>`;
};
const note = (s: string) => paragraph(textRun(s, { italic: true, size: 20, color: "666666" }));

/** A: what MathBlocks does now (MathType's layout: tab, inline math, tab, number). */
function tabsLayout(font: string, n: number) {
  return `<w:p><w:pPr><w:tabs><w:tab w:val="center" w:pos="${TEXT_WIDTH / 2}"/><w:tab w:val="right" w:pos="${TEXT_WIDTH}"/></w:tabs></w:pPr><w:r><w:tab/></w:r>${math(font, false)}<w:r><w:tab/></w:r>${number(`_eqA${n}`, n)}</w:p>`;
}

/** B: borderless 1×3 table: equation alone in the middle cell (display), number in the right one. */
function tableLayout(font: string, n: number, name: string) {
  const side = Math.round(TEXT_WIDTH * 0.15);
  const mid = TEXT_WIDTH - 2 * side;
  const none = ["top", "left", "bottom", "right", "insideH", "insideV"].map((b) => `<w:${b} w:val="nil"/>`).join("");
  const cell = (w: number, content: string, jc: string) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="${jc}"/></w:pPr>${content}</w:p></w:tc>`;
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${TEXT_WIDTH}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${none}</w:tblBorders><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="${side}"/><w:gridCol w:w="${mid}"/><w:gridCol w:w="${side}"/></w:tblGrid>` +
    `<w:tr>${cell(side, "", "left")}${cell(mid, math(font, true), "center")}${cell(side, number(name, n), "right")}</w:tr></w:tbl>`
  );
}

/** C: style separator: the equation paragraph's mark is hidden, the number paragraph joins its line. */
function separatorLayout(font: string, n: number) {
  return (
    `<w:p><w:pPr><w:rPr><w:vanish/><w:specVanish/></w:rPr></w:pPr>${math(font, true)}</w:p>` +
    `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="${TEXT_WIDTH}"/></w:tabs></w:pPr><w:r><w:tab/></w:r>${number(`_eqC${n}`, n)}</w:p>`
  );
}

/** D: Word's own "#" equation numbering (number typed inside the equation; no fields). */
function hashLayout(font: string, n: number) {
  const inner = math(font, false).replace(/^<m:oMath>/, "").replace(/<\/m:oMath>$/, "");
  const run = (s: string) => `<m:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/></w:rPr><m:t>${s}</m:t></m:r>`;
  return `<w:p><m:oMathPara><m:oMath><m:eqArr><m:e>${inner}${run("#")}${run(`(1.${n})`)}</m:e></m:eqArr></m:oMath></m:oMathPara></w:p>`;
}

const LM = "Latin Modern Math";
const paragraphs = [
  heading("Numbered equations: which one looks right?"),
  note("Please compare each version with your MathType equation and tell me the letters that look good (full-size fraction, number at the right margin)."),
  heading("A. Current MathBlocks layout (tabs)", 2),
  tabsLayout(LM, 1),
  heading("B. Borderless table (number in its own cell)", 2),
  tableLayout(LM, 2, "_eqB2"),
  heading("C. Hidden paragraph mark (style separator)", 2),
  separatorLayout(LM, 3),
  heading("D. Word's # numbering (inside the equation; cannot be cross-referenced)", 2),
  hashLayout(LM, 4),
  heading("Cross-reference test", 2),
  paragraph(`${t("The force in Eq. ")}${fld("REF _eqB2 \\h", "(1.2)")}${t(" (version B) should update when you select all and press F9.")}`),
  heading("Fonts (in layout B)", 2),
  note("MathType uses Times New Roman. Word can only use special math fonts; the closest to Times are STIX Two Math and TeX Gyre Termes Math (free; if one is not installed Word shows Cambria Math instead)."),
  tableLayout("Cambria Math", 5, "_eqF5"),
  note("Cambria Math (built into Windows)"),
  tableLayout(LM, 6, "_eqF6"),
  note("Latin Modern Math (LaTeX look)"),
  tableLayout("STIX Two Math", 7, "_eqF7"),
  note("STIX Two Math (Times-like)"),
  tableLayout("TeX Gyre Termes Math", 8, "_eqF8"),
  note("TeX Gyre Termes Math (Times-like)"),
];

writeFileSync(process.argv[2] ?? "numbering-test.docx", buildDocx({ paragraphs, mathFont: LM, bodyFont: "Calibri" }));
console.log("written", process.argv[2]);
