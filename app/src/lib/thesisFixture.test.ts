import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { interchangeDocx, thesisParagraphs } from "./interchangeFixture";

describe("the thesis-size test document (generic)", () => {
  const paras = thesisParagraphs(1);
  const text = paras.map((p) => p.text).join("\n");
  const display = (text.match(/\$\$[^$]+\$\$/g) ?? []).length;
  const inline = (text.replace(/\$\$[^$]+\$\$/g, "").match(/\$[^$]+\$/g) ?? []).length;
  it("has about 1500 equations, 1000 references, 10 chapters and 2 appendices", () => {
    expect(display + inline).toBeGreaterThan(1400);
    expect(display + inline).toBeLessThan(1700);
    expect((text.match(/\\label\{/g) ?? []).length).toBeGreaterThan(400);
    expect((text.match(/\\(eq)?ref\{/g) ?? []).length).toBeGreaterThan(900);
    expect(paras.filter((p) => p.style === "Heading 1").map((p) => p.text).slice(-3)).toEqual(["Chapter 10", "Appendix A", "Appendix B"]);
  });
  it("puts equations in tables, footnotes and text boxes", () => {
    const files = unzipSync(interchangeDocx(paras));
    const doc = strFromU8(files["word/document.xml"]!);
    expect(doc.match(/<w:tbl>/g)?.length).toBe(60);
    expect(doc.match(/<w:footnoteReference /g)?.length).toBe(12);
    expect(doc.match(/<w:txbxContent>/g)?.length).toBe(12);
    expect(strFromU8(files["word/footnotes.xml"]!)).toContain("$\\sin\\theta_{2}\\approx\\theta_{2}$");
  });
});
