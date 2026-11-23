import { useApp } from "./store";

/**
 * The editor's LaTeX reaches the store just after the key is painted (one frame), not before: the app's
 * update (re-render, preview, width) used to run between the key and the frame, so the key showed late.
 * Anything that acts on the equation flushes it first: a click, a key with Ctrl/Alt/Meta, Enter, Tab, Esc,
 * and leaving the field.
 */
let pendingLatex: string | null = null;
let flushQueued = false;
export function flushVisualLatex() {
  if (pendingLatex === null) return;
  const latex = pendingLatex;
  pendingLatex = null;
  useApp.getState().setLatex(latex, "visual");
}
/** After the next paint (a frame, then a task). */
export function afterPaint(fn: () => void) {
  requestAnimationFrame(() => setTimeout(fn, 0));
}
export function queueVisualLatex(latex: string) {
  pendingLatex = latex;
  if (flushQueued) return;
  flushQueued = true;
  afterPaint(() => {
    flushQueued = false;
    flushVisualLatex();
  });
}
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", flushVisualLatex, true);
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.key === "Enter" || e.key === "Tab" || e.key === "Escape") flushVisualLatex();
    },
    true,
  );
}
