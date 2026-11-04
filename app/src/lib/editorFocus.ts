import { lastEditor, setLastEditor } from "./focus";

/**
 * Back to the equation editor after a command, palette, snippet or dialog, caret where it was.
 * Kept apart from the editor component (no MathLive import) so dialogs can use it anywhere.
 */
interface Field {
  value: string;
  selection: unknown;
  isConnected: boolean;
  focus: () => void;
}

let getField: () => Field | null = () => null;
let saved: { value: string; selection: unknown } | null = null;

export const registerEditor = (f: () => Field | null) => (getField = f);

/** Called when the editor loses the focus (to a palette, dialog or menu). */
export const saveEditorCaret = (mf: Field) => (saved = { value: mf.value, selection: mf.selection });

/**
 * The caret where it was — or, when something was inserted meanwhile, where the insertion left
 * it (its first slot). Leaves the focus alone when another dialog or text field has it, or when
 * the LaTeX editor was the last one used (unless `force`).
 */
export function restoreEditorFocus(force = false) {
  requestAnimationFrame(() => {
    const mf = getField();
    if (!mf || !mf.isConnected) return;
    // Another dialog or the command palette took over (a command that opens a dialog).
    if (document.querySelector(".modal-backdrop, .palette-backdrop")) return;
    const el = document.activeElement as HTMLElement | null;
    if (!force && el && el !== document.body && el !== (mf as unknown) && (el.matches("input, textarea, select, [contenteditable]") || el.closest(".modal, .cm-editor"))) return;
    if (!force && lastEditor() === "latex") return;
    mf.focus();
    if (saved && saved.value === mf.value) mf.selection = saved.selection;
    setLastEditor("visual");
  });
}
