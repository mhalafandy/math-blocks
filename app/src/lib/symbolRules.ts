import { KINDS, type MathNode, type SymbolRule } from "@mathblocks/math-core";
import { parseLatex } from "@mathblocks/math-latex";

/**
 * Symbol rules (docs/KINDS-MODEL.md §3): "e is a constant", "J is a matrix", "ω is a vector when bold".
 * A rule names one symbol — a letter, optionally with its subscript (v_0) — and the kind it gets.
 */

/** The token kinds a rule can give, with their names. */
export const TOKEN_KIND_CHOICES: { id: string; name: string }[] = [
  { id: "variable", name: "variable" },
  { id: "constant", name: "constant" },
  { id: "function", name: "function" },
  { id: "operator", name: "operator" },
  { id: "label", name: "label (in indices)" },
  { id: "counter", name: "counter (in indices)" },
  { id: "unit", name: "unit" },
];

/** The wrapper kinds a rule can give (vectors, matrices, the user's own kinds…). */
export const wrapperKindChoices = () => KINDS.filter((k) => !k.token && k.args === 1 && k.id !== "diff" && k.id !== "frm").map((k) => ({ id: k.id, name: k.name.toLowerCase() }));

/** The name of a rule's kind ("constant", "physical vector"). */
export const kindName = (id: string) => TOKEN_KIND_CHOICES.find((k) => k.id === id)?.name ?? KINDS.find((k) => k.id === id)?.name.toLowerCase() ?? id;

const plainText = (children: MathNode[]): string | null => {
  let out = "";
  for (const c of children) {
    if (c.kind !== "ident" && c.kind !== "number") return null;
    out += c.text;
  }
  return out || null;
};

/**
 * A rule from the symbol as typed (LaTeX: "e", "\\omega", "v_0", "\\mathbf{J}"). A bold symbol makes the rule
 * "when bold" unless `when.bold` says otherwise. Null when the LaTeX is not one symbol.
 */
export function ruleFromLatex(latex: string, kind: string, when: SymbolRule["when"] = {}): SymbolRule | null {
  let root;
  try {
    root = parseLatex(latex.trim()).root;
  } catch {
    return null;
  }
  if (root.children.length !== 1) return null;
  let n = root.children[0]!;
  let sub: string | undefined;
  if (n.kind === "scripts" && !n.sup && n.sub && n.base.children.length === 1) {
    const t = plainText(n.sub.children);
    if (!t) return null;
    sub = t;
    n = n.base.children[0]!;
  }
  if (n.kind !== "ident" || [...n.text].length !== 1) return null;
  const bold = n.variant === "bold" || n.variant === "bold-italic";
  const w: NonNullable<SymbolRule["when"]> = { ...when };
  if (w.bold === undefined && bold) w.bold = true;
  if (w.where === "anywhere") delete w.where;
  return { symbol: latex.trim(), text: n.text, ...(sub ? { sub } : {}), ...(Object.keys(w).length ? { when: w } : {}), kind };
}

/** "ω (bold) → physical vector · in indices" */
export function describeRule(r: SymbolRule): string {
  const cond = [r.when?.bold === true ? "when bold" : r.when?.bold === false ? "when not bold" : "", r.when?.where === "index" ? "in indices" : r.when?.where === "base" ? "outside indices" : ""].filter(Boolean).join(", ");
  return `${kindName(r.kind)}${cond ? ` (${cond})` : ""}`;
}
