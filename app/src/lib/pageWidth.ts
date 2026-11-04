import type { Aligned, MathNode, Row } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";

/**
 * Page-width check: does a display equation fit its line, and where could a long one break?
 * Equations are never shrunk; a too-wide one gets a suggested line break that the user confirms.
 */

/** Text width when Word is not connected: MathType's right tab in Appendix A (8787 twips). */
export const DEFAULT_TEXT_WIDTH_PT = 439.35;
/** Space kept between a numbered equation and its number. */
export const NUMBER_GAP_PT = 12;

/**
 * The width an equation may take. Unnumbered display equations are centred on the text column;
 * numbered ones are centred on the centre tab (half the text width) with the number right-aligned
 * at the right tab, so they must stay clear of the number on both sides.
 */
export function availableWidth(textWidthPt: number, numbered: boolean, numberWidthPt = 0): number {
  return numbered ? Math.max(0, textWidthPt - 2 * (numberWidthPt + NUMBER_GAP_PT)) : textWidthPt;
}

const RELATIONS = new Set(["=", "≈", "≡", "≜", "≔", "<", ">", "≤", "≥", "≠", "∝", "⇒", "⇔", "→", "∼", "≃", "≅"]);
const BREAKABLE = new Set(["+", "−", "-", "±", "∓"]);
const isRelation = (n: MathNode | undefined) => n?.kind === "operator" && RELATIONS.has(n.text);
const isBreak = (n: MathNode | undefined) => n?.kind === "operator" && (BREAKABLE.has(n.text) || RELATIONS.has(n.text));
const row = (children: MathNode[]): Row => ({ kind: "row", children });
const quad = (): MathNode => ({ kind: "space", width: "quad" }) as MathNode;
const node = (env: Aligned["env"], rows: Row[][]): Row => row([{ kind: "aligned", env, rows } as MathNode]);

/** Splits before every top-level + − ± ∓ or relation (not at the very start). */
function segments(children: MathNode[], from = 1): MathNode[][] {
  const out: MathNode[][] = [];
  let cur: MathNode[] = [];
  children.forEach((c, i) => {
    if (i >= from && isBreak(c) && cur.length) {
      out.push(cur);
      cur = [];
    }
    cur.push(c);
  });
  if (cur.length) out.push(cur);
  return out;
}

/** Greedy: as much as fits on each line (measured as the whole built equation). */
function greedy(segs: MathNode[][], build: (lines: MathNode[][]) => Row, measure: (r: Row) => number, avail: number): MathNode[][] {
  const lines: MathNode[][] = [];
  let cur: MathNode[] = segs[0] ?? [];
  for (const s of segs.slice(1)) {
    if (measure(build([...lines, [...cur, ...s]])) <= avail) cur = [...cur, ...s];
    else {
      lines.push(cur);
      cur = s;
    }
  }
  lines.push(cur);
  return lines;
}

/** A continuation line of an aligned derivation: "&\quad + …", or "&= …" for a new relation. */
const continuation = (line: MathNode[]): Row => row(isRelation(line[0]) ? line : [quad(), ...line]);

export interface BreakSuggestion {
  latex: string;
  lines: number;
  /** False when even the broken equation is wider than the line (a single term too wide). */
  fits: boolean;
}

/**
 * A suggested line break for an equation wider than `avail` (points):
 * - one line with a relation → aligned at the relation, continued lines "&\quad + …";
 * - one line without a relation → multline (first line left, last right);
 * - an aligned derivation → its too-wide lines are continued on extra lines;
 * - a multline → its lines are re-broken.
 * Null when the equation fits or has nowhere to break.
 */
export function suggestBreak(latex: string, measureLatex: (latex: string) => number, avail: number): BreakSuggestion | null {
  const measure = (r: Row) => measureLatex(serializeLatex(r));
  const root = parseLatex(latex).root;
  if (measure(root) <= avail) return null;
  const only = root.children.length === 1 && root.children[0]!.kind === "aligned" ? (root.children[0] as Aligned) : null;
  let result: Row | null = null;

  if (!only) {
    const r = root.children.findIndex(isRelation);
    if (r > 0) {
      const head = root.children.slice(0, r);
      const build = (lines: MathNode[][]) => node("aligned", lines.map((l, i) => (i === 0 ? [row(head), row(l)] : [row([]), continuation(l)])));
      const lines = greedy(segments(root.children.slice(r), 2), build, measure, avail);
      if (lines.length > 1) result = build(lines);
    } else {
      const build = (lines: MathNode[][]) => node("multline", lines.map((l) => [row(l)]));
      const lines = greedy(segments(root.children), build, measure, avail);
      if (lines.length > 1) result = build(lines);
    }
  } else if (only.env === "multline") {
    const build = (lines: MathNode[][]) => node("multline", lines.map((l) => [row(l)]));
    const lines = greedy(segments(only.rows.flatMap((cells) => cells.flatMap((c) => c.children))), build, measure, avail);
    if (lines.length !== only.rows.length || lines.length > 1) result = build(lines);
  } else if (only.env !== "gathered") {
    // Aligned: each too-wide line is continued; the widest left side keeps the column width honest.
    const widestHead = only.rows.reduce<Row>((w, cells) => (cells.length > 1 && measure(cells[0]!) > measure(w) ? cells[0]! : w), row([]));
    const rows: Row[][] = [];
    for (const cells of only.rows) {
      if (cells.length < 2) {
        rows.push(cells);
        continue;
      }
      const head = cells[0]!;
      const body = cells.slice(1).flatMap((c) => c.children);
      const build = (lines: MathNode[][]) =>
        node("aligned", [...lines.map((l, i) => (i === 0 ? [head, row(l)] : [row([]), continuation(l)])), [widestHead, row([])]]);
      const lines = greedy(segments(body, 2), build, measure, avail);
      lines.forEach((l, i) => rows.push(i === 0 ? [head, row(l)] : [row([]), continuation(l)]));
    }
    if (rows.length > only.rows.length) result = node(only.env === "align" ? "aligned" : only.env, rows);
  }
  if (!result) return null;
  const out = serializeLatex(result);
  const rowsOut = (result.children[0] as Aligned).rows.length;
  return { latex: out, lines: rowsOut, fits: measure(result) <= avail };
}
