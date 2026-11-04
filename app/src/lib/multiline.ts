import type { Aligned, MathNode, Row } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";

/**
 * Multi-line display equations, edited at the caret: the editor puts CARET where the cursor is,
 * these functions rewrite the LaTeX, and the editor puts the cursor back where CARET ends up
 * (then deletes it). Everything is stored as aligned / gathered / multline, so Word (OMML), the
 * Classic picture and the .tex export all read the same structure.
 */

/** Caret marker (U+2B1E): typed into MathLive as a plain symbol, found again by position. */
export const CARET = "⬞";

const RELATIONS = new Set(["=", "≈", "≡", "≜", "≔", "<", ">", "≤", "≥", "≠", "∝", "⇒", "⇔", "→", "∼", "≃", "≅", "≪", "≫"]);
const BINARY = new Set(["+", "−", "-", "±", "∓", "·", "×"]);
const isRelation = (n: MathNode | undefined) => n?.kind === "operator" && RELATIONS.has(n.text);
const isBinary = (n: MathNode | undefined) => n?.kind === "operator" && BINARY.has(n.text);
const isCaret = (n: MathNode | undefined) => n?.kind === "operator" && n.text === CARET;
const row = (children: MathNode[]): Row => ({ kind: "row", children });
const caretNode = (): MathNode => ({ kind: "operator", text: CARET, opClass: "ordinary" }) as MathNode;
const quad = (): MathNode => ({ kind: "space", width: "quad" }) as MathNode;
const aligned = (env: Aligned["env"], rows: Row[][]): Row => row([{ kind: "aligned", env, rows } as MathNode]);

export type LineResult = { latex: string } | { error: string };

/** The start of a continued line: "\quad" before a leading + or −, so it reads as a continuation. */
function continued(children: MathNode[]): MathNode[] {
  const first = children.find((n) => !isCaret(n));
  return isBinary(first) ? [quad(), ...children] : children;
}

/**
 * The only top-level multi-line node, if the equation is one. Anything typed before or after it
 * (MathLive's End key leaves the environment) joins its first or last line.
 */
function onlyAligned(root: Row): Aligned | null {
  const at = root.children.findIndex((n) => n.kind === "aligned");
  if (at < 0 || root.children.some((n, i) => i !== at && n.kind === "aligned")) return null;
  const al = root.children[at] as Aligned;
  const before = root.children.slice(0, at);
  const after = root.children.slice(at + 1);
  if (before.length) {
    const first = al.rows[0] ?? (al.rows[0] = [row([])]);
    first[0] = row([...before, ...(first[0]?.children ?? [])]);
  }
  if (after.length) {
    const last = al.rows[al.rows.length - 1] ?? (al.rows[0] = [row([])]);
    const cell = last.length - 1;
    last[cell] = row([...(last[cell]?.children ?? []), ...after]);
  }
  root.children = [al];
  return al;
}

const NESTED = { error: "Put the cursor between terms (not inside a fraction, root or bracket) to break the line there" };

/**
 * Enter in a display equation: a new line at the caret.
 * - one line with a relation before the caret → aligned at that relation, the rest continues on
 *   the next line ("&\quad + …", or "&= …" when the break is right before a relation);
 * - one line with no relation → gathered (centred lines);
 * - already multi-line → the current line is split, keeping its environment.
 * The returned LaTeX has CARET at the start of the new line.
 */
export function breakLineAt(latexWithCaret: string): LineResult {
  const root = parseLatex(latexWithCaret).root;
  const al = onlyAligned(root);
  if (!al) {
    const k = root.children.findIndex(isCaret);
    if (k < 0) return NESTED;
    const before = root.children.slice(0, k);
    const after = root.children.slice(k + 1);
    const r = before.findIndex(isRelation);
    if (r > 0) return { latex: serializeLatex(aligned("aligned", [[row(before.slice(0, r)), row(before.slice(r))], [row([]), row([caretNode(), ...continued(after)])]])) };
    const ar = after.findIndex(isRelation);
    if (ar === 0 && before.length) return { latex: serializeLatex(aligned("aligned", [[row(before)], [row([]), row([caretNode(), ...after])]])) };
    return { latex: serializeLatex(aligned("gathered", [[row(before)], [row([caretNode(), ...after])]])) };
  }
  for (let i = 0; i < al.rows.length; i++) {
    const cells = al.rows[i]!;
    for (let j = 0; j < cells.length; j++) {
      const k = cells[j]!.children.findIndex(isCaret);
      if (k < 0) continue;
      const before = cells[j]!.children.slice(0, k);
      const after = cells[j]!.children.slice(k + 1);
      const restCells = cells.slice(j + 1);
      let next: Row[];
      if (al.env === "gathered" || al.env === "multline") next = [row([caretNode(), ...after])];
      else if (j === 0 && !restCells.length && isRelation(after[0])) next = [row([]), row([caretNode(), ...after])];
      else if (j === 0) next = [row([caretNode(), ...after]), ...restCells];
      else next = [row([]), row([caretNode(), ...continued(after)]), ...restCells];
      al.rows.splice(i, 1, [...cells.slice(0, j), row(before)], next);
      return { latex: serializeLatex(root) };
    }
  }
  return NESTED;
}

