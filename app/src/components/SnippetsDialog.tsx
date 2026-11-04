import { useEffect, useState } from "react";
import { create } from "zustand";
import { Modal } from "./Dialogs";
import { MathPreview } from "./MathPreview";
import { DEFAULT_SNIPPETS, loadSnippets, saveSnippets, type Snippet } from "../lib/snippets";
import { useApp } from "../lib/store";

/** Edit the snippets (trigger + Tab in the equation editor). */
export const useSnippets = create<{ open: boolean; set: (o: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));
export const openSnippets = () => useSnippets.getState().set(true);

export function SnippetsDialog() {
  const open = useSnippets((s) => s.open);
  const set = useSnippets((s) => s.set);
  const [list, setList] = useState<Snippet[]>([]);
  useEffect(() => {
    if (open) setList(loadSnippets());
  }, [open]);
  if (!open) return null;
  const close = () => set(false);
  const update = (i: number, patch: Partial<Snippet>) => setList(list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const bad = list.filter((s) => !/^[A-Za-z0-9]+$/.test(s.trigger) || !s.latex.trim());
  return (
    <Modal title="Snippets" onClose={close} width={760}>
      <div className="form">
        <p className="hint">
          In the equation editor, type a trigger and press <kbd>Tab</kbd>: it becomes the snippet. Use <code>#?</code> for slots to fill (Tab moves between them). Triggers are letters and digits.
        </p>
        <div className="snippets">
          {list.map((s, i) => (
            <div key={i} className="snippet-row">
              <input value={s.trigger} onChange={(e) => update(i, { trigger: e.target.value.trim() })} placeholder="trigger" spellCheck={false} />
              <input value={s.latex} onChange={(e) => update(i, { latex: e.target.value })} placeholder="LaTeX, #? = slot" spellCheck={false} />
              <span className="snippet-preview">
                <MathPreview latex={s.latex.replace(/#\?/g, "\\square")} />
              </span>
              <button className="icon-btn" title="Remove" onClick={() => setList(list.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={() => setList([...list, { trigger: "", latex: "", name: "" }])}>Add snippet</button>
          <button onClick={() => setList(DEFAULT_SNIPPETS)}>Restore defaults</button>
          <div className="spacer" />
          {bad.length > 0 && <span className="conv-msg">{bad.length} incomplete</span>}
          <button onClick={close}>Cancel</button>
          <button
            className="primary"
            disabled={bad.length > 0}
            onClick={() => {
              saveSnippets(list);
              useApp.getState().notify(`Saved ${list.length} snippets`);
              close();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
