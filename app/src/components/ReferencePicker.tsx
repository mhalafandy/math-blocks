import { useMemo, useState } from "react";
import { Modal } from "./Dialogs";
import { MathPreview } from "./MathPreview";
import { insertReference, useReferences, type ReferenceItem } from "../lib/numbering";

/** Picks a numbered equation of the Word document and inserts a cross-reference to it. */
export function ReferencePicker() {
  const { open, loading, items, set } = useReferences();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.number.toLowerCase().includes(q) || i.context.toLowerCase().includes(q) || (i.latex ?? "").toLowerCase().includes(q));
  }, [items, query]);
  if (!open) return null;
  const close = () => set({ open: false });
  const pick = (i: ReferenceItem) => void insertReference(i);
  return (
    <Modal title="Insert reference to an equation" onClose={close} width={620}>
      <div className="form">
        <input autoFocus placeholder="Search by number, text or LaTeX…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && shown[0] && pick(shown[0])} />
        <div className="conv-list">
          {loading && <p className="empty">Reading the document…</p>}
          {!loading && items.length === 0 && <p className="empty">This document has no numbered equations yet. Choose “Numbered” in the toolbar before sending an equation, or press “Number equation” in Word.</p>}
          {shown.map((i) => (
            <button key={i.bookmark} className="conv-row ref-row" onClick={() => pick(i)} title={`Page ${i.page || "?"}`}>
              <span className="conv-num">{i.number || "?"}</span>
              <span className="conv-eq">{i.latex ? <MathPreview latex={i.latex} /> : <span className="muted">{i.kind === "mathtype" ? "MathType equation" : "equation"}: {i.context}</span>}</span>
              <span className="muted ref-page">{i.page ? `p. ${i.page}` : ""}</span>
            </button>
          ))}
        </div>
        <p className="hint">The reference is a Word field: it follows when equations are renumbered (Update numbers).</p>
        <div className="modal-actions">
          <button onClick={close}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}
