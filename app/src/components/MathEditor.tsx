import { useEffect, useRef } from "react";
import { MathfieldElement } from "mathlive";
import { useApp } from "../lib/store";

// Fonts are served locally (copied by scripts/copy-mathlive-assets.mjs): no internet needed.
MathfieldElement.fontsDirectory = "/mathlive/fonts";
MathfieldElement.soundsDirectory = null;

let activeField: MathfieldElement | null = null;

/** Inserts a LaTeX template at the cursor of the visual editor (#? = placeholder). */
export function insertIntoVisual(template: string) {
  if (!activeField) return false;
  activeField.focus();
  activeField.executeCommand(["insert", template, { selectionMode: "placeholder" }]);
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
    mf.className = "mathfield";
    mf.setAttribute("aria-label", "Equation editor");
    mf.value = useApp.getState().latex;
    mf.addEventListener("input", () => setLatex(mf.value, "visual"));
    mf.addEventListener("focus", () => (activeField = mf));
    host.current?.appendChild(mf);
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
    if (mf && source !== "visual" && mf.value !== latex) mf.setValue(latex, { silenceNotifications: true });
  }, [latex, source]);

  return <div className="math-editor" ref={host} />;
}
