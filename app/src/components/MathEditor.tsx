import { isAllBold, setBold, type BoldScope } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { useEffect, useRef } from "react";
import { MathfieldElement } from "mathlive";
import { setLastEditor } from "../lib/focus";
import { useApp } from "../lib/store";

// Fonts are served locally (copied by scripts/copy-mathlive-assets.mjs): no internet needed.
MathfieldElement.fontsDirectory = "/mathlive/fonts";
MathfieldElement.soundsDirectory = null;

let activeField: MathfieldElement | null = null;

/** The equation editor, when it has the keyboard focus. */
export function focusedMathField(): MathfieldElement | null {
  const el = document.activeElement;
  return activeField && (el === activeField || activeField.contains(el)) ? activeField : null;
}

/*
 * LaTeX ⇄ MathLive dialect. In MathLive, letters typed after \mathrm{d} inherit its upright style
 * ("dx" becomes \mathrm{dx}). Its \differentialD atom is a proper upright differential d, so the
 * editor uses that internally while the rest of the app (and Word) sees standard \mathrm{d}.
 */
export const toMathLive = (latex: string) => latex.replace(/\\mathrm\{d\}/g, "\\differentialD ");
const fromMathLive = (latex: string) => latex.replace(/\\differentialD\b ?/g, "\\mathrm{d}");

/** Empty slot, possibly wrapped in a style command (\bm{\placeholder{}}). */
const PLACEHOLDER = /^(?:\\[A-Za-z]+\{)?\\placeholder\{\}\}?$/;

/**
 * MathLive cannot hit-test a placeholder wrapped in a style (e.g. inside \mathbf under an accent):
 * a click lands next to it, so typing never fills the box. After each click, find the placeholder
 * under the pointer (its own bounds, or those of the atom that contains it) and select it.
 */
function selectPlaceholderAt(mf: MathfieldElement, x: number, y: number) {
  const last = mf.lastOffset;
  const infos = Array.from({ length: last + 1 }, (_, i) => mf.getElementInfo(i));
  let best: { offset: number; area: number } | null = null;
  for (let i = 1; i <= last; i++) {
    const info = infos[i];
    if (!info?.latex || !PLACEHOLDER.test(info.latex)) continue;
    let rect = info.bounds && info.bounds.width > 0 ? info.bounds : undefined;
    for (let j = i + 1; !rect && j <= last; j++) {
      const outer = infos[j];
      if (outer?.latex?.includes(info.latex) && outer.bounds && outer.bounds.width > 0) rect = outer.bounds;
    }
    if (!rect) continue;
    const pad = 3;
    if (x < rect.left - pad || x > rect.right + pad || y < rect.top - pad || y > rect.bottom + pad) continue;
    const area = rect.width * rect.height;
    if (!best || area < best.area) best = { offset: i, area };
  }
  if (best && mf.getValue(mf.selection) !== mf.getValue(best.offset - 1, best.offset)) {
    mf.selection = { ranges: [[best.offset - 1, best.offset]], direction: "forward" };
  }
}

/** Focuses the visual editor, caret at the end (used when clicking empty canvas space). */
export function focusVisualEditor() {
  const mf = activeField;
  if (!mf) return;
  mf.focus();
  mf.position = mf.lastOffset;
  setLastEditor("visual");
}

/**
 * Ctrl+Shift+B (as in MathType): toggles bold upright on the selection, or on the symbol just
 * before the cursor when nothing is selected.
 */
/**
 * Ctrl+Shift+B: makes the selection (or the symbol before the cursor) bold, or plain again.
 * Bold is upright \mathbf (MathType's vector style); Greek letters use bold italic \boldsymbol.
 * Done on the LaTeX rather than with MathLive's styling, which writes \bm (bold italic) and
 * leaves accented vectors (\vec{r}) unchanged.
 */
export function toggleBold() {
  const mf = activeField;
  if (!mf) return;
  mf.focus();
  const collapsed = mf.selectionIsCollapsed;
  if (collapsed) {
    if (mf.position === 0) return;
    // Select the whole symbol before the cursor (an accented vector counts as one).
    mf.executeCommand("extendSelectionBackward");
  }
  const src = mf.getValue(mf.selection, "latex").trim();
  if (!src) return;
  mf.insert(toggledBold(src), { insertionMode: "replaceSelection", selectionMode: collapsed ? "after" : "item", format: "latex" });
}

