import { create } from "zustand";
import { KIND_BY_ID, KINDS } from "@mathblocks/math-core";
import { QUICK_ACCENTS, toggledAccent, toggledUpright } from "../lib/quickStyle";
import { MathTile } from "./MathTile";
import { ICON_CELL } from "../lib/tiles";

/**
 * The quick-style bar: whenever there is a selection in the editor, or the caret sits after a symbol
 * (once typing pauses), a small bar near it — bold, italic/upright, accents, Make → kind and, on a
 * kind, Convert to plain and Edit kind style. One click each; the editor keeps the focus.
 */
interface State {
  at: { left: number; top: number; bottom: number } | null;
  /** The kind at the caret, if any (its look comes from the kind). */
  kind: string | null;
  set: (s: Partial<Omit<State, "set">>) => void;
}

export const useQuickStyle = create<State>((set) => ({ at: null, kind: null, set: (s) => set(s) }));

/** Buttons act without taking the focus from the editor. */
const keep = (e: React.MouseEvent) => e.preventDefault();

export function QuickStyleBar() {
  const { at, kind, set } = useQuickStyle();
  if (!at) return null;
  const run = (f: (m: typeof import("./MathEditor")) => void) => void import("./MathEditor").then((m) => f(m));
  const left = Math.max(8, Math.min(at.left - 40, window.innerWidth - 420));
  const top = at.top - 40 > 8 ? at.top - 40 : at.bottom + 8;
  const def = kind ? KIND_BY_ID.get(kind) : null;
  return (
    <div className="quick-style" role="toolbar" aria-label="Quick style" style={{ left, top }} onMouseDown={keep}>
      {def ? (
        <>
          <span className="qs-kind" title="Its look comes from its kind">
            {def.name}
          </span>
          <button title="Convert to plain (hand-styled, no longer follows the kind)" onMouseDown={keep} onClick={() => run((m) => m.convertKindToPlain())}>
            Plain
          </button>
          <button
            title="Edit the kind's style"
            onMouseDown={keep}
            onClick={() => {
              set({ at: null });
              void import("./NotationSettings").then((m) => m.openNotationSettings(kind!));
            }}
          >
            Style…
          </button>
        </>
      ) : (
        <>
          <button title="Bold (Ctrl+Shift+B)" onMouseDown={keep} onClick={() => run((m) => m.toggleBold())}>
            <strong>B</strong>
          </button>
          <button title="Italic ↔ upright" onMouseDown={keep} onClick={() => run((m) => m.applyToSelection(toggledUpright))}>
            I/U
          </button>
          {QUICK_ACCENTS.map((a) => (
            <button key={a.id} title={a.title} onMouseDown={keep} onClick={() => run((m) => m.applyToSelection((src) => toggledAccent(src, a.id)))}>
              <MathTile latex={`\\${a.id}{x}`} cell={ICON_CELL} />
            </button>
          ))}
          <select
            title="Make the selection (or the symbol before the cursor) a notation kind"
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (id) run((m) => m.makeKindFromSelection(id));
            }}
          >
            <option value="">Make → kind…</option>
            {KINDS.filter((k) => k.args === 1).map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
