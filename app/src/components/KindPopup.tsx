import { useEffect, useRef } from "react";
import { create } from "zustand";
import { KIND_BY_ID } from "@mathblocks/math-core";
import { restoreEditorFocus } from "../lib/editorFocus";

/**
 * Ctrl+Shift+B on a notation kind: its look comes from the kind, so bold cannot be toggled on it
 * alone. A small popup says so and offers: edit the kind's style, or convert this one to plain.
 */
const useKindPopup = create<{ kind: string | null; at: { left: number; top: number; bottom: number } | null; set: (kind: string | null, at?: { left: number; top: number; bottom: number } | null) => void }>((set) => ({
  kind: null,
  at: null,
  set: (kind, at = null) => set({ kind, at }),
}));

export const showKindPopup = (kind: string, at: { left: number; top: number; bottom: number }) => useKindPopup.getState().set(kind, at);

export function KindPopup() {
  const { kind, at, set } = useKindPopup();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!kind) return;
    ref.current?.querySelector("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    window.addEventListener("keydown", key, true);
    window.addEventListener("mousedown", down);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("mousedown", down);
    };
  }, [kind]);
  if (!kind || !at) return null;
  const def = KIND_BY_ID.get(kind);
  function close() {
    set(null);
    restoreEditorFocus(true);
  }
  const left = Math.max(8, Math.min(at.left - 20, window.innerWidth - 330));
  const top = at.bottom + 8 + 120 < window.innerHeight ? at.bottom + 8 : Math.max(8, at.top - 128);
  return (
    <div ref={ref} className="kind-popup" role="dialog" aria-label="Kind style" style={{ left, top }}>
      <p>
        <strong>{def?.name ?? kind}</strong>: style comes from its kind.
      </p>
      <div className="kind-popup-actions">
        <button
          className="primary"
          onClick={() => {
            set(null);
            void import("./NotationSettings").then((m) => m.openNotationSettings(kind));
          }}
        >
          Edit kind style…
        </button>
        <button
          onClick={() => {
            set(null);
            void import("./MathEditor").then((m) => m.convertKindToPlain());
          }}
        >
          Convert to plain (hand-styled)
        </button>
      </div>
    </div>
  );
}
