import type { MathNode, Row } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";

/**
 * Derivations: a new line that starts from the previous right-hand side, aligned at the
 * relation, so a step-by-step derivation is typed by editing the copy.
 */

const RELATIONS = new Set(["=", "≈", "≡", "≜", "≔", "<", ">", "≤", "≥", "≠", "∝", "⇒", "⇔", "→", "∼", "≃", "≅"]);
const isRelation = (n: MathNode) => n.kind === "operator" && RELATIONS.has(n.text);
const row = (children: MathNode[]): Row => ({ kind: "row", children });
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** The LaTeX with one more derivation line, or null when there is no relation to align at. */
export function addDerivationLine(latex: string): string | null {
  const root = parseLatex(latex).root;
  const only = root.children.length === 1 ? root.children[0]! : null;
  if (only?.kind === "aligned" && only.env !== "gathered") {
    const last = only.rows[only.rows.length - 1];
    if (!last?.length) return null;
    // "A &= B" → "&= B"; a row without & is split at its first relation.
    let rest: Row;
    if (last.length > 1) rest = row(last.slice(1).flatMap((c) => c.children));
    else {
      const i = last[0]!.children.findIndex(isRelation);
      if (i < 0) return null;
      rest = row(last[0]!.children.slice(i));
    }
    only.rows.push([row([]), clone(rest)]);
    return serializeLatex(root);
  }
  const i = root.children.findIndex(isRelation);
  if (i <= 0) return null;
  const lhs = row(root.children.slice(0, i));
  const rest = row(root.children.slice(i));
  return serializeLatex(row([{ kind: "aligned", env: "aligned", rows: [[lhs, rest], [row([]), clone(rest)]] } as MathNode]));
}
