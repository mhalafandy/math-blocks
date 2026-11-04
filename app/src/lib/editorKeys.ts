import { focusedMathField, insertIntoVisual, toggleBold, toMathLive } from "../components/MathEditor";
import { matchSnippet } from "./snippets";
import { addDerivationLine } from "./derivation";
import { useApp } from "./store";

/** Ctrl+Shift+Enter: a new derivation line starting from the previous right-hand side. */
function newDerivationLine() {
  const app = useApp.getState();
  const next = addDerivationLine(app.latex);
  if (!next) {
    app.notify("A derivation line needs an equation with =, ≈, ≤… to align at");
    return;
  }
  app.setLatex(next, "external");
  setTimeout(() => {
    const mf = focusedMathField() ?? document.querySelector<HTMLElement & { executeCommand: (c: string) => void }>("math-field");
    mf?.focus();
    mf?.executeCommand("moveToMathfieldEnd");
  }, 40);
}

/**
 * MathType-style keyboard shortcuts in the equation editor, so MathType habits carry over.
 * They apply only while the equation editor has the focus (elsewhere, the app's own Ctrl+L,
 * Ctrl+J… keep working).
 */

export interface EditorShortcut {
  keys: string;
  label: string;
  /** LaTeX template (#0 = the selection or an empty slot, #? = empty slot) or an editor command. */
  insert?: string;
  command?: string;
  run?: () => void;
}

const GREEK: Record<string, string> = {
  a: "alpha", b: "beta", g: "gamma", d: "delta", e: "epsilon", z: "zeta", h: "eta", q: "theta", i: "iota", k: "kappa",
  l: "lambda", m: "mu", n: "nu", x: "xi", p: "pi", r: "rho", s: "sigma", t: "tau", u: "upsilon", f: "phi", j: "varphi",
  c: "chi", y: "psi", w: "omega", v: "vartheta",
  G: "Gamma", D: "Delta", Q: "Theta", L: "Lambda", X: "Xi", P: "Pi", S: "Sigma", U: "Upsilon", F: "Phi", Y: "Psi", W: "Omega",
};

/** Ctrl+G then a letter: Greek (MathType's Symbol-font letters: q = θ, f = φ, w = ω…). */
let greekNext = false;

export const EDITOR_SHORTCUTS: EditorShortcut[] = [
  { keys: "Ctrl+F", label: "Fraction", insert: "\\frac{#0}{#?}" },
  { keys: "Ctrl+/", label: "Slash fraction a/b", insert: "#0/#?" },
  { keys: "Ctrl+R", label: "Square root", insert: "\\sqrt{#0}" },
  { keys: "Ctrl+Shift+R", label: "n-th root", insert: "\\sqrt[#?]{#0}" },
  { keys: "Ctrl+H", label: "Superscript", command: "moveToSuperscript" },
  { keys: "Ctrl+L", label: "Subscript", command: "moveToSubscript" },
  { keys: "Ctrl+J", label: "Subscript and superscript", insert: "#0_{#?}^{#?}" },
  { keys: "Ctrl+I", label: "Integral with limits", insert: "\\int_{#?}^{#?}#0" },
  { keys: "Ctrl+Shift+S", label: "Sum with limits", insert: "\\sum_{#?}^{#?}#0" },
  { keys: "Ctrl+9", label: "Parentheses ( )", insert: "\\left(#0\\right)" },
  { keys: "Ctrl+[", label: "Brackets [ ]", insert: "\\left[#0\\right]" },
  { keys: "Ctrl+Shift+[", label: "Braces { }", insert: "\\left\\{#0\\right\\}" },
  { keys: "Ctrl+Shift+\\", label: "Absolute value | |", insert: "\\left|#0\\right|" },
  { keys: "Ctrl+Shift+V", label: "Vector arrow", insert: "\\vec{#0}" },
  { keys: "Ctrl+Shift+H", label: "Hat (unit vector)", insert: "\\hat{#0}" },
  { keys: "Ctrl+Shift+D", label: "Dot (time derivative)", insert: "\\dot{#0}" },
  { keys: "Ctrl+Shift+E", label: "Double dot", insert: "\\ddot{#0}" },
  { keys: "Ctrl+Shift+O", label: "Overline (bar)", insert: "\\bar{#0}" },
  { keys: "Ctrl+Shift+M", label: "2×2 matrix in brackets", insert: "\\begin{bmatrix}#?&#?\\\\#?&#?\\end{bmatrix}" },
  { keys: "Ctrl+Shift+B", label: "Bold (vector style) on/off", run: () => toggleBold() },
  { keys: "Ctrl+Space", label: "Thin space", insert: "\\," },
  { keys: "Ctrl+Shift+Enter", label: "New derivation line (aligned at =, starts from the last right-hand side)", run: () => newDerivationLine() },
  { keys: "Ctrl+G, letter", label: "Greek letter (a α, b β, q θ, f φ, w ω, D Δ…)", run: () => (greekNext = true) },
  { keys: "trigger + Tab", label: "Snippet: ddt, pdv, intab, mat3, col3, norm, inv, trans… (Ctrl+K → Snippets)" },
];

function comboOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  // e.code keeps keys layout-independent for punctuation ([, /, \, digits, space).
  const code = e.code;
  const key =
    code === "BracketLeft" ? "[" : code === "BracketRight" ? "]" : code === "Slash" ? "/" : code === "Backslash" ? "\\" : code === "Space" ? "Space" : code.startsWith("Digit") ? code.slice(5) : code.startsWith("Key") ? code.slice(3) : e.key;
  parts.push(key);
  return parts.join("+");
}

/** Handles an editor shortcut; true when the key was used. */
export function handleEditorKey(e: KeyboardEvent): boolean {
  const mf = focusedMathField();
  if (!mf) {
    greekNext = false;
    return false;
  }
  if (greekNext && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
    greekNext = false;
    const name = GREEK[e.key];
    if (name) {
      e.preventDefault();
      e.stopPropagation();
      mf.executeCommand(["insert", `\\${name}`]);
      return true;
    }
    return false;
  }
  // Tab after a snippet trigger ("ddt", "mat3"…) expands it; otherwise Tab moves between slots.
  if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && mf.selectionIsCollapsed) {
    const pos = mf.position;
    const snippet = matchSnippet((n) => (pos >= n ? mf.getValue(pos - n, pos, "latex") : ""));
    if (snippet) {
      e.preventDefault();
      e.stopPropagation();
      mf.selection = { ranges: [[pos - snippet.trigger.length, pos]], direction: "forward" };
      mf.executeCommand(["insert", toMathLive(snippet.latex), { insertionMode: "replaceSelection", selectionMode: "placeholder" }]);
      return true;
    }
    return false;
  }
  if (!(e.ctrlKey || e.metaKey)) return false;
  const combo = comboOf(e);
  const sc = EDITOR_SHORTCUTS.find((s) => s.keys === combo || (s.keys === "Ctrl+G, letter" && combo === "Ctrl+G"));
  if (!sc) return false;
  e.preventDefault();
  e.stopPropagation();
  if (sc.run) sc.run();
  else if (sc.command) mf.executeCommand(sc.command as never);
  else if (sc.insert) insertIntoVisual(sc.insert);
  return true;
}
