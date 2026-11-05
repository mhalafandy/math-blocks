import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { formatTag } from "@mathblocks/ooxml";
import { analyseThesis, chapterOf, docxEquations } from "./thesis";

const sdt = (tag: string, latex: string, mode = "display") =>
  `<w:sdt><w:sdtPr><w:alias w:val="MathBlocks equation"/><w:tag w:val="${tag}"/><w:id w:val="1"/></w:sdtPr><w:sdtContent><w:r><w:pict><v:shape alt="MathBlocks ${mode}: ${latex.replace(/&/g, "&amp;")}"/></w:pict></w:r></w:sdtContent></w:sdt>`;
const numbered = (tag: string, latex: string, n: string) =>
  `<w:p><w:r><w:tab/></w:r>${sdt(tag, latex, "numbered")}<w:r><w:tab/></w:r><w:r><w:t>(</w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> SEQ MBEq \\* ARABIC </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${n}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t>)</w:t></w:r></w:p>`;
/** A Classic equation in the new form: the picture is the equation, its title is the ID (no wrapper). */
const titled = (tag: string, latex: string, mode = "display") =>
  `<w:r><w:pict><v:shape id="_x0000_mb1" alt="MathBlocks ${mode}: ${latex.replace(/&/g, "&amp;")}" title="${tag}"/></w:pict></w:r>`;
const docx = (body: string) => zipSync({ "word/document.xml": strToU8(`<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${body}</w:body></w:document>`) });

const linked = formatTag({ blockId: "BLOCK1BLOCK1BLOC", instanceId: "inst00000001" });

describe("thesis chapters", () => {
  const ch1 = docxEquations(docx(numbered("mb1||a1", "v=\\omega r", "1.1") + `<w:p>${sdt("mb1||a2", "\\vec{r}=x", "inline")}</w:p>` + numbered(linked, "F=m a", "1.2")), chapterOf("C:\\Thesis\\Chapter 1.docx"));
  const ch2 = docxEquations(docx(numbered("mb1||b1", "v=\\frac{d s}{d t}", "2.1") + `<w:p>${sdt("mb1||b2", "\\mathbf{r}=y", "inline")}</w:p>`), chapterOf("C:\\Thesis\\Chapter 2.docx"));

  it("reads equations, numbers and links from a closed file", () => {
    expect(ch1.chapter.name).toBe("Chapter 1");
    expect(ch1.equations.map((e) => e.latex)).toEqual(["v=\\omega r", "\\vec{r}=x", "F=ma"]);
    expect(ch1.equations.map((e) => e.number)).toEqual(["(1.1)", null, "(1.2)"]);
    expect(ch1.equations[2]!.blockId).toBe("BLOCK1BLOCK1BLOC");
  });

  it("finds notation and definition differences across chapters, and outdated copies", () => {
    const report = analyseThesis([ch1, ch2], (id) => (id === "BLOCK1BLOCK1BLOC" ? "F=m\\ddot{x}" : null));
    const r = report.inconsistencies.find((i) => i.letter === "r")!;
    expect(r).toBeTruthy();
    expect([...r.chapters.values()].flat().sort()).toEqual(["Chapter 1", "Chapter 2"]);
    expect(report.definedDifferently.map((d) => d.symbol)).toEqual(["v"]);
    expect(report.outdated.map((o) => o.equation.number)).toEqual(["(1.2)"]);
  });

  it("reads Classic equations stored as titled pictures (no wrapper), in document order with wrapped ones", () => {
    const body =
      `<w:p>${titled("mb1|-|t1", "a=b")}</w:p>` +
      numbered("mb1||w1", "c=d", "1.1") +
      `<w:p><w:r><w:tab/></w:r>${titled("mb1|-|t2", "e=f", "numbered")}<w:r><w:tab/></w:r><w:r><w:t>(</w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> SEQ MBEq \\* ARABIC </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1.2</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t>)</w:t></w:r></w:p>` +
      `<w:p><w:r><w:drawing><wp:inline><wp:docPr id="7" name="p" title="${linked}" descr="MathBlocks inline: g=h"/></wp:inline></w:drawing></w:r></w:p>`;
    const ch = docxEquations(docx(body), chapterOf("C:\\Thesis\\Chapter 3.docx"));
    expect(ch.equations.map((e) => e.tag)).toEqual(["mb1|-|t1", "mb1||w1", "mb1|-|t2", linked]);
    expect(ch.equations.map((e) => e.latex)).toEqual(["a=b", "c=d", "e=f", "g=h"]);
    expect(ch.equations.map((e) => e.number)).toEqual([null, "(1.1)", "(1.2)", null]);
    expect(ch.equations[3]!.blockId).toBe("BLOCK1BLOCK1BLOC");
  });
});
