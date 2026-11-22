import { describe, expect, it } from "vitest";
import { equationFacts, judgeDocument, numberKey, repairPlan, sideBySide, type CheckInput, type EquationFacts } from "./checkDocument";

const pic = (latex: string, o: Partial<EquationFacts> = {}): EquationFacts => ({ kind: "picture", source: latex, alt: latex, mode: "display", styleHash: "S1", widthPt: 40, heightPt: 14, ...o });
const clean: CheckInput = {
  equations: [
    { tag: "a", start: 10, facts: pic("x^2+y^2") },
    { tag: "b", start: 50, facts: pic("\\frac{a}{b}") },
  ],
  numbered: [
    { bookmark: "_MBEq_1", number: "(1.1)", kind: "mathblocks", tag: "a" },
    { bookmark: "_MBEq_2", number: "(1.2)", kind: "mathblocks", tag: "b" },
  ],
  fields: {
    references: [{ start: 5, code: "REF _MBEq_1 \\h", bookmark: "_MBEq_1", shown: "(1.1)", target: "(1.1)", exists: true, linked: true }],
    markers: [
      { start: 1, kind: "MBEquationSection", code: "1.1", hidden: true },
      { start: 20, kind: "MBDefine", code: "\\define{m}{mass}[kg]", hidden: true },
    ],
    mathTypeFields: [],
    mathTypeObjects: [],
    mathTypeBookmarks: 0,
  },
  styleHash: "S1",
  expectedSize: () => ({ widthPt: 40, heightPt: 14 }),
};

describe("Check document", () => {
  it("reports an older reference showing an old number once, as the earlier form", () => {
    const old = { start: 7, code: "GOTOBUTTON _MBEq_2", bookmark: "_MBEq_2", shown: "(1)", target: "(1.2)", exists: true, linked: false };
    const p = judgeDocument({ ...clean, fields: { ...clean.fields, references: [...clean.fields.references, old] } }).filter((x) => x.group === "references");
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ start: 7, repair: "updateNumbers" });
    expect(p[0]!.message).toContain("earlier form");
    expect(p[0]!.message).toContain("showing (1)");
  });
  it("fields left locked: an interrupted Update numbers is an error with the unlock repair; a locked field otherwise a warning", () => {
    const lockedFields = [{ start: 30, code: "DATE \\@ yyyy" }];
    const stopped = judgeDocument({ ...clean, fields: { ...clean.fields, lockedFields, updateInterrupted: true } });
    expect(stopped.find((x) => x.message.includes("stopped before it finished"))).toMatchObject({ severity: "error", repair: "unlockFields", start: 30 });
    expect(repairPlan(stopped, new Set(stopped.map((x) => x.id))).unlockFields).toBe(true);
    const mine = judgeDocument({ ...clean, fields: { ...clean.fields, lockedFields } });
    expect(mine.find((x) => x.message.includes("is locked"))).toMatchObject({ severity: "warning", start: 30 });
    expect(mine.find((x) => x.message.includes("is locked"))!.repair).toBeUndefined();
  });
  it("finds nothing in a clean document", () => {
    expect(judgeDocument(clean)).toEqual([]);
  });
  it("reports each kind of problem, with a safe repair where there is one", () => {
    const bad: CheckInput = {
      ...clean,
      equations: [
        { tag: "a", facts: pic("\\frac{a}{") },
        { tag: "b", facts: pic("x", { styleHash: "OLD" }) },
        { tag: "c", facts: pic("y", { widthPt: 80 }) },
        { tag: "d", facts: pic("z", { alt: "w" }) },
        { tag: "e", facts: pic("u", { kind: "object", objectUnreadable: true }) },
      ],
      numbered: [
        { bookmark: "_MBEq_1", number: "(1.2)", kind: "mathblocks", tag: "a" },
        { bookmark: "_MBEq_2", number: "(1.1)", kind: "mathblocks", tag: "b" },
        { bookmark: "_MBEq_3", number: "(1.1)", kind: "mathblocks", tag: "c" },
      ],
      fields: {
        references: [
          { start: 5, code: "REF _MBEq_9 \\h", bookmark: "_MBEq_9", shown: "(9)", target: "", exists: false, linked: true },
          { start: 6, code: "REF _MBEq_1 \\h", bookmark: "_MBEq_1", shown: "(1.1)", target: "(1.2)", exists: true, linked: true },
          { start: 7, code: "GOTOBUTTON _MBEq_2", bookmark: "_MBEq_2", shown: "(1.1)", target: "(1.1)", exists: true, linked: false },
        ],
        markers: [
          { start: 1, kind: "MBEquationSection", code: "1.1", hidden: false },
          { start: 2, kind: "MBDefine", code: "\\define{m}{mass", hidden: true },
          { start: 3, kind: "MBSymbolList", code: "", hidden: true },
          { start: 4, kind: "MBSymbolList", code: "", hidden: true },
        ],
        mathTypeFields: [{ start: 8, code: "MACROBUTTON MTPlaceRef" }],
        mathTypeObjects: [{ start: 9 }],
        mathTypeBookmarks: 2,
      },
    };
    const p = judgeDocument(bad);
    const by = (s: string) => p.filter((x) => x.message.includes(s));
    expect(by("does not parse")[0]).toMatchObject({ tag: "a" });
    expect(by("does not parse")[0]!.repair).toBeUndefined();
    expect(by("older document style")[0]).toMatchObject({ tag: "b", repair: "redraw", latex: "x" });
    expect(by("does not match its LaTeX")[0]).toMatchObject({ tag: "c", repair: "redraw" });
    expect(by("disagree")[0]).toMatchObject({ tag: "d", repair: "redraw", latex: "z" });
    expect(by("object's data")[0]).toMatchObject({ tag: "e", repair: "redraw", latex: "u" });
    expect(by("used 2 times")[0]).toMatchObject({ repair: "updateNumbers" });
    expect(by("out of date").length).toBeGreaterThan(0);
    expect(by("not in the document")[0]).toMatchObject({ start: 5 });
    expect(by("shows (1.1) but its equation is (1.2)")[0]).toMatchObject({ start: 6, repair: "updateNumbers" });
    expect(by("earlier form")[0]).toMatchObject({ start: 7, repair: "updateNumbers" });
    expect(by("not hidden")[0]).toMatchObject({ start: 1, repair: "hide" });
    expect(by("cannot be read")[0]).toMatchObject({ start: 2 });
    expect(by("lists of symbols")[0]).toMatchObject({ start: 4 });
    expect(by("MathType equation")[0]).toMatchObject({ command: "convertMathType" });
    expect(by("MathType numbering field")[0]).toMatchObject({ command: "convertNumbering" });
  });
  it("orders numbers with appendices after chapters", () => {
    expect(numberKey("(2.10)")).toEqual([[0, 2], [0, 10]]);
    const ok: CheckInput = { ...clean, numbered: ["(9.1)", "(10.1)", "(A.1)", "(B.2)"].map((number, i) => ({ bookmark: `b${i}`, number, kind: "mathblocks" as const, tag: null })) };
    expect(judgeDocument(ok).filter((x) => x.group === "numbering")).toEqual([]);
  });
  it("turns the chosen problems into one repair", () => {
    const p = judgeDocument({ ...clean, equations: [{ tag: "b", facts: pic("x", { styleHash: "OLD" }) }], fields: { ...clean.fields, markers: [{ start: 1, kind: "MBEquationSection", code: "1.1", hidden: false }] } });
    expect(repairPlan(p, new Set(p.map((x) => x.id)))).toEqual({ redraw: [{ tag: "b", latex: "x" }], hide: [1], updateNumbers: false, unlockFields: false, removeDuplicates: [] });
  });
  it("reads a picture's facts from its XML", () => {
    const xml = `<w:r><w:pict><v:shape id="x" alt="MathBlocks inline (mb1|-|abc): v_{0}^{2}" style="width:21.50pt;height:15.00pt"/></w:pict></w:r>`;
    expect(equationFacts(xml)).toMatchObject({ kind: "picture", alt: "v_{0}^{2}", source: "v_0^2", mode: "inline", widthPt: 21.5, heightPt: 15 });
  });
});

