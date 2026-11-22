/**
 * Generates the text guard's test fixtures (connector-word/tests/guard-fixtures/gen-*.json): before/after records of
 * whole-document operations, as the add-in records them (WordOps.Operation RecordGuardDoc). The structures are what
 * the add-in writes into Word — the field codes are copied from a real self-test run (0.1.148): linked references
 * (REF \h, whose range text Word returns without field characters), MathType's GOTOBUTTON around REF, numbers
 * (MACROBUTTON MBPlaceRef with SEQ/STYLEREF inside), hidden markers (\mbnumbering → MBEquationSection, \define →
 * MBDefine) and the list of symbols (MBSymbolList marker and its table). Generic text only.
 *
 * Recorded fixtures (rec-*.json) come from the self-test itself (guard-fixtures/ in its folder).
 *
 * Run: pnpm tsx tools/make-guard-fixtures.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";

type Tok =
  | { k: "t"; text: string; written?: boolean }
  | { k: "latex"; text: string }
  | { k: "eq"; replaced?: boolean }
  | { k: "f"; code: string; result: Tok[]; linked?: boolean }
  | { k: "table"; rows: string[][]; list?: boolean };

const t = (text: string): Tok => ({ k: "t", text });
const latex = (text: string): Tok => ({ k: "latex", text });
const eq: Tok = { k: "eq" };
/** An equation the operation replaces (Toggle LaTeX: it becomes its LaTeX text): excluded like LaTeX being converted. */
const eqReplaced: Tok = { k: "eq", replaced: true };
const f = (code: string, result: Tok[] = [], linked = false): Tok => ({ k: "f", code, result, linked });
const P = "\r";

interface GuardDoc {
  end: number;
  fields: { start: number; end: number; code: string }[];
  equations: [number, number][];
  lists: [number, number][];
  chunks: { start: number; end: number; text: string }[];
}

/** Lays the tokens out at Word character positions and records the document as the add-in does. */
function record(toks: Tok[]): { doc: GuardDoc; exclude: [number, number][]; written: [number, number][]; writtenText: string[] } {
  // One entry per position: the text Range.Text gives for it ("" when Word leaves it out).
  const chars: string[] = [];
  const fields: GuardDoc["fields"] = [];
  const equations: [number, number][] = [];
  const lists: [number, number][] = [];
  const exclude: [number, number][] = [];
  const written: [number, number][] = [];
  const writtenText: string[] = [];
  const put = (s: string, visible = true) => {
    for (const c of s) chars.push(visible ? c : "");
  };
  const lay = (ts: Tok[], hidden: boolean) => {
    for (const x of ts) {
      if (x.k === "t") {
        const s = chars.length;
        put(x.text, !hidden);
        if (x.written) {
          written.push([s, chars.length]);
          writtenText.push(x.text);
        }
      }
      else if (x.k === "latex") {
        const s = chars.length;
        put(x.text, !hidden);
        exclude.push([s, chars.length]);
      } else if (x.k === "eq") {
        const s = chars.length;
        put("\u0001", !hidden);
        equations.push([s, chars.length]);
        if (x.replaced) exclude.push([s, chars.length]);
      } else if (x.k === "f") {
        const s = chars.length;
        // A linked REF (\h) reads as its result alone; other fields with their codes and field characters.
        const showCode = !x.linked && !hidden;
        put("\u0013", showCode);
        put(` ${x.code} `, showCode);
        put("\u0014", showCode);
        lay(x.result, hidden);
        put("\u0015", showCode);
        fields.push({ start: s, end: chars.length, code: ` ${x.code} ` });
      } else if (x.k === "table") {
        const s = chars.length;
        for (const row of x.rows) {
          for (const cell of row) {
            put(cell, !hidden);
            chars.push("\r\u0007"); // end of cell: one position, two characters of text
          }
          chars.push("\r\u0007"); // end of row
        }
        if (x.list) {
          // The list starts at its marker field (laid out just before the table by the caller).
          const marker = fields[fields.length - 1]!;
          lists.push([marker.start, chars.length]);
        }
        void s;
      }
    }
  };
  lay(toks, false);
  chars.push("\r"); // the document's last paragraph mark
  const end = chars.length;
  const cuts = new Set<number>([0, end]);
  for (const r of [...fields.map((x) => [x.start, x.end] as [number, number]), ...equations, ...lists, ...exclude, ...written]) {
    cuts.add(r[0]);
    cuts.add(r[1]);
  }
  const sorted = [...cuts].sort((a, b) => a - b);
  const chunks: GuardDoc["chunks"] = [];
  for (let i = 0; i + 1 < sorted.length; i++) chunks.push({ start: sorted[i]!, end: sorted[i + 1]!, text: chars.slice(sorted[i], sorted[i + 1]).join("") });
  return { doc: { end, fields, equations, lists, chunks }, exclude, written, writtenText };
}

