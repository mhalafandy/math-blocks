import { KINDS } from "@mathblocks/math-core";

/**
 * Snippets: type a short trigger in the equation editor and press Tab — "ddt" becomes d/dt with
 * a slot to fill, "mat3" a 3×3 matrix. #? marks the slots (Tab moves between them afterwards).
 * The list is editable (Ctrl+K → Snippets…).
 */

export interface Snippet {
  trigger: string;
  latex: string;
  name: string;
}

const PREFIX_KEY = "mathblocks.kindSnippetPrefix";
/** Characters allowed as the kind-snippet prefix: never typed inside a product of variables. */
export const PREFIX_CHARS = [";", ":", "'", "!", "."];

/**
 * Prefix of the notation-kind snippets (";pv", ";dc"…), so typing a product such as uv and
 * pressing Tab to move to the next slot never turns it into a kind. A setting (Snippets dialog).
 */
export function kindSnippetPrefix(): string {
  try {
    const p = localStorage.getItem(PREFIX_KEY);
    if (p !== null && (p === "" || PREFIX_CHARS.includes(p))) return p;
  } catch {
    // Default below.
  }
  return ";";
}

export function setKindSnippetPrefix(p: string) {
  try {
    localStorage.setItem(PREFIX_KEY, p);
  } catch {
    // Not saved.
  }
}

/** One snippet per notation kind (;pv, ;uv, ;dc…): inserts the kind, drawn in the profile's style. */
export function kindSnippets(prefix = kindSnippetPrefix()): Snippet[] {
  return KINDS.map((k) => ({
    trigger: prefix + k.snippet,
    latex: k.id === "T" ? "^{\\T}" : `\\${k.macro}${"{#?}".repeat(k.args)}`,
    name: k.name,
  }));
}

const KIND_LATEX = new Set(kindSnippets("").map((s) => s.latex));
const isKindSnippet = (s: Snippet) => KIND_LATEX.has(s.latex) && KINDS.some((k) => s.trigger.endsWith(k.snippet) && s.trigger.length <= k.snippet.length + 1);

/** Triggers: letters and digits, optionally after one prefix character. */
export const TRIGGER_RE = /^[;:'!.]?[A-Za-z0-9]+$/;

export const BASE_SNIPPETS: Snippet[] = [
  { trigger: "ddt", latex: "\\frac{\\mathrm{d}#?}{\\mathrm{d}t}", name: "Time derivative d/dt" },
  { trigger: "d2dt", latex: "\\frac{\\mathrm{d}^{2}#?}{\\mathrm{d}t^{2}}", name: "Second time derivative" },
  { trigger: "dd", latex: "\\frac{\\mathrm{d}#?}{\\mathrm{d}#?}", name: "Derivative d/dx" },
  { trigger: "pdv", latex: "\\frac{\\partial #?}{\\partial #?}", name: "Partial derivative" },
  { trigger: "pdvt", latex: "\\frac{\\partial #?}{\\partial t}", name: "Partial derivative in time" },
  { trigger: "intab", latex: "\\int_{#?}^{#?}#?\\,\\mathrm{d}#?", name: "Definite integral with dx" },
  { trigger: "sumi", latex: "\\sum_{i=1}^{n}#?", name: "Sum over i = 1…n" },
  { trigger: "mat2", latex: "\\begin{bmatrix}#?&#?\\\\#?&#?\\end{bmatrix}", name: "2×2 matrix" },
  { trigger: "mat3", latex: "\\begin{bmatrix}#?&#?&#?\\\\#?&#?&#?\\\\#?&#?&#?\\end{bmatrix}", name: "3×3 matrix" },
  { trigger: "col3", latex: "\\begin{bmatrix}#?\\\\#?\\\\#?\\end{bmatrix}", name: "Column vector (3)" },
  { trigger: "row3", latex: "\\begin{bmatrix}#?&#?&#?\\end{bmatrix}^{T}", name: "Row vector transposed" },
  { trigger: "skew", latex: "\\begin{bmatrix}0&-#?&#?\\\\#?&0&-#?\\\\-#?&#?&0\\end{bmatrix}", name: "Skew-symmetric (cross-product) matrix" },
  { trigger: "norm", latex: "\\left\\|#?\\right\\|", name: "Norm ‖x‖" },
  { trigger: "abs", latex: "\\left|#?\\right|", name: "Absolute value" },
  { trigger: "inv", latex: "^{-1}", name: "Inverse ⁻¹" },
  { trigger: "trans", latex: "^{\\T}", name: "Transpose ᵀ" },
  { trigger: "cases", latex: "\\begin{cases}#?&#?\\\\#?&#?\\end{cases}", name: "Cases (piecewise)" },
  { trigger: "evalat", latex: "\\left.#?\\right|_{#?}", name: "Evaluated at …" },
  { trigger: "eqv", latex: "\\equiv", name: "Equivalent ≡" },
  { trigger: "defeq", latex: "\\coloneqq", name: "Defined as ≔" },
];

const KEY = "mathblocks.snippets.v1";

export const DEFAULT_SNIPPETS: Snippet[] = [...kindSnippets(";"), ...BASE_SNIPPETS];

export function loadSnippets(): Snippet[] {
  const kinds = kindSnippets();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const list = JSON.parse(raw) as Snippet[];
      if (Array.isArray(list)) {
        // Kind snippets always follow the current prefix (saved copies, with or without a prefix, are replaced).
        const saved = list.filter((s) => s && typeof s.trigger === "string" && typeof s.latex === "string" && !isKindSnippet(s));
        return [...kinds, ...saved];
      }
    }
  } catch {
    // Defaults below.
  }
  return [...kinds, ...BASE_SNIPPETS];
}

export function saveSnippets(list: Snippet[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Not saved.
  }
}

/**
 * The snippet whose trigger ends the text before the cursor (longest first).
 * `before(n)` returns the LaTeX of the last n characters before the cursor.
 */
export function matchSnippet(before: (n: number) => string, list = loadSnippets()): Snippet | null {
  const sorted = [...list].filter((s) => TRIGGER_RE.test(s.trigger)).sort((a, b) => b.trigger.length - a.trigger.length);
  for (const s of sorted) {
    if (before(s.trigger.length).replace(/\s+/g, "") === s.trigger) return s;
  }
  return null;
}