describe("the same equation twice side by side (left by an earlier replace)", () => {
  const numbered = [{ bookmark: "_MBEq_1", number: "(1.1)", kind: "mathblocks" as const, tag: "new" }];
  it("finds a restyle's leftover next to it and removes the one without the number", () => {
    const d = sideBySide({ numbered, equations: [{ tag: "new", start: 20, facts: pic("E=mc^2", { styleHash: "S2" }) }, { tag: "old", start: 21, facts: pic("E=mc^2", { styleHash: "S1" }) }] });
    expect(d).toEqual([{ keep: "new", remove: "old", start: 21 }]);
  });
  it("finds an older form of it (notation kinds) and removes the second when neither is numbered", () => {
    const d = sideBySide({ numbered: [], equations: [{ tag: "a", start: 5, facts: pic("\\pvec{v}=\\cmat{v}") }, { tag: "b", start: 6, facts: pic("\\overrightharpoon{\\mathbf{v}}=\\mathbf{v}") }] });
    expect(d.map((x) => x.remove)).toEqual(["b"]);
  });
  it("keeps the numbered one even when it comes second", () => {
    const d = sideBySide({ numbered: [{ ...numbered[0]!, tag: "b" }], equations: [{ tag: "a", start: 5, facts: pic("x") }, { tag: "b", start: 6, facts: pic("x") }] });
    expect(d).toEqual([{ keep: "b", remove: "a", start: 5 }]);
  });
  it("leaves different equations, and equations with text between them, alone", () => {
    expect(sideBySide({ numbered: [], equations: [{ tag: "a", start: 5, facts: pic("x^2") }, { tag: "b", start: 6, facts: pic("\\frac{p}{q}") }] })).toEqual([]);
    expect(sideBySide({ numbered: [], equations: [{ tag: "a", start: 5, facts: pic("x") }, { tag: "b", start: 8, facts: pic("x") }] })).toEqual([]);
  });
  it("is reported with its repair, and a removed equation is not drawn again", () => {
    const input: CheckInput = { ...clean, equations: [{ tag: "a", start: 10, facts: pic("x^2+y^2") }, { tag: "dup", start: 11, facts: pic("x^2+y^2", { styleHash: "OLD" }) }, { tag: "b", start: 50, facts: pic("\\frac{a}{b}") }] };
    const ps = judgeDocument(input);
    const dup = ps.find((p) => p.repair === "removeDuplicate");
    expect(dup?.tag).toBe("dup");
    const plan = repairPlan(ps, new Set(ps.map((p) => p.id)));
    expect(plan.removeDuplicates).toEqual(["dup"]);
    expect(plan.redraw.some((r) => r.tag === "dup")).toBe(false);
  });
});