const BOLD_CMD = /\\(mathbf|boldsymbol|bm|pmb)\{/g;
const ACCENT_CMD = /^\\(vec|hat|widehat|bar|overline|dot|ddot|dddot|ddddot|acute|grave|mathring|tilde|widetilde|check|breve|overrightarrow|overleftarrow|overrightharpoon|overleftharpoon)\{([\s\S]*)\}$/;
const GREEK_ONLY = /^(\\(alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega)\s*)+$/;

/** Removes every bold command, keeping its contents (braces matched). */
function stripBold(src: string): string {
  let out = "";
  let i = 0;
  BOLD_CMD.lastIndex = 0;
  for (let m = BOLD_CMD.exec(src); m; m = BOLD_CMD.exec(src)) {
    out += src.slice(i, m.index);
    let depth = 1;
    let j = m.index + m[0].length;
    const bodyStart = j;
    while (j < src.length && depth > 0) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") depth--;
      j++;
    }
    out += stripBold(src.slice(bodyStart, j - 1));
    i = j;
    BOLD_CMD.lastIndex = j;
  }
  return out + src.slice(i);
}

/** True when every letter and digit of the LaTeX is bold. */
function allBold(src: string): boolean {
  let letters = 0;
  let bold = 0;
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(visit);
    const n = v as { kind?: string; variant?: string };
    if (n.kind === "ident" || n.kind === "number") {
      letters++;
      if (n.variant === "bold" || n.variant === "bold-italic") bold++;
    }
    for (const x of Object.values(n)) visit(x);
  };
  visit(parseLatex(src).root);
  return letters > 0 && bold === letters;
}

/** Bold ↔ plain for a piece of LaTeX: all bold → plain; otherwise all becomes bold. */
/** The last toggle, so toggling the result again restores exactly what was there. */
let lastToggle: { original: string; result: string } | null = null;

/**
 * Bold on/off (Ctrl+Shift+B), as MathType does it: only the base letters become bold (𝐱₁, not
 * 𝐱₁ with a bold 1; harpoon and other accents keep their weight); Greek letters use \boldsymbol.
 * The scope comes from Word style → Style rules. Works on the parsed equation, not on text.
 */
export function toggledBold(src: string, scope: BoldScope = useApp.getState().boldScope): string {
  if (lastToggle && lastToggle.result === src) {
    const original = lastToggle.original;
    lastToggle = null;
    return original;
  }
  const root = parseLatex(src).root;
  setBold(root, !isAllBold(root, scope), scope);
  const result = serializeLatex(root);
  lastToggle = { original: src, result };
  return result;
}

function balanced(s: string) {
  let d = 0;
  for (const c of s) {
    if (c === "{") d++;
    else if (c === "}" && --d < 0) return false;
  }
  return d === 0;
}

/** Typed sequences replaced while typing (shown in the keyboard shortcuts sheet). */
export const AUTOCORRECT: Record<string, string> = {
  "->": "\\to",
  "<-": "\\leftarrow",
  "=>": "\\Rightarrow",
  "<=>": "\\Leftrightarrow",
  "<=": "\\le",
  ">=": "\\ge",
  "!=": "\\ne",
  "~=": "\\approx",
  "+-": "\\pm",
  "-+": "\\mp",
  xx: "\\times",
  "**": "\\cdot",
  oo: "\\infty",
  grad: "\\nabla",
  "...": "\\ldots",
  "||": "\\parallel",
};

