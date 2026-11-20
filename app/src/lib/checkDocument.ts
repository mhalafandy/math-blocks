import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { decodeEntities } from "@mathblocks/math-omml";
import { objectSource, readEquationXml } from "./readEquation";
import { parseDefineTag } from "./symbolList";

/**
 * Check document (pure part; the Word side is checkDocumentRun.ts): one report of what could be wrong in a document
 * MathBlocks wrote into — each equation's stored LaTeX parses, its picture matches its LaTeX and the document style,
 * an embedded object's data is there, the numbers are in order and unique, every reference points to an equation
 * and shows its number, the hidden markers are hidden and readable, nothing of MathType is left, and pictures drawn
 * in an older style. Each problem says where it is (to go to it) and whether a safe repair exists.
 */

export type Repair = "redraw" | "hide" | "updateNumbers";

export interface Problem {
  id: string;
  /** Group in the report. */
  group: "equations" | "style" | "numbering" | "references" | "markers" | "mathtype";
  severity: "error" | "warning";
  message: string;
  /** Where: an equation (its ID) or a position in the main text. */
  tag?: string;
  start?: number;
  /** A safe repair (one Ctrl+Z for all chosen repairs), or none (fix by hand / another command). */
  repair?: Repair;
  /** For redraw: the LaTeX to draw it from (its own source, or its description when the source is unreadable). */
  latex?: string;
  /** For a problem fixed by another command: which. */
  command?: "convertMathType" | "convertNumbering";
}

export interface EquationFacts {
  kind: "native" | "picture" | "object";
  /** Its source (object data, the picture's hidden source, or the native equation read back). */
  source: string | null;
  /** The LaTeX in its description (alt text). */
  alt: string | null;
  mode: "display" | "inline" | "numbered";
  styleHash?: string;
  widthPt?: number;
  heightPt?: number;
  /** An embedded object whose data could not be read. */
  objectUnreadable?: boolean;
}

const ALT = /(?:descr|alt)="MathBlocks (display|inline|numbered)(?: \([^)"]*\))?: ([^"]*)"/;

/** What the check needs of one equation, from its XML as listInstances gives it. */
export function equationFacts(xml: string): EquationFacts {
  const alt = ALT.exec(xml);
  const isObject = /ProgID="MathBlocks\.Equation"/.test(xml);
  let read: ReturnType<typeof readEquationXml> = null;
  try {
    read = readEquationXml(xml);
  } catch {
    read = null;
  }
  const kind: EquationFacts["kind"] = isObject ? "object" : read?.kind === "native" ? "native" : "picture";
  // An object's own data holds the source; without it, readEquationXml falls back to the picture or the alt text.
  const objectUnreadable = isObject && !objectSource(xml);
  let widthPt: number | undefined;
  let heightPt: number | undefined;
  const vml = /style="[^"]*?width:([\d.]+)pt;\s*height:([\d.]+)pt/.exec(xml);
  const dml = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(xml);
  if (vml) {
    widthPt = Number(vml[1]);
    heightPt = Number(vml[2]);
  } else if (dml) {
    widthPt = Number(dml[1]) / 12700;
    heightPt = Number(dml[2]) / 12700;
  }
  const source = read && read.root.children.length ? serializeLatex(read.root) : null;
  return {
    kind,
    source,
    alt: alt ? decodeEntities(alt[2]!) : null,
    mode: alt ? (alt[1] as EquationFacts["mode"]) : read?.numbered ? "numbered" : read?.display ? "display" : "inline",
    ...(read?.styleHash ? { styleHash: read.styleHash } : {}),
    ...(widthPt !== undefined ? { widthPt, heightPt } : {}),
    ...(objectUnreadable ? { objectUnreadable } : {}),
  };
}

export interface CheckInput {
  equations: { tag: string; start?: number; story?: string; facts: EquationFacts }[];
  numbered: { bookmark: string; number: string; kind: "mathblocks" | "mathtype"; tag: string | null }[];
  fields: {
    references: { start: number; code: string; bookmark: string; shown: string; target: string; exists: boolean; linked: boolean }[];
    markers: { start: number; kind: string; code: string; hidden: boolean }[];
    mathTypeFields: { start: number; code: string }[];
    mathTypeObjects: { start: number }[];
    mathTypeBookmarks: number;
  };
  /** The document style's fingerprint now. */
  styleHash: string;
  /** The size a picture drawn now from this LaTeX would have (null when unknown). */
  expectedSize?: (latex: string, mode: EquationFacts["mode"]) => { widthPt: number; heightPt: number } | null;
}

const norm = (latex: string) => {
  try {
    return serializeLatex(parseLatex(latex).root);
  } catch {
    return latex;
  }
};

/** Sort key of a number "(2.10)", "[A-1]": numeric parts by value, letters (appendices) after numbers. */
export function numberKey(n: string): [number, number][] {
  return (n.match(/[0-9]+|[A-Za-z]+/g) ?? []).map((p) => (/^[0-9]+$/.test(p) ? [0, Number(p)] : [1, p.toUpperCase().charCodeAt(0) * 1000 + p.length]));
}

function compareKeys(a: [number, number][], b: [number, number][]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (!x) return -1;
    if (!y) return 1;
    if (x[0] !== y[0]) return x[0] - y[0];
    if (x[1] !== y[1]) return x[1] - y[1];
  }
  return 0;
}

