import { useState } from "react";
import { create } from "zustand";
import { Modal } from "./Dialogs";
import { useApp } from "../lib/store";

/** Report a problem: a note, whether to include the document, then a zip saved where you choose. */
export const useProblemReport = create<{ open: boolean; set: (open: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));

export function openProblemReport() {
  useProblemReport.getState().set(true);
}

export function ProblemReportDialog() {
  const open = useProblemReport((s) => s.open);
  const set = useProblemReport((s) => s.set);
  const [note, setNote] = useState("");
  const [includeDocument, setIncludeDocument] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const close = () => set(false);
  const save = async () => {
    setBusy(true);
    try {
      const path = await import("../lib/problemReport").then((m) => m.saveProblemReport({ note, includeDocument }));
      if (path) {
        useApp.getState().notify(`Problem report saved: ${path}`);
        close();
      }
    } catch (e) {
      useApp.getState().notify(`Could not save the report: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Report a problem" onClose={close} width={560}>
      <div className="form">
        <p className="hint">
          Saves one zip: the versions, the app's recent messages and the Word add-in's log, with document names and LaTeX masked. Nothing is sent anywhere; you choose where it goes.
        </p>
        <label>
          <span>What happened (optional)</span>
          <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} data-testid="pr-note" />
        </label>
        <label className="check">
          <input type="checkbox" checked={includeDocument} onChange={(e) => setIncludeDocument(e.target.checked)} /> Include the document open in Word (and leave names and LaTeX in the logs)
        </label>
        <div className="modal-actions">
          <button onClick={close}>Cancel</button>
          <button className="primary" onClick={() => void save()} disabled={busy}>
            Save the report…
          </button>
        </div>
      </div>
    </Modal>
  );
}
