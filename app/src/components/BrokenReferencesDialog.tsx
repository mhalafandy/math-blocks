import { create } from "zustand";
import { Modal } from "./Dialogs";
import type { BrokenReference } from "@mathblocks/connector-protocol";

/** References to equations that no longer exist, listed after Update numbers (none goes unnoticed). */
export const useBrokenReferences = create<{ list: BrokenReference[]; set: (list: BrokenReference[]) => void }>((set) => ({ list: [], set: (list) => set({ list }) }));
export const showBrokenReferences = (list: BrokenReference[]) => useBrokenReferences.getState().set(list);

export function BrokenReferencesDialog() {
  const list = useBrokenReferences((s) => s.list);
  const set = useBrokenReferences((s) => s.set);
  if (!list.length) return null;
  return (
    <Modal title={`${list.length} broken reference(s)`} onClose={() => set([])} width={720}>
      <div className="form">
        <p>These references point to an equation that no longer exists; Word shows “Error! Reference source not found” there. Delete them, or insert a new reference.</p>
        <ul className="issue-list" style={{ maxHeight: 360, overflow: "auto" }}>
          {list.map((b, i) => (
            <li key={i} className="error">
              <code>{b.snippet}</code> <span className="hint">({b.bookmark})</span>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <div className="spacer" />
          <button className="primary" onClick={() => set([])}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