const bare = (s: string) => s.replace(/\s+/g, "");

/** The report: every problem found, in the order of the groups. */
export function judgeDocument(input: CheckInput): Problem[] {
  const out: Problem[] = [];
  let n = 0;
  const add = (p: Omit<Problem, "id">) => out.push({ ...p, id: `p${++n}` });

  for (const e of input.equations) {
    const f = e.facts;
    const where = { tag: e.tag, ...(e.start !== undefined ? { start: e.start } : {}) };
    if (f.objectUnreadable) {
      add({ group: "equations", severity: "error", message: "Its embedded object's data is missing or unreadable", ...where, ...(f.alt ? { repair: "redraw" as const, latex: f.alt } : {}) });
      continue;
    }
    const src = f.source ?? f.alt;
    if (!src) {
      add({ group: "equations", severity: "error", message: "Its LaTeX could not be read", ...where });
      continue;
    }
    const diags = (() => {
      try {
        return parseLatex(src).diagnostics.filter((d) => d.severity === "error");
      } catch (err) {
        return [{ message: err instanceof Error ? err.message : String(err) }];
      }
    })();
    if (diags.length) add({ group: "equations", severity: "error", message: `Its stored LaTeX does not parse: ${diags[0]!.message}`, ...where });
    if (f.kind === "native") continue;
    if (f.source && f.alt && norm(f.source) !== norm(f.alt)) add({ group: "equations", severity: "warning", message: "Its description and its source disagree (drawn again from its source)", ...where, repair: "redraw", latex: f.source });
    if (f.styleHash && f.styleHash !== input.styleHash) add({ group: "style", severity: "warning", message: "Drawn in an older document style", ...where, repair: "redraw", latex: src });
    else if (f.widthPt !== undefined && f.heightPt !== undefined && input.expectedSize && !diags.length) {
      const want = input.expectedSize(src, f.mode);
      if (want && (Math.abs(want.widthPt - f.widthPt) > 0.75 || Math.abs(want.heightPt - f.heightPt!) > 0.75))
        add({ group: "equations", severity: "warning", message: `Its picture does not match its LaTeX (${f.widthPt.toFixed(1)} × ${f.heightPt!.toFixed(1)} pt, drawn now ${want.widthPt.toFixed(1)} × ${want.heightPt.toFixed(1)} pt: resized or out of date)`, ...where, repair: "redraw", latex: src });
    }
  }

  // Numbers: unique and in document order (each later number after the one before).
  const mb = input.numbered.filter((x) => x.kind === "mathblocks");
  const seen = new Map<string, number>();
  for (const x of mb) seen.set(bare(x.number), (seen.get(bare(x.number)) ?? 0) + 1);
  for (const [num, count] of seen) if (count > 1) add({ group: "numbering", severity: "error", message: `Number ${num} is used ${count} times`, ...(mb.find((x) => bare(x.number) === num)?.tag ? { tag: mb.find((x) => bare(x.number) === num)!.tag! } : {}), repair: "updateNumbers" });
  for (let i = 1; i < mb.length; i++) {
    if (compareKeys(numberKey(mb[i - 1]!.number), numberKey(mb[i]!.number)) >= 0 && bare(mb[i - 1]!.number) !== bare(mb[i]!.number))
      add({ group: "numbering", severity: "warning", message: `Number ${mb[i]!.number} comes after ${mb[i - 1]!.number}: the numbers are out of date`, ...(mb[i]!.tag ? { tag: mb[i]!.tag! } : {}), repair: "updateNumbers" });
  }

  for (const r of input.fields.references) {
    if (!r.exists) add({ group: "references", severity: "error", message: `A reference to an equation that is not in the document (${r.bookmark})${r.shown ? `, showing ${r.shown}` : ""}`, start: r.start });
    // The earlier form first: Update numbers turns it into a link and corrects what it shows, one problem.
    else if (!r.linked) add({ group: "references", severity: "warning", message: `A reference to ${r.target} in the earlier form (not a link)${bare(r.shown) !== bare(r.target) ? `, showing ${r.shown || "nothing"}` : ""}`, start: r.start, repair: "updateNumbers" });
    else if (bare(r.shown) !== bare(r.target)) add({ group: "references", severity: "error", message: `A reference shows ${r.shown || "nothing"} but its equation is ${r.target}`, start: r.start, repair: "updateNumbers" });
  }

  const lists = input.fields.markers.filter((m) => m.kind === "MBSymbolList");
  if (lists.length > 1) add({ group: "markers", severity: "warning", message: `${lists.length} lists of symbols (markers): only the first is updated`, start: lists[1]!.start });
  const defineSeen = new Map<string, number>();
  for (const m of input.fields.markers) {
    if (!m.hidden) add({ group: "markers", severity: "warning", message: `A ${m.kind === "MBDefine" ? "symbol definition" : m.kind === "MBSymbolList" ? "list-of-symbols" : "section"} marker is not hidden (it would print)`, start: m.start, repair: "hide" });
    if (m.kind === "MBDefine") {
      if (!parseDefineTag(m.code)) add({ group: "markers", severity: "error", message: `A symbol definition cannot be read: ${m.code.slice(0, 60)}`, start: m.start });
      else if (defineSeen.has(m.code)) add({ group: "markers", severity: "warning", message: `The same definition twice: ${m.code.slice(0, 60)}`, start: m.start });
      defineSeen.set(m.code, m.start);
    }
    if (m.kind === "MBEquationSection" && !m.code.trim()) add({ group: "markers", severity: "error", message: "A section marker without its chapter/section", start: m.start });
  }

  const mt = input.fields;
  if (mt.mathTypeObjects.length) add({ group: "mathtype", severity: "warning", message: `${mt.mathTypeObjects.length} MathType equation(s) left`, start: mt.mathTypeObjects[0]!.start, command: "convertMathType" });
  if (mt.mathTypeFields.length) add({ group: "mathtype", severity: "warning", message: `${mt.mathTypeFields.length} MathType numbering field(s) left`, start: mt.mathTypeFields[0]!.start, command: "convertNumbering" });
  if (mt.mathTypeBookmarks && !mt.mathTypeFields.length) add({ group: "mathtype", severity: "warning", message: `${mt.mathTypeBookmarks} MathType bookmark(s) left (ZEqnNum…)`, command: "convertNumbering" });
  return out;
}

/** The repairs chosen, as the work they need: equations to draw again, markers to hide, whether to update numbers. */
export function repairPlan(problems: Problem[], chosen: Set<string>): { redraw: { tag: string; latex: string }[]; hide: number[]; updateNumbers: boolean } {
  const redraw = new Map<string, string>();
  const hide = new Set<number>();
  let updateNumbers = false;
  for (const p of problems) {
    if (!chosen.has(p.id) || !p.repair) continue;
    if (p.repair === "redraw" && p.tag && p.latex) redraw.set(p.tag, p.latex);
    if (p.repair === "hide" && p.start !== undefined) hide.add(p.start);
    if (p.repair === "updateNumbers") updateNumbers = true;
  }
  return { redraw: [...redraw].map(([tag, latex]) => ({ tag, latex })), hide: [...hide], updateNumbers };
}