// The field codes the add-in writes (copied from a real run).
const refLinked = (bm: string, shown: string) => f(`REF ${bm} \\h \\* Charformat \\! \\* MERGEFORMAT`, [t(shown)], true);
const refOld = (bm: string, shown: string) => f(`GOTOBUTTON ${bm}  \\* MERGEFORMAT`, [f(`REF ${bm} \\* Charformat \\! \\* MERGEFORMAT`, [t(shown)])]);
const number = (shown: string) =>
  f("MACROBUTTON MBPlaceRef \\* MERGEFORMAT", [t("("), f("STYLEREF 1 \\s", [t("1")]), t("."), f("SEQ MBSec \\c \\* ARABIC \\* MERGEFORMAT", [t("1")]), t("."), f("SEQ MBEq \\* ARABIC \\* MERGEFORMAT", [t(shown.slice(-2, -1))]), t(")")]);
const mtNumber = (shown: string) => f("MACROBUTTON MTPlaceRef \\* MERGEFORMAT", [f("SEQ MTEqn \\h \\* MERGEFORMAT", []), t(shown)]);
const sectionMarker = (label: string) => f("MACROBUTTON MBEquationSection", [t(label)]);
const define = (tag: string) => f(`MACROBUTTON MBDefine ${tag}`, []);
const listMarker = f("MACROBUTTON MBSymbolList", []);

interface Fixture {
  operation: string;
  source: string;
  expect: "unchanged" | "changed";
  exclude: [number, number][];
  /** Text the operation writes on purpose (positions after it), and that text: the guard checks each range holds exactly it. */
  written?: [number, number][];
  writtenText?: string[];
  before: GuardDoc;
  after: GuardDoc;
}
const fixtures: Record<string, Fixture> = {};
/**
 * widen: the written range the operation reports, made wider than the text it wrote ([chars on the left, on the
 * right], for the range at `index`); the record's boundaries follow the reported range, as RecordGuardDoc's do.
 */
const make = (name: string, operation: string, before: Tok[], after: Tok[], expect: Fixture["expect"] = "unchanged", widen?: { index?: number; left: number; right: number }) => {
  const b = record(before);
  let a = record(after);
  if (widen) {
    const i = widen.index ?? 0;
    const w = a.written.map((r, k): [number, number] => (k === i ? [r[0] - widen.left, r[1] + widen.right] : r));
    a = { ...a, written: w, doc: rechunk(a.doc, w) };
  }
  fixtures[name] = { operation, source: "generated (tools/make-guard-fixtures.ts) from the field codes of a 0.1.148 self-test run", expect, exclude: b.exclude, ...(a.written.length ? { written: a.written, writtenText: a.writtenText } : {}), before: b.doc, after: a.doc };
};

/** The record's chunks cut again at extra boundaries (a reported range that is not where the text was written). */
function rechunk(doc: GuardDoc, ranges: [number, number][]): GuardDoc {
  const text = doc.chunks.map((c) => c.text);
  const chars: string[] = [];
  // Per position: a chunk's text is spread over its positions (the last position takes any extra characters).
  for (const c of doc.chunks) {
    const n = c.end - c.start;
    const parts = [...c.text];
    for (let k = 0; k < n; k++) chars.push(k < n - 1 ? (parts[k] ?? "") : parts.slice(k).join(""));
  }
  void text;
  const cuts = new Set<number>(doc.chunks.flatMap((c) => [c.start, c.end]));
  for (const r of ranges) {
    cuts.add(r[0]);
    cuts.add(r[1]);
  }
  const sorted = [...cuts].sort((x, y) => x - y);
  const chunks: GuardDoc["chunks"] = [];
  for (let i = 0; i + 1 < sorted.length; i++) chunks.push({ start: sorted[i]!, end: sorted[i + 1]!, text: chars.slice(sorted[i], sorted[i + 1]).join("") });
  return { ...doc, chunks };
}

