import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { normalizeBold } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { Modal } from "./Dialogs";
import { MathPreview } from "./MathPreview";
import { buildDocumentIndex, rewriteDocument, type DocumentIndex } from "../lib/symbolIndex";
import { useApp } from "../lib/store";

/**
 * Normalize bold: finds equations where bold spread from a letter into its subscripts or
 * superscripts (𝐱 with a bold 1, 𝐛̂ with bold indices), lists them before/after, and fixes them in
 * one undo step. The transpose mark is left to the transpose rule (Change notation).
 */
export const useNormalizeBold = create<{ open: boolean; set: (o: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));
export const openNormalizeBold = () => useNormalizeBold.getState().set(true);

export const normalizedBold = (latex: string) => {
  const root = parseLatex(latex).root;
  return normalizeBold(root) ? serializeLatex(root) : latex;
};

export function NormalizeBoldDialog() {
  const open = useNormalizeBold((s) => s.open);
  const set = useNormalizeBold((s) => s.set);
  const connected = useApp((s) => s.connector.connected);
  const [index, setIndex] = useState<DocumentIndex | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !connected) return;
    setIndex(null);
    buildDocumentIndex()
      .then(setIndex)
      .catch((e: unknown) => useApp.getState().notify(e instanceof Error ? e.message : String(e), "error"));
  }, [open, connected]);
  const changes = useMemo(() => (index ? index.equations.map((e) => ({ e, after: normalizedBold(e.latex) })).filter((x) => x.after !== x.e.latex) : []), [index]);
  if (!open) return null;
  const close = () => set(false);
  const apply = async () => {
    if (!index) return;
    setBusy(true);
    try {
      const r = await rewriteDocument(index, changes.map((c) => c.e), normalizedBold, "Normalize bold");
      useApp.getState().notify(`Bold limited to the base letters in ${r.equations} equation(s)${r.libraryEquations ? ` and ${r.libraryEquations} library equation(s)` : ""}. One Ctrl+Z in Word undoes it.${r.note}`);
      close();
    } catch (e) {
      useApp.getState().notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={index ? `Normalize bold — “${index.name}”` : "Normalize bold"} onClose={close} width={760}>
      <div className="form">
        {!connected && <p className="empty">Start Word with the document open.</p>}
        {connected && !index && <p className="empty">Reading the document…</p>}
        {index && changes.length === 0 && <p className="empty">No equation has bold scripts: nothing to change.</p>}
        {changes.length > 0 && (
          <>
            <p className="hint">Bold on a letter should not cover its subscripts and superscripts: their bold is removed (nothing else is written), and the document style draws them — italic or upright, and bold too if its "bold base: index letters" setting says so. These equations will change:</p>
            <ul className="normalize-list">
              {changes.map(({ e, after }) => (
                <li key={e.tag}>
                  <span className="muted">{e.number ?? (e.page ? `p. ${e.page}` : "")}</span>
                  <MathPreview latex={e.latex} />
                  <span aria-hidden>→</span>
                  <MathPreview latex={after} />
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="modal-actions">
          <span className="muted">{changes.length ? `${changes.length} equation(s)` : ""}</span>
          <div className="spacer" />
          <button onClick={close}>Cancel</button>
          <button className="primary" disabled={!changes.length || busy} onClick={() => void apply()}>
            {busy ? "Changing…" : "Normalize"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
