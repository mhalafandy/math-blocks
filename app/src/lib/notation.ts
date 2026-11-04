import type { MathNode, Row } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";

/**
 * Notation of decorated symbols — vectors (r⃗, 𝐫, r⇀), dyadics (I⃡, Ī̄, I̳), unit vectors (ŝ)…
 * A symbol's *form* is how its letter is decorated: accents from outside in, plus its font
 * (bold, bold italic). Changing a notation across a document = replacing one form by another,
 * optionally only for some letters.
 */

export interface NotationForm {
  key: string;
  label: string;
  /** LaTeX with X for the letter. */
  template: string;
  group: "Vectors" | "Dyadics and tensors" | "Unit vectors" | "Other";
}

const T = (group: NotationForm["group"], label: string, template: string): Omit<NotationForm, "key"> => ({ group, label, template });

const CATALOG_SRC = [
  T("Vectors", "Arrow  r⃗", "\\vec{X}"),
  T("Vectors", "Bold with arrow  𝐫⃗", "\\vec{\\mathbf{X}}"),
  T("Vectors", "Harpoon  r⃑", "\\overrightharpoon{X}"),
  T("Vectors", "Bold with harpoon  𝐫⃑", "\\overrightharpoon{\\mathbf{X}}"),
  T("Vectors", "Bold  𝐫", "\\mathbf{X}"),
  T("Vectors", "Bold italic  𝒓", "\\boldsymbol{X}"),
  T("Vectors", "Underline  r̲", "\\underline{X}"),
  T("Vectors", "Bar  r̄", "\\bar{X}"),
  T("Dyadics and tensors", "Double arrow  I⃡", "\\overset{\\leftrightarrow}{X}"),
  T("Dyadics and tensors", "Bold with double arrow", "\\overset{\\leftrightarrow}{\\mathbf{X}}"),
  T("Dyadics and tensors", "Double bar  Ī̄", "\\bar{\\bar{X}}"),
  T("Dyadics and tensors", "Double underline  I̳", "\\underline{\\underline{X}}"),
  T("Dyadics and tensors", "Double arrow (two arrows)", "\\vec{\\vec{X}}"),
  T("Dyadics and tensors", "Bold  𝐈", "\\mathbf{X}"),
  T("Unit vectors", "Hat  ŝ", "\\hat{X}"),
  T("Unit vectors", "Bold with hat  𝐬̂", "\\hat{\\mathbf{X}}"),
  T("Unit vectors", "Bold italic with hat", "\\hat{\\boldsymbol{X}}"),
];

const GREEK = /^[Α-Ωα-ωϑϕϖϰϱϵ]$/;

interface Peeled {
  key: string;
  /** The letter (ident or digit) at the core. */
  core: MathNode & { kind: "ident" | "number" };
}

/** Recognises a decorated symbol; null for anything else (plain letters included). */
export function peel(n: MathNode): Peeled | null {
  const marks: string[] = [];
  let cur: MathNode = n;
  for (;;) {
    if (cur.kind === "accent" && cur.body.children.length === 1) {
      marks.push(cur.accent);
      cur = cur.body.children[0]!;
    } else if (cur.kind === "stack" && cur.position === "over" && !cur.brace && cur.body.children.length === 1 && cur.annotation?.children.length === 1) {
      const a = cur.annotation.children[0]!;
      const ch = a.kind === "operator" || a.kind === "ident" ? a.text : null;
      if (!ch) return null;
      marks.push(`over:${ch}`);
      cur = cur.body.children[0]!;
    } else if (cur.kind === "row" && cur.children.length === 1) {
      cur = cur.children[0]!;
    } else break;
  }
  if ((cur.kind !== "ident" && cur.kind !== "number") || [...cur.text].length !== 1) return null;
  const font = cur.variant === "bold" || cur.variant === "bold-italic" ? cur.variant : "";
  if (!marks.length && !font) return null;
  return { key: [...marks, font].join("|"), core: cur };
}

const keyOf = (template: string) => {
  const root = parseLatex(template.replace(/X/g, "x")).root;
  return root.children.length === 1 ? (peel(root.children[0]!)?.key ?? template) : template;
};

export const CATALOG: NotationForm[] = CATALOG_SRC.map((f) => ({ ...f, key: keyOf(f.template) }));