// Convert LaTeX: inline and display equations, \eqref/\ref (linked references), a section marker, a number.
const sentence = (r1: Tok, r2: Tok): Tok[] => [t("The derivation "), r1, t(" gives the value "), r2, t("."), t(P)];
const convertBefore: Tok[] = [
  latex("\\mbnumbering{1.1}"),
  t(P),
  ...sentence(latex("\\eqref{eq:1.1.1}"), latex("\\ref{eq:1.1.2}")),
  t("Mass "),
  latex("$m$"),
  t(" is given."),
  t(P),
  t("\t"),
  latex("$$y=a+b$$"),
  t("\t"),
  latex("\\label{eq:1.1.1}"),
  t(P),
  t("\t"),
  latex("$$x=1$$"),
  t("\t"),
  latex("\\label{eq:1.1.2}"),
  t(P),
  t("Again "),
  latex("\\eqref{eq:1.1.2}"),
  t("."),
];
const convertAfter = (r: (bm: string, shown: string) => Tok, extra: Tok[] = []): Tok[] => [
  sectionMarker("1.1"),
  t(P),
  ...sentence(r("_MBEq_1_1_1", "(1.1.1)"), r("_MBEqN_1_1_2", "1.1.2")),
  t("Mass "),
  eq,
  t(" is given."),
  t(P),
  t("\t"),
  eq,
  t("\t"),
  number("(1.1.1)"),
  t(P),
  t("\t"),
  eq,
  t("\t"),
  number("(1.1.2)"),
  t(P),
  t("Again "),
  r("_MBEq_1_1_2", "(1.1.2)"),
  t("."),
  ...extra,
];
make("gen-convert-latex", "Convert LaTeX (linked references, numbers, a section marker)", convertBefore, convertAfter(refLinked));
// Real changes the guard must catch.
make("gen-convert-latex-typed-word", "Convert LaTeX that also typed a word", convertBefore, convertAfter(refLinked).map((x) => (x.k === "t" && x.text === " gives the value " ? t(" gives the exact value ") : x)), "changed");
make("gen-convert-latex-deleted-space", "Convert LaTeX that also deleted a space", convertBefore, convertAfter(refLinked).map((x) => (x.k === "t" && x.text === " gives the value " ? t(" gives thevalue ") : x)), "changed");

// Update numbers on an older document: GOTOBUTTON + REF become linked REF \h.
const oldDoc = (r: (bm: string, shown: string) => Tok): Tok[] => [t("Older references: "), r("_MBEq_1_1_1", "(1.1.1)"), t(" and "), r("_MBEqN_1_1_2", "1.1.2"), t("."), t(P), t("\t"), eq, t("\t"), number("(1.1.1)")];
make("gen-update-numbers-old-references", "Update numbers (older references become links)", oldDoc(refOld), oldDoc(refLinked));

// Convert numbering: MathType's numbers and references become MathBlocks ones.
const mtDoc = (n: (s: string) => Tok, r: (bm: string, shown: string) => Tok): Tok[] => [t("From "), r("ZEqnNum100001", "(A.1)"), t(" the result follows."), t(P), t("\t"), eq, t("\t"), n("(A.1)")];
make("gen-convert-numbering", "Convert numbering (MathType's numbers become MathBlocks numbers)", mtDoc(mtNumber, refOld), mtDoc(number, refLinked));

// \define tags become hidden markers.
make(
  "gen-define-markers",
  "Convert LaTeX (\\define tags become hidden markers)",
  [t("The body has mass "), latex("\\define{m}{mass of the body}[kg]"), t(". It moves with speed "), latex("\\define{v}{speed}[m/s]"), t(".")],
  [t("The body has mass "), define("\\define{m}{mass of the body}[kg]"), t(". It moves with speed "), define("\\define{v}{speed}[m/s]"), t(".")],
);

