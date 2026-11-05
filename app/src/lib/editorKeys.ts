import { focusedMathField, fromMathLive, insertIntoVisual, toggleBold, toMathLive } from "../components/MathEditor";
import { breakLineAt, CARET, setAlignmentAt, type LineResult } from "./multiline";
import { findTrigger, kindSnippets } from "./snippets";
import { KIND_BY_MACRO } from "@mathblocks/math-core";
import { applySnippet, type SnippetField } from "./snippetApply";
import { exitKind, type KindField } from "./kindExit";
import { SHORTCUT_TABLE } from "./editorShortcuts";
import { addDerivationLine } from "./derivation";
import { useApp } from "./store";
import { applyTranspose } from "./palette";

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

type Field = NonNullable<ReturnType<typeof focusedMathField>>;

/**
 * Rewrites the equation at the cursor (new line, alignment mark): a marker goes in at the cursor,
 * the LaTeX is rewritten, and the cursor returns to where the marker ends up.
 */
function rewriteAtCaret(mf: Field, fn: (latexWithCaret: string) => LineResult) {
  const app = useApp.getState();
  if (!mf.selectionIsCollapsed) mf.position = Math.max(...mf.selection.ranges.flat());
  mf.executeCommand(["insert", CARET]);
  const r = fn(fromMathLive(mf.value));
  if ("error" in r) {
    mf.executeCommand("deleteBackward");
    app.notify(r.error);
    return;
  }
  mf.setValue(toMathLive(r.latex), { silenceNotifications: true });
  for (let i = 0; i < mf.lastOffset; i++) {
    if (!mf.getValue(i, i + 1, "latex").includes(CARET)) continue;
    mf.selection = { ranges: [[i, i + 1]], direction: "forward" };
    mf.executeCommand("deleteBackward");
    break;
  }
  app.setLatex(fromMathLive(mf.value).replaceAll(CARET, ""), "visual");
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

const RUN: Record<string, () => void> = {
  "Ctrl+Shift+B": () => toggleBold(),
  "Ctrl+G, letter": () => (greekNext = true),
  "Ctrl+Shift+Enter": () => newDerivationLine(),
  "Ctrl+;": () => {
    const mf = focusedMathField();
    if (mf) rewriteAtCaret(mf, setAlignmentAt);
  },
};

export const EDITOR_SHORTCUTS: EditorShortcut[] = SHORTCUT_TABLE.map((d) => (RUN[d.keys] ? { ...d, run: RUN[d.keys] } : d));

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

/** The offsets of a whole kind object (\class{nk-…}{…}) ending (dir −1) or starting (dir +1) at `pos`. */
function kindRangeAt(mf: { getValue: (a: number, b: number, f: "latex") => string; lastOffset: number }, pos: number, dir: -1 | 1): [number, number] | null {
  for (let n = 1; n <= 80; n++) {
    const [a, b] = dir < 0 ? [pos - n, pos] : [pos, pos + n];
    if (a < 0 || b > mf.lastOffset) return null;
    const v = mf.getValue(a, b, "latex");
    if (v.startsWith("\\class{nk-") && completeGroup(v)) return [a, b];
  }
  return null;
}

/** "\class{name}{body}" exactly, nothing before or after. */
function completeGroup(v: string): boolean {
  const nameEnd = v.indexOf("}");
  if (nameEnd < 0 || v[nameEnd + 1] !== "{") return false;
  let depth = 0;
  for (let i = nameEnd + 1; i < v.length; i++) {
    const c = v[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i === v.length - 1;
  }
  return false;
}

let lastSpace = 0;

/** The command palette: the main window's, or the floating editor's command line. */
function openCommands() {
  // The floating editor opens its Commands flyout; the main window its command palette.
  if (document.documentElement.classList.contains("panel-window")) {
    window.dispatchEvent(new CustomEvent("mb:commands"));
    return;
  }
  useApp.getState().setPaletteOpen(true);
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
  // Typing a LaTeX command (\pvec…): Enter, Space or Tab finish it. A kind's macro becomes the
  // kind, with its slots to fill; any other command is left to the editor.
  if ((mf as unknown as { mode?: string }).mode === "latex") {
    if ((e.key === "Enter" || e.key === " " || e.key === "Tab") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const pos = mf.position;
      let name = "";
      let len = 0;
      for (let k = 2; k <= 26 && k <= pos; k++) {
        const v = mf.getValue(pos - k, pos, "latex");
        if (/^\\[A-Za-z]+$/.test(v)) {
          name = v.slice(1);
          len = k;
          break;
        }
      }
      const kind = name ? KIND_BY_MACRO.get(name) : undefined;
      if (!kind) return false;
      e.preventDefault();
      e.stopPropagation();
      // Remove the typed command (with its group) and leave command mode.
      mf.selection = { ranges: [[pos - len, Math.min(mf.lastOffset, pos + 1)]], direction: "forward" };
      mf.executeCommand("deleteBackward");
      const latex = kindSnippets("").find((x) => x.trigger === kind.snippet)?.latex ?? `\\${kind.macro}{#?}`;
      insertIntoVisual(applyTranspose(latex, useApp.getState().transposeForm));
      return true;
    }
    return false;
  }
  // Enter in a display equation: a new line at the cursor (aligned at the relation, gathered…).
  if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
    if (!useApp.getState().display) return false;
    e.preventDefault();
    e.stopPropagation();
    rewriteAtCaret(mf, breakLineAt);
    return true;
  }
  // A notation kind is deleted as a whole: Backspace right after it, Delete right before it.
  if ((e.key === "Backspace" || e.key === "Delete") && !e.ctrlKey && !e.metaKey && !e.altKey && mf.selectionIsCollapsed) {
    const range = kindRangeAt(mf, mf.position, e.key === "Backspace" ? -1 : 1);
    if (range) {
      e.preventDefault();
      e.stopPropagation();
      mf.selection = { ranges: [range], direction: "forward" };
      mf.executeCommand("deleteBackward");
      return true;
    }
  }
  // Space Space (quickly) opens the command palette; a single Space keeps its role (leaving a kind).
  if (e.key === " " && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
    const app = useApp.getState();
    const mode = (mf as unknown as { mode?: string }).mode;
    const now = performance.now();
    if (app.doubleSpace && mode === "math" && now - lastSpace <= app.doubleSpaceMs) {
      lastSpace = 0;
      e.preventDefault();
      e.stopPropagation();
      openCommands();
      return true;
    }
    lastSpace = mode === "math" ? now : 0;
  } else lastSpace = 0;
  // Space inside a notation kind leaves it (caret right after the kind, the kind unchanged).
  if (e.key === " " && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && mf.selectionIsCollapsed && exitKind(mf as unknown as KindField, "Space")) {
    e.preventDefault();
    e.stopPropagation();
    return true;
  }
  // Tab after a snippet trigger ("ddt", "mat3"…) expands it; otherwise Tab moves between slots.
  if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && mf.selectionIsCollapsed) {
    const pos = mf.position;
    const found = findTrigger((k) => (pos >= k ? mf.getValue(pos - k, pos, "latex") : ""));
    if (found) {
      const snippet = found.snippet;
      e.preventDefault();
      e.stopPropagation();
      // The whole trigger, prefix included (";pv" leaves no ";").
      applySnippet(mf as unknown as SnippetField, found.positions, toMathLive(applyTranspose(snippet.latex, useApp.getState().transposeForm)));
      return true;
    }
    // Tab at the end of a kind (no empty slot left in it) leaves the kind.
    if (exitKind(mf as unknown as KindField, "Tab")) {
      e.preventDefault();
      e.stopPropagation();
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
