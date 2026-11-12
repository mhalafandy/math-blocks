import type { MathNode, Row } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";

/**
 * The quick-style bar's actions on a piece of LaTeX (the selection, or the symbol before the caret).
 * Pure functions: the bar applies them to the editor, the tests check them.
 */

export type QuickAccent = "overrightharpoon" | "vec" | "hat" | "bar" | "dot";

export const QUICK_ACCENTS: { id: QuickAccent; label: string; title: string }[] = [
  { id: "overrightharpoon", label: "x⃑", title: "Harpoon" },
  { id: "vec", label: "x⃗", title: "Arrow" },
  { id: "hat", label: "x̂", title: "Hat" },
  { id: "bar", label: "x̄", title: "Bar" },
  { id: "dot", label: "ẋ", title: "Dot (time derivative)" },
];

/** The accent applied to the LaTeX, or taken off when it already has exactly that accent outside. */
export function toggledAccent(src: string, accent: QuickAccent): string {
  const root = parseLatex(src).root;
  const only = root.children.length === 1 ? root.children[0]! : null;
  const same = only && only.kind === "accent" && (only.accent === accent || (accent === "vec" && only.accent === "overrightarrow"));
  if (same) return serializeLatex(only.body);
  return `\\${accent}{${src.trim()}}`;
}

const letters = (r: Row): Extract<MathNode, { kind: "ident" }>[] => {
  const out: Extract<MathNode, { kind: "ident" }>[] = [];
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(visit);
    const n = v as MathNode;
    if (n.kind === "ident") out.push(n);
    for (const [k, x] of Object.entries(n)) if (k !== "meta") visit(x);
  };
  visit(r);
  return out;
};

/**
 * Italic ↔ upright for the letters: all upright → their default shape again (the document style draws
 * them); otherwise upright. Bold letters stay bold (upright bold is \mathbf already).
 */
export function toggledUpright(src: string): string {
  const root = parseLatex(src).root;
  const ls = letters(root).filter((l) => l.variant !== "bold" && l.variant !== "bold-italic");
  if (!ls.length) return src;
  const allUpright = ls.every((l) => l.variant === "normal");
  for (const l of ls) {
    if (allUpright) delete l.variant;
    else l.variant = "normal";
  }
  return serializeLatex(root);
}