/** Human label of a form (catalog name, or built from its parts). */
export function formLabel(key: string): string {
  const known = CATALOG.find((f) => f.key === key);
  if (known) return known.label.replace(/\s{2}.*$/, "");
  const parts = key.split("|").filter(Boolean).map((p) => (p === "bold" ? "bold" : p === "bold-italic" ? "bold italic" : p.startsWith("over:") ? `${p.slice(5)} over` : p));
  return parts.join(" + ");
}

/** LaTeX for a letter in a form (Greek letters get bold italic instead of \mathbf). */
export function formLatex(template: string, letterLatex: string, greek: boolean): string {
  const t = greek ? template.replace(/\\mathbf\{X\}/g, "\\boldsymbol{X}") : template;
  return t.replace(/X/g, letterLatex);
}

const letterLatex = (core: Peeled["core"]) => serializeLatex({ kind: "row", children: [{ ...core, variant: undefined } as MathNode] });

export interface FormUse {
  key: string;
  count: number;
  /** Letters (LaTeX) written in this form, with their counts. */
  letters: Map<string, number>;
}

function walk(root: Row, f: (n: MathNode, replace: (m: MathNode) => void) => boolean) {
  const visitRow = (r: Row) => {
    r.children.forEach((c, i) => {
      if (!f(c, (m) => (r.children[i] = m))) visitNode(c);
    });
  };
  const visitNode = (n: MathNode) => {
    for (const [k, v] of Object.entries(n)) {
      if (k === "meta" || k === "kind") continue;
      const each = (x: unknown) => {
        if (!x || typeof x !== "object") return;
        if (Array.isArray(x)) return x.forEach(each);
        const o = x as MathNode;
        if (o.kind === "row") visitRow(o);
        else if (o.kind) visitNode(o);
      };
      each(v);
    }
  };
  visitRow(root);
}

/** The notation forms used in some equations, most used first. */
export function findForms(latexes: string[]): FormUse[] {
  const uses = new Map<string, FormUse>();
  for (const l of latexes) {
    walk(parseLatex(l).root, (n) => {
      const p = peel(n);
      if (!p) return false;
      let u = uses.get(p.key);
      if (!u) uses.set(p.key, (u = { key: p.key, count: 0, letters: new Map() }));
      u.count++;
      const letter = letterLatex(p.core);
      u.letters.set(letter, (u.letters.get(letter) ?? 0) + 1);
      return true;
    });
  }
  return [...uses.values()].sort((a, b) => b.count - a.count);
}

/**
 * Rewrites symbols in form `from` as `toTemplate`; `letters` limits it to some letters (LaTeX,
 * as listed by findForms). Returns the LaTeX unchanged when nothing matches.
 */
export function changeForm(latex: string, from: string, toTemplate: string, letters?: Set<string>): string {
  const root = parseLatex(latex).root;
  let changed = false;
  walk(root, (n, replace) => {
    const p = peel(n);
    if (!p) return false;
    if (p.key !== from) return true;
    const letter = letterLatex(p.core);
    if (letters && !letters.has(letter)) return true;
    const rebuilt = parseLatex(formLatex(toTemplate, letter, GREEK.test(p.core.text))).root;
    replace(rebuilt.children.length === 1 ? rebuilt.children[0]! : rebuilt);
    changed = true;
    return true;
  });
  return changed ? serializeLatex(root) : latex;
}

export interface Inconsistency {
  /** The letter (LaTeX). */
  letter: string;
  /** Its decorated forms with counts, most used first. */
  forms: { key: string; count: number }[];
}

/**
 * Letters written in more than one decorated form across the equations (e.g. r⃗ ten times and
 * 𝐫 twice) — usually a slip. Plain letters are not counted: a plain r is often the magnitude.
 */
export function findInconsistencies(latexes: string[]): Inconsistency[] {
  const byLetter = new Map<string, Map<string, number>>();
  for (const f of findForms(latexes)) {
    for (const [letter, n] of f.letters) {
      if (!byLetter.has(letter)) byLetter.set(letter, new Map());
      byLetter.get(letter)!.set(f.key, (byLetter.get(letter)!.get(f.key) ?? 0) + n);
    }
  }
  const out: Inconsistency[] = [];
  for (const [letter, forms] of byLetter) {
    if (forms.size < 2) continue;
    out.push({ letter, forms: [...forms].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count) });
  }
  return out.sort((a, b) => b.forms.reduce((n, f) => n + f.count, 0) - a.forms.reduce((n, f) => n + f.count, 0));
}

/** The catalogue template of a form (null when it is not in the catalogue). */
export const templateOf = (key: string) => CATALOG.find((f) => f.key === key)?.template ?? null;
