import { describe, expect, it } from "vitest";
import { breakCounters, headingSection, parseNumber, planNumberingConversion, type NumberingItem, type NumberingScan } from "./numberingConversion";

/** A two-level MathType appendix: break, section A.1 with (A.1)–(A.3), section A.2 with (A.4). */
const appendix = (): NumberingScan => {
  const items: NumberingItem[] = [
    { type: "heading", start: 0, paraStart: 0, after: 11, level: 1, text: "Appendix A", list: "" },
    { type: "mtBreak", start: 12, paraStart: 12, label: "Equation Chapter 1 Section 1" },
    { type: "heading", start: 20, paraStart: 20, after: 31, level: 2, text: "A.1 Frames", list: "" },
    { type: "mtNumber", start: 40, paraStart: 35, text: "(A.1)", bookmark: "ZEqnNum100001", snippet: "eq (A.1)" },
    { type: "mtNumber", start: 60, paraStart: 55, text: "(A.2)", bookmark: "ZEqnNum100002", snippet: "eq (A.2)" },
    { type: "mtNumber", start: 80, paraStart: 75, text: "(A.3)", bookmark: "ZEqnNum100003", snippet: "eq (A.3)" },
    { type: "heading", start: 100, paraStart: 100, after: 115, level: 2, text: "A.2 Oscillator", list: "" },
    { type: "mtNumber", start: 130, paraStart: 125, text: "(A.4)", bookmark: "ZEqnNum100004", snippet: "eq (A.4)" },
  ];
  return { name: "t", fullName: "t", items };
};

describe("MathType numbering → MathBlocks", () => {
  it("reads numbers and section headings", () => {
    expect(parseNumber("(A.1)")).toEqual(["A", "1"]);
    expect(parseNumber("(3.2.5)")).toEqual(["3", "2", "5"]);
    expect(parseNumber("( 12 )")).toEqual(["12"]);
    expect(parseNumber("A.1")).toBeNull();
    expect(headingSection({ text: "A.1 Frames", list: "" })).toEqual({ chapter: "A", section: 1 });
    expect(headingSection({ text: "Velocity", list: "3.2" })).toEqual({ chapter: "3", section: 2 });
    expect(headingSection({ text: "Frames", list: "" })).toBeNull();
  });

  it("keep: the break becomes a marker, the numbers stay, bookmarks are kept", () => {
    const plan = planNumberingConversion(appendix(), "keep");
    expect(plan.problems).toEqual([]);
    expect(plan.format.parts).toBe("chapter");
    expect(plan.changes.map((c) => `${c.old}→${c.new}`)).toEqual(["(A.1)→(A.1)", "(A.2)→(A.2)", "(A.3)→(A.3)", "(A.4)→(A.4)"]);
    expect(plan.writes.filter((w) => w.kind === "replaceBreak")).toEqual([{ kind: "replaceBreak", start: 12, chapter: 1, appendix: true, section: 0 }]);
    expect(plan.writes.filter((w) => w.kind === "replaceNumber").map((w) => (w as { bookmark: string }).bookmark)).toEqual(["ZEqnNum100001", "ZEqnNum100002", "ZEqnNum100003", "ZEqnNum100004"]);
    expect(plan.counts.changed).toBe(0);
  });

  it("renumber: section markers after the section headings, (A.n) → (A.s.n), the counter restarting per section", () => {
    const plan = planNumberingConversion(appendix(), "renumber");
    expect(plan.problems).toEqual([]);
    expect(plan.format.parts).toBe("section");
    expect(plan.changes.map((c) => `${c.old}→${c.new}`)).toEqual(["(A.1)→(A.1.1)", "(A.2)→(A.1.2)", "(A.3)→(A.1.3)", "(A.4)→(A.2.1)"]);
    expect(plan.writes.filter((w) => w.kind !== "replaceNumber")).toEqual([
      { kind: "replaceBreak", start: 12, chapter: 1, appendix: true, section: 0 },
      { kind: "insertMarker", start: 31, chapter: 1, appendix: true, section: 1 },
      { kind: "insertMarker", start: 115, chapter: 1, appendix: true, section: 2 },
    ]);
    expect(plan.counts).toMatchObject({ numbers: 4, breaks: 1, sectionMarkers: 2, changed: 4 });
  });

  it("lists problems with snippets: skipped numbers, hand resets, missing or unnumbered section headings", () => {
    const scan = appendix();
    (scan.items[5] as { text: string }).text = "(A.5)"; // (A.3) skipped to (A.5)
    (scan.items[4] as { code: string[] }).code = ["SEQ MTEqn \\r 2 \\h \\* MERGEFORMAT"];
    const keep = planNumberingConversion(scan, "keep");
    expect(keep.problems.map((p) => p.what)).toEqual([expect.stringMatching(/\(A\.2\) resets the equation counter by hand/), expect.stringMatching(/\(A\.5\) would become \(A\.3\)/)]);
    expect(keep.problems.every((p) => p.snippet.length > 0)).toBe(true);
    const scan2 = appendix();
    scan2.items.splice(2, 1); // no "A.1" heading: equations before the first section heading
    (scan2.items[5] as { text: string }).text = "Oscillator"; // and a heading without a number
    const re = planNumberingConversion(scan2, "renumber");
    expect(re.problems.map((p) => p.what)).toEqual([expect.stringMatching(/^Missing section heading: \(A\.1\) comes before the first section heading of appendix A/), expect.stringMatching(/^Section heading “Oscillator” has no number.*counted as A\.1/)]);
    expect(re.changes.map((c) => c.new)).toEqual(["(A.0.1)", "(A.0.2)", "(A.0.3)", "(A.1.1)"]);
  });

  it("numbers without a chapter part can only be kept", () => {
    const scan: NumberingScan = { name: "t", fullName: "t", items: [{ type: "mtNumber", start: 5, paraStart: 0, text: "(1)", bookmark: "ZEqnNum1" }, { type: "mtNumber", start: 15, paraStart: 10, text: "(2)", bookmark: "ZEqnNum2" }] };
    expect(planNumberingConversion(scan, "keep").changes.map((c) => c.new)).toEqual(["(1)", "(2)"]);
    const re = planNumberingConversion(scan, "renumber");
    expect(re.canRenumber).toBe(false);
    expect(re.problems[0]!.severity).toBe("error");
  });
});

