import type { MathNode, Row } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { SYMBOL_CODES } from "@mathblocks/math-render";

/**
 * Suggestions from the document: the forms of each symbol the open document already uses — the
 * notation kinds with their frames and scripts (\pvec[B/N]{\omega}, \cmat{\omega}^{\T}), letters with
 * their usual subscripts (\omega_1) — ranked by how often they occur. Typing a letter offers the forms
 * built on it; on the Latin keyboard, a Greek letter is its Symbol-font key (w → ω, q → θ), as in MathType.
 */

export interface DocForm {
  /** The form's LaTeX, ready to insert. */
  latex: string;
  /** The letter it is built on (ω for \pvec{\omega}). */
  letter: string;
  count: number;
}

const row = (children: MathNode[]): Row => ({ kind: "row", children });

/** The base letter of a node: the letter itself, under an accent, or in a kind's (first) argument. */
function letterOf(n: MathNode): string | null {
  if (n.kind === "ident" && /^\p{L}$/u.test(n.text)) return n.text;
  if (n.kind === "accent" && n.body.children.length === 1) return letterOf(n.body.children[0]!);
  if (n.kind === "notation") {
    const a = n.args[0]?.children;
    return a && a.length === 1 ? letterOf(a[0]!) : null;
  }
  return null;
}

/** Every form used in one equation (a form with a subscript counts as that form). */
export function formsOf(latex: string): { latex: string; letter: string }[] {
  const out: { latex: string; letter: string }[] = [];
  const visit = (r: Row) => {
    for (const n of r.children) {
      if (n.kind === "scripts" && n.base.children.length === 1) {
        const b = n.base.children[0]!;
        const l = letterOf(b);
        if (l && (b.kind === "notation" || n.sub)) {
          // The form with its subscript (frames, indices) and a transpose; other powers are not part of it.
          const sup = n.sup && /\\T\b|^T$/.test(serializeLatex(n.sup)) ? n.sup : undefined;
          out.push({ latex: serializeLatex(row([{ ...n, sup }])), letter: l });
          if (n.sup && !sup) visit(n.sup);
          continue;
        }
      }
      const l = letterOf(n);
      if (l && (n.kind === "notation" || n.kind === "accent" || n.kind === "ident")) out.push({ latex: serializeLatex(row([n])), letter: l });
      if (n.kind !== "ident") {
        for (const [k, v] of Object.entries(n)) {
          if (k === "meta") continue;
          const each = (x: unknown) => {
            if (!x || typeof x !== "object") return;
            if (Array.isArray(x)) return x.forEach(each);
            if ((x as { kind?: string }).kind === "row") visit(x as Row);
          };
          if (n.kind === "notation" && k === "args") continue; // its letter is the form itself
          each(v);
        }
      }
    }
  };
  visit(parseLatex(latex).root);
  return out;
}

/** The forms of a whole document, with their counts. */
export function documentForms(latexes: string[]): DocForm[] {
  const map = new Map<string, DocForm>();
  for (const l of latexes)
    for (const f of formsOf(l)) {
      const e = map.get(f.latex);
      if (e) e.count++;
      else map.set(f.latex, { ...f, count: 1 });
    }
  return [...map.values()];
}

/** Latin key → Greek letter, as the Symbol font lays them out (w → ω, q → θ, j → φ…). */
const KEY_TO_GREEK: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [ch, code] of Object.entries(SYMBOL_CODES)) {
    if (!/^[α-ωΑ-Ωϑϕϖς]$/u.test(ch) || code < 0x41 || code > 0x7a) continue;
    const key = String.fromCharCode(code);
    m[key] ??= ch;
  }
  m.f = "ϕ";
  m.j = "φ";
  return m;
})();

/**
 * Suggestions for a letter just typed: forms built on that letter or on the Greek letter of that key,
 * most used first; a form that is only the bare letter itself is left out (nothing to gain).
 */
export function suggestFor(typed: string, forms: DocForm[], limit = 6): DocForm[] {
  if (!/^\p{L}$/u.test(typed)) return [];
  const letters = new Set([typed, KEY_TO_GREEK[typed]].filter((x): x is string => !!x));
  return forms
    .filter((f) => letters.has(f.letter) && f.latex !== typed)
    .sort((a, b) => b.count - a.count || a.latex.length - b.latex.length)
    .slice(0, limit);
}