/** Style commands whose empty slot MathLive cannot fill without losing the style. */
const STYLED_SLOT = /\\(mathbf|boldsymbol|bm|mathrm|mathsf|mathtt|mathcal|mathbb|mathfrak|mathit)\{#0\}/;
const SAMPLE = "x";

/** The styled sample letter just inserted and selected; its first keystroke is handled by us. */
let pendingSample: { cmd: string; start: number; end: number } | null = null;

/** Set when the user types over the styled sample; the typed letter is restyled once inserted. */
let restyle: { cmd: string; at: number; data: string } | null = null;

function onBeforeInput(mf: MathfieldElement, e: InputEvent) {
  const ps = pendingSample;
  pendingSample = null;
  if (!ps || e.inputType !== "insertText" || !e.data || !/^[A-Za-z0-9]$/.test(e.data)) return;
  const [a, b] = mf.selection.ranges[0] ?? [0, 0];
  if (Math.min(a, b) === ps.start && Math.max(a, b) === ps.end) restyle = { cmd: ps.cmd, at: ps.start, data: e.data };
}

/**
 * MathLive replaces the selected sample with a plain letter. Once that edit is done ("input"),
 * swap that letter for the styled one; letters typed afterwards inherit the style from it.
 */
function onInputDone(mf: MathfieldElement) {
  const r = restyle;
  restyle = null;
  if (!r || mf.getValue(r.at, r.at + 1) !== r.data) return;
  mf.selection = { ranges: [[r.at, r.at + 1]], direction: "forward" };
  mf.insert(`\\${r.cmd}{${r.data}}`, { selectionMode: "after" });
}

/**
 * Inserts a LaTeX template at the cursor of the visual editor.
 * "#0" = the current selection, "#?" = an empty slot.
 *
 * MathLive drops the style of an empty slot as soon as the cursor enters it, so a bold slot
 * (\mathbf{#0}) would turn into a plain one. With nothing selected, such a slot therefore gets a
 * sample letter in that style, selected: the first keystroke replaces it and keeps the style.
 */
export function insertIntoVisual(template: string) {
  const mf = activeField;
  if (!mf) return false;
  mf.focus();
  if (!mf.selectionIsCollapsed) {
    mf.executeCommand(["insert", toMathLive(template), { selectionMode: "placeholder" }]);
    return true;
  }
  const styled = STYLED_SLOT.exec(template);
  if (!styled) {
    mf.executeCommand(["insert", toMathLive(template.replace(/#0/g, "#?")), { selectionMode: "placeholder" }]);
    return true;
  }
  const sample = `\\${styled[1]}{${SAMPLE}}`;
  const t = toMathLive(template.replace(STYLED_SLOT, sample).replace(/#0/g, "#?"));
  const start = mf.position;
  mf.executeCommand(["insert", t, { selectionMode: "after" }]);
  // Select the sample letter. MathLive may rename the command (\boldsymbol → \bm), so match the letter.
  for (let i = start + 1; i <= mf.lastOffset; i++) {
    const v = mf.getValue(i - 1, i);
    const m = new RegExp(`^\\\\([A-Za-z]+)\\{${SAMPLE}\\}$`).exec(v);
    if (m) {
      mf.selection = { ranges: [[i - 1, i]], direction: "forward" };
      pendingSample = { cmd: m[1]!, start: i - 1, end: i };
      break;
    }
  }
  return true;
}

/**
 * Visual editor (MathLive). M1 keeps it deliberately simple: MathLive's LaTeX is the
 * exchange format with the LaTeX editor. M2 wraps it in the EditorAdapter interface.
 */
export function MathEditor() {
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<MathfieldElement | null>(null);
  const latex = useApp((s) => s.latex);
  const source = useApp((s) => s.source);
  const setLatex = useApp((s) => s.setLatex);

  useEffect(() => {
    const mf = new MathfieldElement();
    mf.smartFence = true;
    mf.smartSuperscript = true;
    mf.mathVirtualKeyboardPolicy = "manual";
    mf.placeholderSymbol = "□"; // lighter than the default ▢ (styled further in app.css)
    mf.className = "mathfield";
    mf.setAttribute("aria-label", "Equation editor");
    mf.value = toMathLive(useApp.getState().latex);
    mf.addEventListener("input", () => {
      onInputDone(mf);
      setLatex(fromMathLive(mf.value), "visual");
    });
    mf.addEventListener("pointerdown", () => setLastEditor("visual"));
    mf.addEventListener("beforeinput", (e) => onBeforeInput(mf, e as InputEvent));
    mf.addEventListener("pointerup", (e) => {
      const { clientX, clientY } = e;
      requestAnimationFrame(() => selectPlaceholderAt(mf, clientX, clientY));
    });
    mf.addEventListener("focusin", () => {
      activeField = mf;
      setLastEditor("visual");
    });
    host.current?.appendChild(mf);
    // Autocorrect while typing (in addition to MathLive's: alpha → α, sqrt, sum, int…).
    // MathLive only exposes its shortcut list once the field is in the page.
    try {
      mf.inlineShortcuts = { ...mf.inlineShortcuts, ...AUTOCORRECT };
    } catch {
      // Older MathLive: its own shortcuts only.
    }
    field.current = mf;
    activeField = mf;
    return () => {
      mf.remove();
      if (activeField === mf) activeField = null;
    };
  }, [setLatex]);

  // Changes made elsewhere (LaTeX editor, library, palette) flow into the visual editor.
  useEffect(() => {
    const mf = field.current;
    if (mf && source !== "visual" && fromMathLive(mf.value) !== latex) mf.setValue(toMathLive(latex), { silenceNotifications: true });
  }, [latex, source]);

  return <div className="math-editor" ref={host} />;
}