// The list of symbols: inserted (marker paragraph + table), then updated in place with one more row.
const body: Tok[] = [t("The body has mass "), define("\\define{m}{mass of the body}[kg]"), t("."), t(P)];
const table = (rows: string[][]): Tok[] => [listMarker, t(P), { k: "table", rows, list: true }];
const rows1 = [
  ["Symbol", "Meaning", "Unit"],
  ["m", "mass of the body", "kg"],
];
make("gen-symbol-list-insert", "Update the list of symbols (first time: marker and table)", body, [...table(rows1), ...body]);
make("gen-symbol-list-update", "Update the list of symbols (replaced in place)", [...table(rows1), ...body, t("Acceleration "), define("\\define{a}{acceleration}[m/s^2]"), t(".")], [...table([...rows1, ["a", "acceleration", "m/s^2"]]), ...body, t("Acceleration "), define("\\define{a}{acceleration}[m/s^2]"), t(".")]);

// Change symbol: the definition's marker gets the new symbol (meaning and unit kept), equations are redrawn, the
// list of symbols is rewritten in place; a plain-text mention of the letter stays as it was.
const quantity = (sym: string): Tok[] => [
  listMarker,
  t(P),
  { k: "table", rows: [["Symbol", "Meaning", "Unit"], ["\u0001", "angular velocity of the body", "rad/s"]], list: true },
  t("The body turns with angular velocity "),
  eq,
  t(" "),
  define(`\\define{${sym}}{angular velocity of the body}[rad/s]`),
  t(". In the text it is called ω."),
  t(P),
  t("\t"),
  eq,
  t("\t"),
  number("(1.1.1)"),
  t(P),
  t("From "),
  refLinked("_MBEq_1_1_1", "(1.1.1)"),
  t(" it follows."),
];
make("gen-change-symbol", "Change symbol (definition, equations and the list; the text mention stays)", quantity("\\pvec{\\omega}"), quantity("\\pvec{\\Omega}"));
make("gen-change-symbol-text-edited", "Change symbol that also changed the text mention (must be caught)", quantity("\\pvec{\\omega}"), quantity("\\pvec{\\Omega}").map((x) => (x.k === "t" && x.text.includes("called ω") ? t(". In the text it is called Ω.") : x)), "changed");

// Check document's repair: markers hidden (a field property), numbers and references updated (field results),
// pictures drawn again: nothing outside fields and equations changes.
const checked = (shown: string): Tok[] => [
  sectionMarker("1.1"),
  t(P),
  t("The value follows from "),
  refLinked("_MBEq_1_1_1", shown),
  t(" and "),
  refOld("_MBEq_1_1_2", "(1.1.2)"),
  t("."),
  t(P),
  t("\t"),
  eq,
  t("\t"),
  number("(1.1.1)"),
];
make("gen-check-document-repair", "Repair (Check document): markers hidden, numbers and references updated, pictures redrawn", checked("(1.1.3)"), checked("(1.1.1)").map((x) => (x.k === "f" && x.code.startsWith("GOTOBUTTON") ? refLinked("_MBEq_1_1_2", "(1.1.2)") : x)));

