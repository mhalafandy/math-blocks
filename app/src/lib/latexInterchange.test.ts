import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { labelBookmark, mapLegacyForms, normalizeWordText, planInterchange, type InterchangeScan } from "./latexInterchange";
import { INTERCHANGE_EXPECTED as X, INTERCHANGE_PARAGRAPHS, interchangeDocx, interchangeScan } from "./interchangeFixture";

describe("LaTeX interchange plan (synthetic convention document)", () => {
  const plan = planInterchange(interchangeScan());
  const errors = plan.issues.filter((i) => i.severity === "error");
  const warnings = plan.issues.filter((i) => i.severity === "warning");

  it("counts what the document holds", () => {
    expect(plan.counts).toMatchObject({ inline: X.inline, display: X.display, numbered: X.numbered, references: X.references, markers: X.markers, mapped: X.mapped });
    expect(plan.references.filter((r) => !r.resolved)).toHaveLength(X.unresolved);
  });

  it("lists every problem with a snippet, in document order, and nothing else", () => {
    expect(plan.issues.map((e) => `${e.severity}: ${e.what}`)).toEqual([
      expect.stringMatching(/^warning: Missing section marker: numbered equation in chapter 4 before its first \\mbnumbering\{4\.1\}/),
      expect.stringMatching(/^warning: Label eq:4\.1\.9 is numbered \(4\.1\.2\) here/),
      expect.stringMatching(/^warning: Label eq:3\.3\.1 does not fit the markers: the equation is in 4\.2 and is numbered \(4\.2\.1\)/),
      expect.stringMatching(/^warning: Typed number \(A\.1\.5\) becomes \(A\.1\.2\)/),
      expect.stringMatching(/^error: Missing closing brace/),
      expect.stringMatching(/^error: Unknown command \\unknowncmd/),
      expect.stringMatching(/^error: Unresolved reference \\eqref\{eq:9\.9\.9\}/),
      expect.stringMatching(/^error: Duplicate label eq:3\.1\.1/),
      expect.stringMatching(/^error: Malformed display paragraph/),
    ]);
    expect(errors).toHaveLength(X.errors);
    expect(warnings).toHaveLength(X.warnings);
    for (const i of plan.issues) expect(i.snippet.length).toBeGreaterThan(5);
  });

  it("numbers chapter.section.equation, restarting per section, and names bookmarks from the labels", () => {
    expect(plan.usesSections).toBe(true);
    const byLabel = Object.fromEntries(plan.equations.filter((e) => e.label && !e.invalid).map((e) => [e.label, e]));
    for (const [label, number] of Object.entries(X.numbers)) expect(byLabel[label]?.number, label).toBe(number);
    expect(plan.equations.filter((e) => e.typedNumber && !e.invalid).map((e) => e.number)).toEqual(X.legacyNumbers);
    expect(plan.equations.filter((e) => e.bookmark).map((e) => e.bookmark)).toEqual(X.bookmarks);
    expect(byLabel["A.2.1"]!.appendix).toBe(true);
    expect(byLabel["3.2.1"]!.appendix).toBe(false);
    expect(plan.markers.map((m) => `${m.level}:${m.value}:${m.chapter}.${m.section}${m.appendix ? "A" : ""}`)).toEqual([
      "chapter:3:3.0",
      "section:3.1:3.1",
      "section:3.2:3.2",
      "chapter:4:4.0",
      "section:4.1:4.1",
      "section:4.2:4.2",
      "chapter:A:1.0A",
      "section:A.1:1.1A",
      "section:A.2:1.2A",
    ]);
  });

  it("references show the numbers: \\eqref with brackets, \\ref without; within and across sections", () => {
    expect(plan.references.filter((r) => r.resolved).map((r) => `${r.form}:${r.shows}`)).toEqual(X.referenceTexts);
  });

  it("normalises Word's autocorrect and maps older forms to notation kinds", () => {
    const latex = plan.equations.map((e) => e.latex);
    expect(latex).toContain("x - y");
    expect(latex).toContain("f'(x)");
    expect(latex).toContain("a + b");
    expect(latex).toContain("\\pvec{h} = \\dyadic{I}\\cdot\\boldsymbol{\\omega}");
    expect(latex).toContain("\\vectrix{S}^{\\T}\\begin{bmatrix}\\bvec{s}_1&\\bvec{s}_2&\\bvec{s}_3\\end{bmatrix}^{\\T}");
    expect(normalizeWordText("\u201Ca\u201D \u2018b\u2019 c\u2013d e\u2014f g\u2212h i\u00A0j k\u000Bl m\u00ADn")).toBe("\"a\" 'b' c-d e-f g-h i j k l mn");
    expect(mapLegacyForms("\\overset{\\scriptscriptstyle\\rightharpoonup}{\\mathbf{r}}").latex).toBe("\\pvec{r}");
    expect(mapLegacyForms("\\left(\\begin{array}{cc}a&b\\\\c&d\\end{array}\\right)").latex).toBe("\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}");
    expect(mapLegacyForms("\\hat{s}_1+\\hat{\\mathbf{s}}_2+\\mathbf{\\hat{s}}_3+\\hat{x}").latex).toBe("\\bvec{s}_1+\\bvec{s}_2+\\bvec{s}_3+\\hat{x}");
    expect(mapLegacyForms("\\vec{\\mathbf{J}}_{c}").latex).toBe("\\dyadic{J}_{c}");
  });

  it("warns about a frame with a subscript (only I and J are dyadics)", () => {
    let pos = 0;
    const paragraphs = ["\\mbnumbering{1}", "\\mbnumbering{1.1}", "\t$$\\vec{\\mathbf{F}}_{1}$$\t\\label{eq:1.1.1}"].map((text) => ({ text, style: text.startsWith("\t") ? "MTDisplayEquation" : "Normal", start: pos, end: (pos += text.length + 1) - 1 }));
    const p = planInterchange({ name: "f", fullName: "f", bookmarks: [], paragraphs });
    expect(p.issues.map((i) => i.what)).toEqual([expect.stringMatching(/\\vectrix\{F\} has a subscript/)]);
  });

  it("writes display equations over their whole paragraph and inline ones over their span", () => {
    const scan = interchangeScan();
    for (const e of plan.equations) {
      const p = scan.paragraphs.find((x) => e.start >= x.start && e.end <= x.end)!;
      expect(p.text.slice(e.start - p.start, e.end - p.start)).toBe(e.expect);
      if (e.kind === "display") expect([e.start, e.end]).toEqual([p.start, p.end]);
    }
  });

  it("a second run converts only what is left, with numbers continuing from the converted ones", () => {
    // After a first run: markers and numbered equations are fields, labels are bookmarks; one equation
    // with a typed number was left as text.
    const scan: InterchangeScan = {
      name: "t",
      fullName: "t",
      bookmarks: ["_MBEq_A_1_1", "_MBEq_A_1_2"],
      paragraphs: [
        { start: 0, end: 1, text: "", style: "Normal", marker: { chapter: 1, appendix: true, section: 0 } },
        { start: 2, end: 3, text: "", style: "Normal", marker: { chapter: 1, appendix: true, section: 1 } },
        { start: 10, end: 14, text: "\t\t(A.1.1)", style: "MTDisplayEquation", numbered: true },
        { start: 30, end: 34, text: "\t\t(A.1.2)", style: "MTDisplayEquation", numbered: true },
        { start: 50, end: 70, text: "\t$$x=1$$\t\\label{eq:A.1.3}", style: "MTDisplayEquation" },
        { start: 80, end: 120, text: "See \\eqref{eq:A.1.1} and \\eqref{eq:A.1.3}.", style: "Normal" },
      ],
    };
    const again = planInterchange(scan);
    expect(again.issues).toEqual([]);
    expect(again.equations.map((e) => e.number)).toEqual(["(A.1.3)"]);
    expect(again.references.map((r) => r.resolved)).toEqual([true, true]);
  });

  it("keeps bookmarks within Word's 40 characters and distinct", () => {
    const a = labelBookmark("a-very-long-label-for-the-energy-balance-of-the-whole-system-one");
    const b = labelBookmark("a-very-long-label-for-the-energy-balance-of-the-whole-system-two");
    expect(a.length).toBeLessThanOrEqual(39);
    expect(a).not.toBe(b);
    expect(labelBookmark("energy-balance")).toBe("_MBEq_energy_balance");
    expect(labelBookmark("3.2.5")).toBe("_MBEq_3_2_5");
    expect(labelBookmark("A.1.3")).toBe("_MBEq_A_1_3");
  });

  it("the .docx holds exactly these paragraphs, with their styles", () => {
    const xml = strFromU8(unzipSync(interchangeDocx())["word/document.xml"]!);
    const paras = [...xml.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map((m) => m[1]!);
    expect(paras).toHaveLength(INTERCHANGE_PARAGRAPHS.length);
    const textOf = (p: string) => [...p.matchAll(/<w:t xml:space="preserve">([^<]*)<\/w:t>|<w:tab\/>/g)].map((m) => (m[1] === undefined ? "\t" : m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))).join("");
    paras.forEach((p, i) => expect(textOf(p.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, ""))).toBe(INTERCHANGE_PARAGRAPHS[i]!.text));
  });

  it("plans a 150-equation document quickly", () => {
    let pos = 0;
    const paragraphs = [{ text: "\\mbnumbering{2}", style: "Normal" }];
    for (let i = 0; i < 100; i++) paragraphs.push({ text: `\t$$\\pvec{c}_{${i}} = \\int_{0}^{${i}} \\frac{x^2}{1+x}\\,\\mathrm{d}x$$\t\\label{eq:e${i}}`, style: "MTDisplayEquation" });
    for (let i = 0; i < 25; i++) paragraphs.push({ text: `Using $a_${i}$ and $b_${i}$ in \\eqref{eq:e${i}}.`, style: "Normal" });
    const scan: InterchangeScan = { name: "big", fullName: "big", bookmarks: [], paragraphs: paragraphs.map((p) => ({ ...p, start: pos, end: (pos += p.text.length + 1) - 1 })) };
    const t0 = performance.now();
    const big = planInterchange(scan);
    const ms = performance.now() - t0;
    expect(big.counts.numbered + big.counts.inline).toBe(150);
    expect(big.issues).toEqual([]);
    expect(ms).toBeLessThan(3000);
  });
});