describe("the self-test's MathType numbering document", () => {
  it("has a MathType break, three MathType numbers with ZEqnNum bookmarks, two references, and the pasted section", async () => {
    const { strFromU8, unzipSync } = await import("fflate");
    const { mathTypeNumberingDocx } = await import("./interchangeFixture");
    const xml = strFromU8(unzipSync(await mathTypeNumberingDocx(true))["word/document.xml"]!);
    expect(xml.match(/MTEditEquationSection2/g)).toHaveLength(1);
    expect(xml.match(/MACROBUTTON MTPlaceRef/g)).toHaveLength(3);
    expect(xml.match(/w:name="ZEqnNum10000[123]"/g)).toHaveLength(3);
    expect(xml.match(/GOTOBUTTON ZEqnNum/g)).toHaveLength(2);
    expect(xml).toContain("\\label{eq:A.2.1}");
    expect(xml).toContain("\\mbnumbering{A.2}");
    const keep = strFromU8(unzipSync(await mathTypeNumberingDocx(false))["word/document.xml"]!);
    expect(keep).not.toContain("mbnumbering");
  });

  it("evaluates a MathType break's fields as Word does", () => {
    const codes = (chap: string, sec: string) => ["SEQ MTEqn \\r \\h \\* MERGEFORMAT", `SEQ MTSec ${sec} \\h \\* MERGEFORMAT`, `SEQ MTChap ${chap} \\h \\* MERGEFORMAT`];
    expect(breakCounters(codes("\\r 3", "\\r 0"), "", { chap: 0, sec: 0 })).toEqual({ chap: 3, sec: 0 });
    expect(breakCounters(codes("\\c", ""), "", { chap: 3, sec: 1 })).toEqual({ chap: 3, sec: 2 });
    expect(breakCounters(codes("", "\\r 1"), "", { chap: 3, sec: 4 })).toEqual({ chap: 4, sec: 1 });
    expect(breakCounters(undefined, "Equation Chapter 2 Section 5", { chap: 0, sec: 0 })).toEqual({ chap: 2, sec: 5 });
    expect(breakCounters(undefined, "Equation Section (Next)", { chap: 2, sec: 5 })).toEqual({ chap: 2, sec: 6 });
  });

  /** Generic chapters with breaks in sections that have no equations yet, and a heading without a break. */
  const multiChapter = (): NumberingScan => {
    const brk = (start: number, chap: number, sec: number): NumberingItem => ({ type: "mtBreak", start, paraStart: start, label: `Equation Chapter ${chap} Section ${sec}`, code: ["SEQ MTEqn \\r \\h", `SEQ MTSec \\r ${sec} \\h`, `SEQ MTChap \\r ${chap} \\h`] });
    const num = (start: number, text: string, id: number): NumberingItem => ({ type: "mtNumber", start, paraStart: start - 5, text, bookmark: `ZEqnNum${100000 + id}`, snippet: text });
    const head = (start: number, level: number, text: string): NumberingItem => ({ type: "heading", start, paraStart: start, after: start + 9, level, text, list: "" });
    const items: NumberingItem[] = [
      head(0, 1, "Introduction"),
      brk(10, 1, 0),
      head(20, 1, "Models"),
      brk(30, 2, 0),
      head(40, 2, "2.1 Kinematics"),
      brk(50, 2, 1),
      num(70, "(2.1.1)", 1),
      num(90, "(2.1.2)", 2),
      head(100, 2, "2.2 Dynamics"),
      brk(110, 2, 2),
      head(120, 2, "2.3 Control"),
      head(140, 1, "Results"),
      brk(150, 3, 0),
      head(160, 2, "3.1 Simulation"),
      brk(170, 3, 1),
    ];
    return { name: "t", fullName: "t", items };
  };

  it("every break becomes a marker, also in chapters and sections without equations", () => {
    const plan = planNumberingConversion(multiChapter(), "keep");
    const markers = plan.writes.filter((w) => w.kind === "replaceBreak").map((w) => `${w.chapter}.${w.section}@${w.start}`);
    expect(markers).toEqual(["1.0@10", "2.0@30", "2.1@50", "2.2@110", "3.0@150", "3.1@170"]);
    expect(plan.problems.filter((p) => /left as it is/.test(p.what))).toEqual([]);
    expect(plan.changes.map((c) => c.new)).toEqual(["(2.1.1)", "(2.1.2)"]);
  });

  it("a section heading without a MathType break is listed, and marked when chosen", () => {
    const on = planNumberingConversion(multiChapter(), "keep");
    expect(on.headingsWithoutBreak.map((h) => `${h.text} → ${h.chapter}.${h.section}`)).toEqual(["2.3 Control → 2.3"]);
    expect(on.writes.some((w) => w.kind === "insertMarker" && w.chapter === 2 && w.section === 3 && w.start === 129)).toBe(true);
    const off = planNumberingConversion(multiChapter(), "keep", { markHeadings: false });
    expect(off.writes.some((w) => w.kind === "insertMarker")).toBe(false);
    expect(off.problems.some((p) => /2\.3 Control.*no MathType break/.test(p.what))).toBe(true);
  });
});