// Convert LaTeX in a footnote: the main text keeps its footnote mark (a special character) and its own text; the
// equation is written in the footnote's story, which the guard of the main text does not compare.
const withNote = (inline: Tok): Tok[] => [t("The result holds"), t("\u0002"), t(" for every case, see "), inline, t("."), t(P)];
// Toggle LaTeX (0.1.169): a numbered display equation becomes its LaTeX text and back. The number field (and its
// bookmark) stays in the paragraph, a reference elsewhere keeps showing it; the LaTeX text carries a bookmark of
// its own (invisible in the text) so the equation comes back with its ID.
/** LaTeX text the operation writes in place of an equation. */
const latexWritten = (text: string): Tok => ({ k: "t", text, written: true });
const toggled = (middle: Tok): Tok[] => [t("By "), refLinked("_MBEq_1_1_1", "(1.1.1)"), t(" the sides agree."), t(P), t("\t"), middle, t("\t"), number("(1.1.1)"), t(P), t("Text after."), t(P)];
make("gen-toggle-equation-to-latex", "Toggle LaTeX: a numbered equation becomes its LaTeX text (number, bookmark, references kept)", toggled(eqReplaced), toggled(latexWritten("\\[a^2+b^2=c^2\\]")));
make("gen-toggle-latex-to-equation", "Toggle LaTeX: the LaTeX text becomes the equation again (number, bookmark, references kept)", toggled(latex("\\[a^2+b^2=c^2\\]")), toggled(eq));
// The written range must hold exactly the LaTeX written: a range reported one character too wide (on either side)
// would leave the neighbouring text out of the comparison, so it fails even when that text is intact.
const sentenceWith = (middle: Tok): Tok[] => [t("The value "), middle, t(" follows."), t(P)];
make("gen-toggle-inline", "Toggle LaTeX: an inline equation in a sentence becomes its LaTeX text", sentenceWith(eqReplaced), sentenceWith(latexWritten("$x^2$")));
make("gen-toggle-written-wide-left", "Toggle LaTeX reporting its written range one character too wide on the left (must be caught)", sentenceWith(eqReplaced), sentenceWith(latexWritten("$x^2$")), "changed", { left: 1, right: 0 });
make("gen-toggle-written-wide-right", "Toggle LaTeX reporting its written range one character too wide on the right (must be caught)", sentenceWith(eqReplaced), sentenceWith(latexWritten("$x^2$")), "changed", { left: 0, right: 1 });
const punct = (middle: Tok): Tok[] => [t("It holds (see "), middle, t(")."), t(P)];
make("gen-toggle-punctuation", "Toggle LaTeX next to punctuation", punct(eqReplaced), punct(latexWritten("$a=b$")));
make("gen-toggle-punctuation-wide", "Toggle LaTeX next to punctuation, the range taking in the closing bracket (must be caught)", punct(eqReplaced), punct(latexWritten("$a=b$")), "changed", { left: 0, right: 1 });
const adjacent = (a: Tok, b: Tok): Tok[] => [t("Both of these "), a, b, t(" hold here."), t(P)];
make("gen-toggle-adjacent", "Toggle LaTeX on two adjacent equations (selection)", adjacent(eqReplaced, eqReplaced), adjacent(latexWritten("$x$"), latexWritten("$y$")));
make("gen-toggle-adjacent-wide", "Toggle LaTeX on two adjacent equations, the first range taking in the second's first character (must be caught)", adjacent(eqReplaced, eqReplaced), adjacent(latexWritten("$x$"), latexWritten("$y$")), "changed", { index: 0, left: 0, right: 1 });
make("gen-toggle-numbered-wide", "Toggle LaTeX on a numbered line, the range taking in the tab before the number (must be caught)", toggled(eqReplaced), toggled(latexWritten("\\[a^2+b^2=c^2\\]")), "changed", { left: 0, right: 1 });
make("gen-toggle-text-edited", "Toggle LaTeX that also changed the text after it (must be caught)", toggled(eqReplaced), toggled(latexWritten("\\[a^2+b^2=c^2\\]")).map((x) => (x.k === "t" && x.text === "Text after." ? t("Text afer.") : x)), "changed");
// Repair (Check document): an equation twice side by side (an earlier version's replace left the old picture next to
// the new one) is removed; the text around it must stay as it was.
const twice = (...eqs: Tok[]): Tok[] => [t("The energy "), ...eqs, t(" is conserved."), t(P), t("\t"), eq, t("\t"), number("(1.1.1)"), t(P)];
make("gen-remove-duplicate", "Repair (Check document): the second of two identical equations side by side removed", twice(eq, eq), twice(eq));
make("gen-remove-duplicate-text", "Repair (Check document) that also removed a letter after the equation (must be caught)", twice(eq, eq), twice(eq).map((x) => (x.k === "t" && x.text === " is conserved." ? t(" s conserved.") : x)), "changed");
make("gen-convert-latex-footnote", "Convert LaTeX with a footnote mark in the main text", withNote(latex("$x$")), withNote(eq));

const dir = new URL("../connector-word/tests/guard-fixtures/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [name, fx] of Object.entries(fixtures)) writeFileSync(new URL(`${name}.json`, dir), JSON.stringify(fx, null, 1) + "\n");
console.log(`${Object.keys(fixtures).length} fixtures written to connector-word/tests/guard-fixtures/`);
