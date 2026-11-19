import { useEffect, useRef } from "react";
import { MathfieldElement } from "mathlive";
import { EDITOR_ACCENT_CSS } from "../lib/editorAccents";
import { fromMathLive, toMathLive } from "./MathEditor";

/**
 * A one-line math field for a symbol (Change symbol…): the visual editor's input (kinds shown and kept, harpoons as
 * in the editor), its value as stored LaTeX. Typing LaTeX in it works as in the editor (\pvec, \Omega…).
 */
export function MiniMathField({ value, onChange, label, autoFocus }: { value: string; onChange: (latex: string) => void; label: string; autoFocus?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<MathfieldElement | null>(null);
  const changing = useRef(false);
  useEffect(() => {
    const mf = new MathfieldElement();
    mf.smartFence = true;
    mf.mathVirtualKeyboardPolicy = "manual";
    mf.className = "mathfield mini-mathfield";
    mf.setAttribute("aria-label", label);
    mf.value = toMathLive(value);
    mf.addEventListener("input", () => {
      changing.current = true;
      onChange(fromMathLive(mf.value));
      changing.current = false;
    });
    host.current?.appendChild(mf);
    try {
      const style = document.createElement("style");
      style.textContent = EDITOR_ACCENT_CSS;
      mf.shadowRoot?.appendChild(style);
    } catch {
      // Cosmetic.
    }
    field.current = mf;
    if (autoFocus) setTimeout(() => mf.focus(), 50);
    return () => mf.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const mf = field.current;
    if (mf && !changing.current && fromMathLive(mf.value) !== value) mf.setValue(toMathLive(value), { silenceNotifications: true });
  }, [value]);
  return <div className="mini-mathfield-host" ref={host} />;
}
