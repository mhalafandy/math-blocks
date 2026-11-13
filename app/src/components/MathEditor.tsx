import { isAllBold, KIND_BY_ID, KINDS, setBold, type BoldScope } from "@mathblocks/math-core";
import { editorForm, stripSlotWrappers, type Block } from "../lib/blocks/model";
import { blockByName, markBlockUsed } from "../lib/blocks/useBlocks";
import { useBlockSession } from "../lib/blocks/sessionStore";
import { currentSlot, enterFirstSlot, syncRepeats, type SessionField } from "../lib/blocks/session";
import { CLASS_PREFIX, fromEditorLatex, kindMacroRe, toEditorLatex } from "../lib/kinds";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { useEffect, useRef } from "react";
import { MathfieldElement } from "mathlive";
import { setLastEditor } from "../lib/focus";
import { registerEditor, saveEditorCaret } from "../lib/editorFocus";
import { kindAt, type KindField } from "../lib/kindExit";
import { makeKindLatex, plainLatex } from "../lib/kindStyles";
export { restoreEditorFocus } from "../lib/editorFocus";
import { multlineFromEditor, multlineToEditor } from "../lib/multiline";
import { useApp } from "../lib/store";
import { activeNotation, useActiveNotation } from "../lib/docStyle";

// Fonts are served locally (copied by scripts/copy-mathlive-assets.mjs): no internet needed.
MathfieldElement.fontsDirectory = "/mathlive/fonts";
MathfieldElement.soundsDirectory = null;

let activeField: MathfieldElement | null = null;
registerEditor(() => activeField);

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
export const toMathLive = (latex: string) => multlineToEditor(toEditorKinds(latex).replace(/\\mathrm\{d\}/g, "\\differentialD "));
export const fromMathLive = (latex: string) => fromEditorKinds(multlineFromEditor(stripSlotWrappers(latex)).replace(/\\differentialD\b ?/g, "\\mathrm{d}"));

/** Template slots survive the kind conversion as marker letters. */
const SLOT_MARK = { "#?": "\u24C5", "#0": "\u24EA" } as const;

/** Notation kinds are held expanded and wrapped in the editor (\class{nk-pvec}{…}). */
function toEditorKinds(latex: string): string {
  if (!kindMacroRe().test(latex)) return latex;
  const marked = latex.replace(/#\?/g, SLOT_MARK["#?"]).replace(/#0/g, SLOT_MARK["#0"]);
  // Adjacent slots inside a kind get a thin space (MathLive empties both when the first is typed into).
  return toEditorLatex(marked, activeNotation()).replaceAll(`${SLOT_MARK["#?"]}${SLOT_MARK["#?"]}`, `${SLOT_MARK["#?"]}\\,${SLOT_MARK["#?"]}`).replaceAll(SLOT_MARK["#?"], "#?").replaceAll(SLOT_MARK["#0"], "#0");
}

function fromEditorKinds(latex: string): string {
  if (!latex.includes(`\\class{${CLASS_PREFIX}`)) return latex;
  const r = fromEditorLatex(latex, activeNotation());
  if (r.handStyled.length) noteHandStyled(r.handStyled.map((h) => h.kind));
  return r.latex;
}

let lastHandStyledNote = "";
/** Tells (once per change) that an edit took an object out of its kind. */
function noteHandStyled(kinds: string[]) {
  const key = kinds.join(",");
  if (key === lastHandStyledNote) return;
  lastHandStyledNote = key;
  const names = [...new Set(kinds.map((k) => KIND_BY_ID.get(k)?.name ?? k))].join(", ");
  useApp.getState().notify(`Edited out of its kind (${names}): kept as typed. Undo (Ctrl+Z) to keep the kind.`);
}

/** Hover hint inside the editor: a kind shows a dashed outline and its name. */
function kindHintCss(): string {
  return [
    `[class^="${CLASS_PREFIX}"]{border-radius:2px;position:relative}`,
    `[class^="${CLASS_PREFIX}"]:hover{outline:1px dashed rgba(90,110,200,.55);outline-offset:1px}`,
    // The name is shown by kindTooltip() outside the field (a label inside it would be clipped).
  ].join("\n");
}

/** The kind under the mouse: its name in a small label above it (outside the field's clipping). */
function kindTooltip(mf: MathfieldElement) {
  let tip: HTMLDivElement | null = null;
  const hide = () => tip && (tip.style.display = "none");
  mf.addEventListener("mousemove", (e) => {
    const el = (e.composedPath() as Element[]).find((n) => n instanceof Element && [...n.classList].some((c) => c.startsWith(CLASS_PREFIX)));
    const id = el && [...el.classList].find((c) => c.startsWith(CLASS_PREFIX))!.slice(CLASS_PREFIX.length);
    const kind = id ? KIND_BY_ID.get(id) : undefined;
    if (!el || !kind) return hide();
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "kind-tooltip";
      tip.setAttribute("role", "tooltip");
      document.body.appendChild(tip);
    }
    const r = el.getBoundingClientRect();
    tip.textContent = kind.name;
    tip.style.display = "block";
    tip.style.left = `${Math.round(r.left)}px`;
    tip.style.top = `${Math.round(r.top - 6)}px`;
  });
  mf.addEventListener("mouseleave", hide);
  mf.addEventListener("keydown", hide);
}

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

