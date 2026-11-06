import { strFromU8, unzipSync } from "fflate";
import type { MathNode } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { parseTag } from "@mathblocks/ooxml";
import { readEquationXml } from "./readEquation";
import { definedSymbol, indexEquations, type IndexedEquation, type IndexedSymbol } from "./symbolIndex";
import { findForms, findInconsistencies, type Inconsistency } from "./notation";

/**
 * A thesis kept as one Word file per chapter: the chapters are read from disk (open in Word or
 * not), so symbols, notation, definitions and linked copies can be checked across all of them.
 */

export interface Chapter {
  path: string;
  name: string;
}

export interface ChapterEquation extends IndexedEquation {
  chapter: string;
}

export interface ChapterRead {
  chapter: Chapter;
  equations: ChapterEquation[];
  /** MathType objects not converted yet. */
  mathType: number;
  error?: string;
}

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;
export const chapterOf = (path: string): Chapter => ({ path, name: fileName(path).replace(/\.(docx|docm)$/i, "") });

/** Index of the matching </w:sdt> for the <w:sdt> at `start` (nested controls counted). */
function sdtEnd(xml: string, start: number): number {
  const re = /<w:sdt[\s>]|<\/w:sdt>/g;
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    if (m[0] === "</w:sdt>") {
      depth--;
      if (depth === 0) return m.index + m[0].length;
    } else depth++;
  }
  return -1;
}

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** The cached number "(2.3)" printed after an equation in its paragraph, if any. */
function numberAfter(xml: string, end: number): string | null {
  const pEnd = xml.indexOf("</w:p>", end);
  if (pEnd < 0) return null;
  const rest = xml.slice(end, pEnd);
  if (!/\bSEQ\b|MBEq|MTEqn/.test(rest)) return null;
  const text = [...rest.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => decode(m[1]!)).join("").trim();
  const m = /([([][^()[\]]{1,12}[)\]])\s*$/.exec(text);
  return m ? m[1]! : null;
}

const WRAP = (inner: string) =>
  `<w:body xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${inner}</w:body>`;