/**
 * Ctrl+; (alignment mark): the current line aligns at the caret. A single line becomes an
 * aligned equation; a gathered one becomes aligned (the other lines align at their first
 * relation). The returned LaTeX keeps CARET where it was.
 */
export function setAlignmentAt(latexWithCaret: string): LineResult {
  const root = parseLatex(latexWithCaret).root;
  const al = onlyAligned(root);
  const splitAt = (children: MathNode[]): Row[] => {
    const k = children.findIndex(isCaret);
    return [row(children.slice(0, k)), row(children.slice(k))];
  };
  const atRelation = (children: MathNode[]): Row[] => {
    const r = children.findIndex(isRelation);
    return r > 0 ? [row(children.slice(0, r)), row(children.slice(r))] : [row([]), row(children)];
  };
  if (!al) {
    if (root.children.findIndex(isCaret) < 0) return NESTED;
    return { latex: serializeLatex(aligned("aligned", [splitAt(root.children)])) };
  }
  if (al.env === "multline") return { error: "A broken long equation (multline) has no alignment point: use an aligned derivation instead" };
  let found = false;
  al.rows = al.rows.map((cells) => {
    const flat = cells.flatMap((c) => c.children);
    if (flat.some(isCaret)) {
      found = true;
      return splitAt(flat);
    }
    return al.env === "gathered" ? atRelation(flat) : cells;
  });
  if (!found) return NESTED;
  al.env = "aligned";
  return { latex: serializeLatex(root) };
}

/** Line templates: aligned derivation, broken long equation, gathered lines, continued line. */
export const LINE_TEMPLATES = [
  { id: "aligned3", latex: "\\begin{aligned}#? &= #?\\\\ &= #?\\\\ &= #?\\end{aligned}", label: "Aligned derivation (3 lines)", keywords: "align equal signs steps derivation multi-line" },
  { id: "multline2", latex: "\\begin{multline}#? \\\\ #?\\end{multline}", label: "Long equation broken over lines (multline)", keywords: "multline break long equation page width" },
  { id: "gathered2", latex: "\\begin{gathered}#?\\\\ #?\\end{gathered}", label: "Lines centred, not aligned (gathered)", keywords: "gather gathered centred lines" },
  { id: "continued", latex: "\\begin{aligned}#? &= #?\\\\ &\\quad + #?\\end{aligned}", label: "Continued line (+ … on the next line)", keywords: "continued continuation long sum break" },
] as const;

/*
 * MathLive treats multline as a top-level mode that a field never leaves again (setting another
 * value keeps it wrapped in multline). The editor therefore holds a multline as a marked gathered:
 * \class{mb-multline}{\begin{gathered}…\end{gathered}} (lines show centred while editing; the
 * Classic preview and Word show the real layout).
 */
const ML_OPEN = "\\class{mb-multline}{\\begin{gathered}";

export function multlineToEditor(latex: string): string {
  return latex.replace(/\\begin\{multline\*?\}/g, ML_OPEN).replace(/\\end\{multline\*?\}/g, "\\end{gathered}}");
}

export function multlineFromEditor(latex: string): string {
  let at = latex.indexOf(ML_OPEN);
  while (at >= 0) {
    // The matching \end{gathered} (gathered can nest inside).
    const re = /\\(begin|end)\{gathered\}/g;
    re.lastIndex = at + ML_OPEN.length;
    let depth = 1;
    let m: RegExpExecArray | null;
    let end = -1;
    while ((m = re.exec(latex))) {
      depth += m[1] === "begin" ? 1 : -1;
      if (depth === 0) {
        end = m.index;
        break;
      }
    }
    const close = "\\end{gathered}}";
    if (end < 0 || !latex.startsWith(close, end)) break;
    latex = `${latex.slice(0, at)}\\begin{multline}${latex.slice(at + ML_OPEN.length, end)}\\end{multline}${latex.slice(end + close.length)}`;
    at = latex.indexOf(ML_OPEN);
  }
  return latex;
}