/** Where the caret is on screen (for small popups next to it). */
function caretRect(mf: MathfieldElement): { left: number; top: number; bottom: number } {
  const c = mf.shadowRoot?.querySelector(".ML__caret, .ML__text-caret, .ML__selection") as HTMLElement | null;
  const r = (c ?? mf).getBoundingClientRect();
  return { left: r.left, top: r.top, bottom: r.bottom };
}

/** The kind object at the caret, replaced by its drawing in the current style (no longer follows the kind). */
export function convertKindToPlain(): boolean {
  const mf = activeField;
  if (!mf) return false;
  const k = kindAt(mf as unknown as KindField);
  if (!k) return false;
  const source = fromMathLive(mf.getValue(k.a, k.b, "latex"));
  mf.selection = { ranges: [[k.a, k.b]], direction: "forward" };
  mf.executeCommand(["insert", `{${plainLatex(source)}}`, { insertionMode: "replaceSelection", selectionMode: "after" }]);
  mf.focus();
  return true;
}

/**
 * Make → kind: the selection (or the symbol before the cursor) becomes that kind; its letters stay,
 * styles and accents come from the kind, a subscript becomes the frame label.
 */
export function makeKindFromSelection(kindId: string): boolean {
  const mf = activeField;
  if (!mf) return false;
  mf.focus();
  if (mf.selectionIsCollapsed) {
    if (mf.position === 0) {
      insertIntoVisual(makeKindLatex("", kindId) ?? "");
      return true;
    }
    mf.executeCommand("extendSelectionBackward");
  }
  const src = fromMathLive(mf.getValue(mf.selection, "latex"));
  const out = makeKindLatex(src, kindId);
  if (!out) return false;
  mf.executeCommand(["insert", toMathLive(out.replace(/\{\}$/, "{#?}")), { insertionMode: "replaceSelection", selectionMode: "placeholder" }]);
  return true;
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
  // A kind's look comes from its kind: the quick-style bar offers Convert to plain and Edit kind style.
  const k = kindAt(mf as unknown as KindField);
  if (k) {
    showQuickStyle(mf, true);
    useApp.getState().notify(`${KIND_BY_ID.get(k.id)?.name ?? "This kind"}: its look comes from its kind — Convert to plain, or edit the kind's style (on the bar above).`);
    return;
  }
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

/** Applies a LaTeX transformation to the selection, or to the symbol before the cursor (the quick-style bar). */
export function applyToSelection(f: (src: string) => string) {
  const mf = activeField;
  if (!mf) return;
  mf.focus();
  const collapsed = mf.selectionIsCollapsed;
  if (collapsed) {
    if (mf.position === 0) return;
    mf.executeCommand("extendSelectionBackward");
  }
  const src = fromMathLive(mf.getValue(mf.selection, "latex")).trim();
  if (!src) return;
  mf.insert(toMathLive(f(src)), { insertionMode: "replaceSelection", selectionMode: collapsed ? "after" : "item", format: "latex" });
}

let quickTimer: ReturnType<typeof setTimeout> | undefined;
/** Shows (or hides) the quick-style bar for the editor's selection or the symbol before the caret. */
function showQuickStyle(mf: MathfieldElement, now = false) {
  clearTimeout(quickTimer);
  const update = () => {
    void import("./QuickStyleBar").then(({ useQuickStyle }) => {
      const focused = mf.matches(":focus-within") || document.activeElement === mf;
      if (!focused || (mf.selectionIsCollapsed && mf.position === 0)) return useQuickStyle.getState().set({ at: null, kind: null });
      const k = kindAt(mf as unknown as KindField);
      useQuickStyle.getState().set({ at: caretRect(mf), kind: k?.id ?? null });
    });
  };
  if (now) update();
  else quickTimer = setTimeout(update, mf.selectionIsCollapsed ? 700 : 150);
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
/** The letter just typed, when it starts a token (w, not the n of "sin"): the document's forms of it are offered. */
function suggestAtCaret(mf: MathfieldElement) {
  void import("./SuggestBar").then(({ updateSuggestions }) => {
    const pos = mf.position;
    const mode = (mf as unknown as { mode?: string }).mode;
    if (!mf.selectionIsCollapsed || pos < 1 || mode !== "math" || document.activeElement !== mf) return updateSuggestions(null, null);
    const v = mf.getValue(pos - 1, pos, "latex");
    const prev = pos >= 2 ? mf.getValue(pos - 2, pos - 1, "latex") : "";
    const letter = /^[A-Za-z]$/.test(v) && !/^[A-Za-z]$/.test(prev) ? v : null;
    updateSuggestions(letter, letter ? caretRect(mf) : null);
  });
}

/**
 * Inserts a block at the caret (or over the selection; a one-slot block takes the selection as its
 * slot's contents): its first slot selected, Space through the others (blocks/session.ts).
 * `replace`: offsets of typed text the block replaces (its trigger).
 */
export function insertBlock(b: Block, o: { replace?: [number, number] } = {}): boolean {
  const mf = activeField;
  if (!mf) return false;
  mf.focus();
  const id = Math.random().toString(36).slice(2, 7);
  let form;
  try {
    form = editorForm(b, toMathLive, blockByName, id);
  } catch (e) {
    useApp.getState().notify(e instanceof Error ? e.message : String(e), "error");
    return false;
  }
  let latex = form.latex;
  if (o.replace) mf.selection = { ranges: [o.replace], direction: "forward" };
  else if (!mf.selectionIsCollapsed && form.order.length === 1) {
    // Wrap the selection: it becomes the one slot's contents (every occurrence).
    const sel = mf.getValue(mf.selection, "latex");
    latex = latex.replace(/(\\class\{mbs-[^}]+\})\{\\placeholder\{\}\}/g, (_, c: string) => `${c}{${sel}}`);
  }
  mf.insert(latex, { insertionMode: "replaceSelection", selectionMode: "after", format: "latex" });
  const order = form.order;
  useBlockSession.getState().set(order.length ? { id, name: b.name, order, labels: form.labels, current: null } : null);
  if (order.length) enterFirstSlot(mf as unknown as SessionField, id, order[0]!);
  updateBlockSession(mf);
  void markBlockUsed(b);
  return true;
}

/** The editor's selection as saved LaTeX (null when nothing is selected or there is no editor). */
export function editorSelectionLatex(): string | null {
  const mf = activeField;
  if (!mf || mf.selectionIsCollapsed) return null;
  const sel = mf.getValue(mf.selection, "latex");
  return sel.trim() ? fromMathLive(sel) : null;
}

/** After an input or a caret move: repeats follow, the status line and hints follow the caret. */
function updateBlockSession(mf: MathfieldElement, input = false) {
  const st = useBlockSession.getState();
  const s = st.session;
  if (!s) return;
  if (!mf.value.includes(`mbb-${s.id}`)) return st.set(null);
  if (input) syncRepeats(mf as unknown as SessionField, s.id);
  const c = currentSlot(mf as unknown as SessionField, s.id, s.order);
  const current = c ? { index: c.index, total: c.total, label: s.labels[c.name] ?? c.name } : null;
  if (JSON.stringify(current) !== JSON.stringify(s.current)) st.set({ ...s, current });
}

/** Takes a suggested form: the typed letter is replaced by it. */
export function acceptSuggestion(latex: string) {
  const mf = activeField;
  if (!mf) return;
  mf.focus();
  mf.executeCommand("deleteBackward");
  insertIntoVisual(latex);
  void import("./SuggestBar").then((m) => m.hideSuggestions());
}

export function insertIntoVisual(template: string) {
  const mf = activeField;
  if (!mf) return false;
  mf.focus();
  // Text (\text{…} from the palette or the commands sheet): a text zone at the caret, ready to type in.
  const text = /^\\(?:text|mbox|textrm)\{(#\?|#0)?\}$/.exec(template.trim());
  if (text) {
    if (!mf.selectionIsCollapsed) {
      // Selected letters become the text.
      const sel = mf.getValue(mf.selection, "latex").replace(/\\[A-Za-z]+\s?/g, "").replace(/[{}^_]/g, "");
      mf.executeCommand(["insert", `\\text{${sel}}`, { insertionMode: "replaceSelection", selectionMode: "after" }]);
      return true;
    }
    mf.executeCommand(["switchMode", "text"] as never);
    return true;
  }
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
    // Shown while the equation is empty, so it is clear where to type.
    mf.placeholder = "\\text{Type here · Space: next slot · Ctrl+K: commands}";
    mf.className = "mathfield";
    mf.setAttribute("aria-label", "Equation editor");
    mf.value = toMathLive(useApp.getState().latex);
    // The quick-style bar follows the selection; typing hides it until a pause.
    mf.addEventListener("selection-change", () => {
      showQuickStyle(mf);
      suggestAtCaret(mf);
      updateBlockSession(mf);
    });
    mf.addEventListener("focusout", () => {
      clearTimeout(quickTimer);
      quickTimer = setTimeout(() => {
        if (!document.querySelector(".quick-style:hover, .quick-style:focus-within")) void import("./QuickStyleBar").then(({ useQuickStyle }) => useQuickStyle.getState().set({ at: null }));
      }, 200);
    });
    mf.addEventListener("input", () => {
      updateBlockSession(mf, true);
      void import("./QuickStyleBar").then(({ useQuickStyle }) => useQuickStyle.getState().set({ at: null }));
      onInputDone(mf);
      // A kind macro that arrived raw (pasted, dropped, inserted as LaTeX: \pvec{r}_2, {\pvec{r}_2})
      // is shown as its kind at once, never as an unknown red command.
      if (kindMacroRe().test(mf.value)) {
        const pos = mf.position;
        const back = mf.lastOffset - pos;
        mf.setValue(toMathLive(fromMathLive(mf.value)), { silenceNotifications: true });
        try {
          mf.position = Math.max(0, mf.lastOffset - back);
        } catch {
          // Caret placement is cosmetic.
        }
      }
      setLatex(fromMathLive(mf.value), "visual");
    });
    mf.addEventListener("pointerdown", () => setLastEditor("visual"));
    mf.addEventListener("focusout", () => saveEditorCaret(mf));
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
    // Right-click: the app's menu (kinds: Make → kind, Convert to plain, Edit kind style), not MathLive's.
    const onMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      void import("./EditorMenu").then((m) => m.openEditorMenu(mf, e));
    };
    host.current?.addEventListener("contextmenu", onMenu, true);
    try {
      const style = document.createElement("style");
      style.textContent = kindHintCss();
      kindTooltip(mf);
      mf.shadowRoot?.appendChild(style);
    } catch {
      // The hint is cosmetic.
    }
    // Autocorrect while typing (in addition to MathLive's: alpha → α, sqrt, sum, int…).
    // MathLive only exposes its shortcut list once the field is in the page.
    try {
      mf.inlineShortcuts = { ...mf.inlineShortcuts, ...AUTOCORRECT };
    } catch {
      // Older MathLive: its own shortcuts only.
    }
    field.current = mf;
    activeField = mf;
    // Ready to type on launch (and in the floating editor when it opens).
    requestAnimationFrame(() => {
      if (!document.querySelector(".modal-backdrop") && (document.activeElement === document.body || !document.activeElement)) mf.focus();
    });
    return () => {
      mf.remove();
      if (activeField === mf) activeField = null;
    };
  }, [setLatex]);

  // A different notation (preset, vector style, a kind's style) restyles the open equation at
  // once: its kinds are expanded again in the new style, the caret kept where possible.
  const profile = useActiveNotation();
  const firstProfile = useRef(true);
  useEffect(() => {
    if (firstProfile.current) {
      firstProfile.current = false;
      return;
    }
    const mf = field.current;
    if (!mf) return;
    const pos = mf.position;
    const next = toMathLive(useApp.getState().latex);
    if (next === mf.value) return;
    mf.setValue(next, { silenceNotifications: true });
    try {
      mf.position = Math.min(pos, mf.lastOffset);
    } catch {
      // Caret placement is cosmetic.
    }
  }, [profile]);

  // Changes made elsewhere (LaTeX editor, library, palette) flow into the visual editor.
  useEffect(() => {
    const mf = field.current;
    if (mf && source !== "visual" && fromMathLive(mf.value) !== latex) mf.setValue(toMathLive(latex), { silenceNotifications: true });
  }, [latex, source]);

  return <div className="math-editor" ref={host} />;
}
