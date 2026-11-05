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

const kindLatex = () => new Set(kindSnippets("").map((s) => s.latex));
const kindMacroRe = () => new RegExp(`\\\\(${KINDS.map((k) => k.macro).join("|")})(?![a-zA-Z])|\\^\\{\\\\T\\}`);
/**
 * A kind snippet saved by an older version (any trigger, with or without a prefix, inserting
 * a kind): replaced by the current kind snippets, so an old bare "pv" can never win over ";pv".
 */
const isKindSnippet = (s: Snippet) =>
  kindLatex().has(s.latex) || (kindMacroRe().test(s.latex) && KINDS.some((k) => s.trigger.replace(/^[;:'!.]/, "") === k.snippet));

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

/** How the editor spells what was typed, back to the typed characters (prime, colon…). */
export function typedText(latex: string): string {
  return latex
    .replace(/\^\{\\prime\}|\^\\prime\b|\\prime\b/g, "'")
    .replace(/\\colon\b/g, ":")
    // Some keyboards come back as spacing commands: \; \: \! are the typed ; : !
    .replace(/\\([;:!])/g, "$1")
    .replace(/\\mathpunct\{(.)\}|\\mathrel\{(.)\}|\\mathord\{(.)\}/g, (_, a, b, c) => a ?? b ?? c)
    .replace(/\\ldotp\b/g, ".")
    // MathLive autocorrects while typing ("in" → ∈, "int" → ∫): read commands as their letters.
    .replace(/\\([A-Za-z]+)/g, "$1")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, "");
}

/**
 * The snippet whose trigger ends just before the cursor, and how many editor positions it takes
 * (one typed character is not always one position: a prime is a superscript). `range(k)` is the
 * editor's LaTeX of the last k positions. The whole trigger, prefix included, is to be replaced.
 */
export function findTrigger(range: (k: number) => string, list = loadSnippets()): { snippet: Snippet; positions: number } | null {
  const sorted = [...list].filter((s) => TRIGGER_RE.test(s.trigger)).sort((a, b) => b.trigger.length - a.trigger.length);
  const typed: string[] = [];
  for (let k = 1; k <= 16; k++) typed.push(typedText(range(k)));
  for (const s of sorted) {
    // The fewest positions whose typed text is exactly the trigger.
    const k = typed.findIndex((t) => t === s.trigger);
    if (k >= 0) return { snippet: s, positions: k + 1 };
  }
  return null;
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
