import { focusedMathField, fromMathLive, insertIntoVisual, toggleBold, toMathLive } from "../components/MathEditor";
import { breakLineAt, CARET, setAlignmentAt, type LineResult } from "./multiline";
import { findTrigger, kindSnippets } from "./snippets";
import { KIND_BY_MACRO } from "@mathblocks/math-core";
import { applySnippet, type SnippetField } from "./snippetApply";
import { exitKind, kindAt, type KindField } from "./kindExit";
import { deleteStep, moveSlot, type SlotField } from "./editorSlots";
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

let lastSpace = 0;
/** \text{ was just typed: a } right after it keeps the caret inside the (empty) text. */
let textJustOpened = false;

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
  const mode = (mf as unknown as { mode?: string }).mode;
  // Inside text (\text{…}): Space types spaces; Enter, Tab or Esc go back to maths.
  if (mode === "text") {
    if (e.key === "}" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      // "\text{}" typed in full: the caret stays inside, ready to type; a later } closes the text.
      if (textJustOpened) textJustOpened = false;
      else mf.executeCommand(["switchMode", "math"] as never);
      return true;
    }
    textJustOpened = false;
    if ((e.key === "Enter" || e.key === "Tab" || e.key === "Escape") && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      mf.executeCommand(["switchMode", "math"] as never);
      return true;
    }
    if (e.key === " ") return false;
  }
  if (mode === "latex") {
    // \text (\mbox, \textrm…) then {, Space, Enter or Tab: a text zone at the caret, ready to type in.
    if ((e.key === "{" || e.key === "Enter" || e.key === " " || e.key === "Tab") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const pos = mf.position;
      for (let k = 2; k <= 10 && k <= pos; k++) {
        const v = mf.getValue(pos - k, pos, "latex");
        if (!/^\\[A-Za-z]+$/.test(v)) continue;
        if (!/^\\(text|mbox|textrm|textnormal|textit|mathrm)$/.test(v) || v === "\\mathrm") break;
        e.preventDefault();
        e.stopPropagation();
        mf.selection = { ranges: [[pos - k, Math.min(mf.lastOffset, pos + 1)]], direction: "forward" };
        mf.executeCommand("deleteBackward");
        mf.executeCommand(["switchMode", "text"] as never);
        textJustOpened = e.key === "{";
        return true;
      }
    }
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
    if (!useApp.getState().display || mode !== "math") return false;
    e.preventDefault();
    e.stopPropagation();
    rewriteAtCaret(mf, breakLineAt);
    return true;
  }
  // Backspace / Delete: one character; a structure or a kind is selected first, deleted by the second press
  // (editorSlots.deleteStep). An ordinary character is left to the editor (one character).
  if ((e.key === "Backspace" || e.key === "Delete") && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && mode === "math") {
    const done = deleteStep(mf as unknown as SlotField, e.key === "Backspace" ? -1 : 1);
    if (done) {
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
    return false;
  }
  // Space / Shift+Space: the next / previous slot of the structure around the caret (like Tab in MathType);
  // after the last slot the caret leaves the structure. In a kind: its empty slots, then out of the kind.
  if (e.key === " " && mode === "math" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const moved = moveSlot(mf as unknown as SlotField, e.shiftKey ? -1 : 1);
    if (moved) {
      lastSpace = 0;
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
    if (!e.shiftKey && mf.selectionIsCollapsed) {
      const k = kindAt(mf as unknown as KindField);
      const inside = !!k && k.a < mf.position && mf.position < k.b;
      if (exitKind(mf as unknown as KindField, "Tab") || (inside && mf.executeCommand("moveToNextPlaceholder"))) {
        lastSpace = 0;
        e.preventDefault();
        e.stopPropagation();
        return true;
      }
    }
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
  }
  // Space Space (quickly), outside every structure, opens the command palette (Ctrl+K anywhere).
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