describe("docs/LATEX-INTERCHANGE.md", () => {
  it("is what the generator writes from the parser's real support (run pnpm interchange:doc)", async () => {
    const { readFileSync } = await import("node:fs");
    const { interchangeDocument } = await import("./interchangeDoc");
    const committed = readFileSync(new URL("../../../docs/LATEX-INTERCHANGE.md", import.meta.url), "utf8");
    expect(committed).toBe(interchangeDocument());
  });

  it("its example converts without a problem", async () => {
    const { readFileSync } = await import("node:fs");
    const doc = readFileSync(new URL("../../../docs/LATEX-INTERCHANGE.md", import.meta.url), "utf8");
    const example = /```text\n([\s\S]*?)```/.exec(doc)![1]!;
    let pos = 0;
    const paragraphs = example
      .trim()
      .split("\n")
      .map((l) => l.replace(/\s+←.*$/, "").replace(/⇥/g, "\t"))
      .map((text) => ({ text, style: text.startsWith("\t$$") ? "MTDisplayEquation" : "Normal", start: pos, end: (pos += text.length + 1) - 1 }));
    const plan = planInterchange({ name: "example", fullName: "example", bookmarks: [], paragraphs });
    expect(plan.issues).toEqual([]);
    expect(plan.counts).toMatchObject({ inline: 3, display: 1, numbered: 2, references: 3, markers: 2 });
    expect(plan.equations.filter((e) => e.number).map((e) => e.number)).toEqual(["(3.1.1)", "(3.1.2)"]);
    expect(plan.references.map((r) => r.shows)).toEqual(["(3.1.1)", "3.1.2", "(3.1.1)"]);
  });
});

describe("the speed test document", () => {
  it("has 150 equations (100 numbered, 50 inline) and 50 references, all valid", async () => {
    const { interchangeSpeedParagraphs } = await import("./interchangeFixture");
    let pos = 0;
    const paragraphs = interchangeSpeedParagraphs().map((p) => ({ ...p, start: pos, end: (pos += p.text.length + 1) - 1 }));
    const plan = planInterchange({ name: "speed", fullName: "speed", bookmarks: [], paragraphs });
    expect(plan.issues).toEqual([]);
    expect(plan.counts).toMatchObject({ numbered: 100, inline: 50, references: 50, markers: 2 });
  });
});
