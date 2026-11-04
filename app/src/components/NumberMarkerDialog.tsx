import { useState } from "react";
import { create } from "zustand";
import { Modal } from "./Dialogs";
import { insertNumberMarker } from "../lib/numbering";

/** Chapter/section/appendix marker for the "MathBlocks markers" numbering source (like MathType's section breaks). */
export const useNumberMarker = create<{ open: boolean; set: (o: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));
export const openNumberMarker = () => useNumberMarker.getState().set(true);

export function NumberMarkerDialog() {
  const open = useNumberMarker((s) => s.open);
  const set = useNumberMarker((s) => s.set);
  const [chapter, setChapter] = useState(1);
  const [section, setSection] = useState(1);
  const [appendix, setAppendix] = useState(false);
  if (!open) return null;
  const close = () => set(false);
  return (
    <Modal title="Equation chapter marker" onClose={close} width={460}>
      <div className="form">
        <p className="hint">Put Word's cursor at the start of the chapter, section or appendix. The marker is hidden text; equation numbers after it restart.</p>
        <label className="check">
          <input type="checkbox" checked={appendix} onChange={(e) => setAppendix(e.target.checked)} /> Appendix (numbers like A.1)
        </label>
        <label>
          {appendix ? "Appendix (1 = A, 2 = B…)" : "Chapter"}
          <input type="number" min={1} value={chapter} onChange={(e) => setChapter(Math.max(1, Number(e.target.value) || 1))} />
        </label>
        <label>
          Section
          <input type="number" min={1} value={section} onChange={(e) => setSection(Math.max(1, Number(e.target.value) || 1))} />
        </label>
        <div className="modal-actions">
          <div className="spacer" />
          <button onClick={close}>Cancel</button>
          <button
            className="primary"
            onClick={() => {
              void insertNumberMarker({ chapter, section, appendix });
              close();
            }}
          >
            Insert marker
          </button>
        </div>
      </div>
    </Modal>
  );
}
