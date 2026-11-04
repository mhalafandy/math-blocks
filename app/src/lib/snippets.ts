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

/** One snippet per notation kind (pv, uv, dc…): inserts the kind, drawn in the profile's style. */
export const KIND_SNIPPETS: Snippet[] = KINDS.map((k) => ({
  trigger: k.snippet,
  latex: k.id === "T" ? "^{\\T}" : `\\${k.macro}${"{#?}".repeat(k.args)}`,
  name: k.name,
}));

export const DEFAULT_SNIPPETS: Snippet[] = [
  ...KIND_SNIPPETS,
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

export function loadSnippets(): Snippet[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const list = JSON.parse(raw) as Snippet[];
      if (Array.isArray(list)) {
        const saved = list.filter((s) => s && typeof s.trigger === "string" && typeof s.latex === "string");
        // Kind snippets added after the list was saved join it (the user's own entries win).
        const have = new Set(saved.map((s) => s.trigger));
        return [...saved, ...KIND_SNIPPETS.filter((k) => !have.has(k.trigger))];
      }
    }
  } catch {
    // Defaults below.
  }
  return DEFAULT_SNIPPETS;
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
  const sorted = [...list].filter((s) => /^[A-Za-z0-9]+$/.test(s.trigger)).sort((a, b) => b.trigger.length - a.trigger.length);
  for (const s of sorted) {
    if (before(s.trigger.length).replace(/\s+/g, "") === s.trigger) return s;
  }
  return null;
}
