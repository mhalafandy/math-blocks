import type { MathNode, Row, Scripts } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";

/**
 * Symbols of an equation, as a reader would name them: x, θ, v₀, r⃗, ŝ₂, 𝐪_ab.
 * A symbol is a letter (possibly bold or under an accent) with its subscript; superscripts are
 * powers, not part of the name. Used by templates (insert with other symbols) and the symbol
 * index (where is v₀ used? rename it everywhere).
 */

export interface SymbolUse {
  /** Canonical LaTeX of the symbol, e.g. "v_{0}", "\\vec{r}". */
  key: string;
  count: number;
}

const row = (children: MathNode[]): Row => ({ kind: "row", children });

/** Upright d, e, i (differentials, constants) are not variables. */
function isVariable(n: MathNode): boolean {
  if (n.kind === "ident") {
    if (!/^\p{L}$/u.test(n.text)) return n.text === "∂" ? false : /^[\p{L}]/u.test(n.text);
    if (n.variant === "normal" && /^[dei]$/.test(n.text)) return false;
    return true;
  }
  if (n.kind === "accent") return n.body.children.length === 1 && isVariable(n.body.children[0]!);
  return false;
}

/** The symbol a node stands for (with its node form), or null. */
function symbolOf(n: MathNode): { key: string; core: MathNode; sub?: Row } | null {
  if (isVariable(n)) return { key: serializeLatex(row([n])), core: n };
  if (n.kind === "scripts" && n.base.children.length === 1 && isVariable(n.base.children[0]!)) {
    const core = n.base.children[0]!;
    const unit: MathNode = n.sub ? { kind: "scripts", base: row([core]), sub: n.sub } : core;
    return { key: serializeLatex(row([unit])), core, sub: n.sub };
  }
  return null;
}

function eachDirectRows(n: MathNode, f: (r: Row) => void) {
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(visit);
    const o = v as { kind?: string };
    if (o.kind === "row") f(o as Row);
  };
  for (const [k, v] of Object.entries(n)) if (k !== "meta" && k !== "kind") visit(v);
}

/** Visits every symbol occurrence once (the base letter of v_0 is not visited again on its own). */
function eachSymbol(root: Row, f: (key: string) => void) {
  const visit = (r: Row) => {
    for (const c of r.children) {
      const sym = symbolOf(c);
      if (sym) f(sym.key);
      if (sym && c.kind === "scripts") {
        // The subscript is part of the name (v_0, m_b), not a symbol of its own.
        if (c.sup) visit(c.sup);
      } else if (!sym) eachDirectRows(c, visit);
    }
  };
  visit(root);
}

export function listSymbols(root: Row): SymbolUse[] {
  const counts = new Map<string, number>();
  eachSymbol(root, (key) => counts.set(key, (counts.get(key) ?? 0) + 1));
  return [...counts].map(([key, count]) => ({ key, count }));
}

/** Parses the LaTeX a user typed for a symbol into a row. */
export const symbolRow = (latex: string): Row => parseLatex(latex).root;

/**
 * Returns a copy of the tree with symbols replaced (keys from listSymbols). Powers stay:
 * renaming v_0 → u_1 turns v_0^2 into u_1^2.
 */
export function renameSymbols(root: Row, map: Map<string, Row>): Row {
  const mapRow = (r: Row): Row => row(r.children.flatMap(mapNode));
  const mapNode = (n: MathNode): MathNode[] => {
    const s = symbolOf(n);
    const to = s ? map.get(s.key) : undefined;
    if (s && to) {
      const sup = n.kind === "scripts" ? n.sup : undefined;
      if (!sup) return to.children.map(clone);
      // Keep the power: attach it to the replacement.
      const only = to.children.length === 1 ? to.children[0]! : null;
      if (only && only.kind === "scripts" && !only.sup) return [{ ...clone(only), sup: mapRow(sup) } as Scripts];
      return [{ kind: "scripts", base: row(to.children.map(clone)), sup: mapRow(sup) }];
    }
    // A different symbol (x_0 when renaming x): leave its name alone, only its power changes.
    if (s && n.kind === "scripts") return [{ ...clone(n), sup: n.sup ? mapRow(n.sup) : undefined } as Scripts];
    if (s) return [clone(n)];
    return [mapInside(n)];
  };
  const mapInside = (n: MathNode): MathNode => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n)) out[k] = mapValue(v);
    return out as unknown as MathNode;
  };
  const mapValue = (v: unknown): unknown => {
    if (!v || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(mapValue);
    const o = v as { kind?: string };
    if (o.kind === "row") return mapRow(o as Row);
    if (o.kind) return mapInside(o as MathNode);
    return v;
  };
  return mapRow(root);
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Convenience: rename in LaTeX. */
export function renameInLatex(latex: string, renames: Record<string, string>): string {
  const map = new Map<string, Row>();
  for (const [k, v] of Object.entries(renames)) if (v.trim() && v.trim() !== k) map.set(k, symbolRow(v));
  if (!map.size) return latex;
  return serializeLatex(renameSymbols(parseLatex(latex).root, map));
}