/** The MathBlocks equations of a .docx file, in document order. */
export function docxEquations(bytes: Uint8Array, chapter: Chapter): ChapterRead {
  const zip = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  const doc = zip["word/document.xml"];
  if (!doc) return { chapter, equations: [], mathType: 0, error: "Not a Word document" };
  const xml = strFromU8(doc);
  const equations: ChapterEquation[] = [];
  const seen = new Set<number>();
  for (const m of xml.matchAll(/<w:tag w:val="(mb1\|[^"]*)"\/>/g)) {
    const start = Math.max(xml.lastIndexOf("<w:sdt>", m.index), xml.lastIndexOf("<w:sdt ", m.index));
    if (start < 0 || seen.has(start)) continue;
    seen.add(start);
    const end = sdtEnd(xml, start);
    if (end < 0) continue;
    const read = readEquationXml(WRAP(xml.slice(start, end)));
    if (!read || !read.root.children.length) continue;
    const tag = decode(m[1]!);
    equations.push({
      tag,
      page: 0,
      context: chapter.name,
      latex: serializeLatex(read.root),
      display: read.display,
      blockId: parseTag(tag)?.blockId ?? null,
      kind: read.kind,
      numbered: read.numbered,
      number: numberAfter(xml, end),
      chapter: chapter.name,
      at: start,
    } as ChapterEquation & { at: number });
  }
  // Classic equations: a picture whose alt text (or title, where Word keeps one) holds the ID.
  for (const m of xml.matchAll(/<(?:v:shape|wp:docPr)\b[^>]*?\b(?:title="(mb1\|[^"]*)"|(?:alt|descr)="MathBlocks [a-z]+ \((mb1\|[^)"]*)\))/g)) {
    const start = Math.max(xml.lastIndexOf("<w:r>", m.index), xml.lastIndexOf("<w:r ", m.index));
    if (start < 0 || seen.has(start)) continue;
    // Inside a wrapper already read above.
    const sdtOpen = Math.max(xml.lastIndexOf("<w:sdt>", m.index), xml.lastIndexOf("<w:sdt ", m.index));
    if (sdtOpen >= 0 && seen.has(sdtOpen) && sdtEnd(xml, sdtOpen) > m.index) continue;
    seen.add(start);
    const end = xml.indexOf("</w:r>", m.index);
    if (end < 0) continue;
    const runEnd = end + "</w:r>".length;
    const read = readEquationXml(WRAP(xml.slice(start, runEnd)));
    if (!read || !read.root.children.length) continue;
    const tag = decode(m[1] ?? m[2]!);
    equations.push({
      tag,
      page: 0,
      context: chapter.name,
      latex: serializeLatex(read.root),
      display: read.display,
      blockId: parseTag(tag)?.blockId ?? null,
      kind: read.kind,
      numbered: read.numbered,
      number: numberAfter(xml, runEnd),
      chapter: chapter.name,
      at: start,
    } as ChapterEquation & { at: number });
  }
  // Document order (wrapped and titled equations were collected in two passes).
  equations.sort((a, b) => ((a as { at?: number }).at ?? 0) - ((b as { at?: number }).at ?? 0));
  for (const e of equations) delete (e as { at?: number }).at;
  const mathType = (xml.match(/ProgID="Equation\.(DSMT4|3)"/g) ?? []).length;
  return { chapter, equations, mathType };
}

export const placeOf = (e: ChapterEquation) => (e.number ? `${e.chapter} ${e.number}` : e.chapter);

export interface DefinedDifferently {
  symbol: string;
  definitions: { equation: ChapterEquation; rhs: string }[];
}

/** Right-hand side of a defining equation, normalised. */
function rhsOf(latex: string): string {
  const root = parseLatex(latex).root;
  const i = root.children.findIndex((n: MathNode) => n.kind === "operator" && ["=", "≔", "≡", "≜"].includes(n.text));
  return i < 0 ? "" : serializeLatex({ kind: "row", children: root.children.slice(i + 1) });
}

/** Symbols defined by an equation in several chapters, with different right-hand sides. */
export function definedDifferently(reads: ChapterRead[]): DefinedDifferently[] {
  const defs = new Map<string, { equation: ChapterEquation; rhs: string }[]>();
  for (const r of reads) {
    const firstHere = new Set<string>();
    for (const e of r.equations) {
      const sym = definedSymbol(parseLatex(e.latex).root);
      if (!sym || firstHere.has(sym)) continue;
      firstHere.add(sym);
      if (!defs.has(sym)) defs.set(sym, []);
      defs.get(sym)!.push({ equation: e, rhs: rhsOf(e.latex) });
    }
  }
  const out: DefinedDifferently[] = [];
  for (const [symbol, list] of defs) if (new Set(list.map((d) => d.rhs)).size > 1) out.push({ symbol, definitions: list });
  return out;
}

export interface ThesisReport {
  reads: ChapterRead[];
  equations: ChapterEquation[];
  symbols: IndexedSymbol[];
  inconsistencies: (Inconsistency & { chapters: Map<string, string[]> })[];
  definedDifferently: DefinedDifferently[];
  /** Linked copies whose library equation has changed since. */
  outdated: { equation: ChapterEquation; latest: string }[];
}

/** Which chapters use each form of an inconsistent letter. */
function chaptersPerForm(reads: ChapterRead[], inc: Inconsistency): Map<string, string[]> {
  const formsOf = new Map(reads.map((r) => [r.chapter.name, findForms(r.equations.map((e) => e.latex))] as const));
  const out = new Map<string, string[]>();
  for (const f of inc.forms) {
    out.set(
      f.key,
      reads.filter((r) => formsOf.get(r.chapter.name)!.some((u) => u.key === f.key && u.letters.has(inc.letter))).map((r) => r.chapter.name),
    );
  }
  return out;
}

export function analyseThesis(reads: ChapterRead[], latestOf: (blockId: string) => string | null): ThesisReport {
  const equations = reads.flatMap((r) => r.equations);
  const latexes = equations.map((e) => e.latex);
  const inconsistencies = findInconsistencies(latexes).map((inc) => ({ ...inc, chapters: chaptersPerForm(reads, inc) }));
  const outdated: ThesisReport["outdated"] = [];
  for (const e of equations) {
    if (!e.blockId) continue;
    const latest = latestOf(e.blockId);
    if (latest !== null && serializeLatex(parseLatex(latest).root) !== e.latex) outdated.push({ equation: e, latest });
  }
  return { reads, equations, symbols: indexEquations(equations), inconsistencies, definedDifferently: definedDifferently(reads), outdated };
}

const STORE = "mathblocks.thesis.v1";

export function loadChapters(): Chapter[] {
  try {
    const paths = JSON.parse(localStorage.getItem(STORE) ?? "[]") as string[];
    return paths.map(chapterOf);
  } catch {
    return [];
  }
}

export function saveChapters(chapters: Chapter[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(chapters.map((c) => c.path)));
  } catch {
    // Remembering the chapter list is a convenience.
  }
}
