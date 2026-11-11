import { create } from "zustand";
import { Modal } from "./Dialogs";
import { insertNumberMarker } from "../lib/numbering";

/**
 * Numbering marker at Word's cursor (like MathType's section breaks): chapter (3), appendix (A), or a
 * section of either (3.2, A.1). "Insert section marker" opens it prefilled from the marker before the
 * cursor, with the next section number.
 */
interface MarkerState {
  open: boolean;
  chapter: number;
  section: number;
  appendix: boolean;
  /** Opened as "Insert section marker" (prefilled). */
  sectionMode: boolean;
  set: (s: Partial<Omit<MarkerState, "set">>) => void;
}

export const useNumberMarker = create<MarkerState>((set) => ({
  open: false,
  chapter: 1,
  section: 1,
  appendix: false,
  sectionMode: false,
  set: (s) => set(s),
}));
export const openNumberMarker = () => useNumberMarker.getState().set({ open: true, sectionMode: false });

/** A new section: the chapter (or appendix) of the marker before the cursor, and its next section. */
export async function openSectionMarker() {
  const { connector, addinSupports } = await import("../lib/connector");
  let chapter = 1;
  let section = 1;
  let appendix = false;
  if (addinSupports("markerBefore")) {
    const m = await connector.request("markerBefore", {}).catch(() => ({ none: true }) as { none: true; chapter?: number; section?: number; appendix?: boolean });
    if (!m.none && m.chapter) {
      chapter = m.chapter;
      appendix = !!m.appendix;
      section = (m.section ?? 0) + 1;
    }
  }
  useNumberMarker.getState().set({ open: true, sectionMode: true, chapter, section, appendix });
}

const letter = (n: number) => String.fromCharCode(64 + n);

export function NumberMarkerDialog() {
  const s = useNumberMarker();
  if (!s.open) return null;
  const close = () => s.set({ open: false });
  const label = `${s.appendix ? letter(s.chapter) : s.chapter}${s.section ? `.${s.section}` : ""}`;
  return (
    <Modal title={s.sectionMode ? "Insert section marker" : "Equation numbering marker"} onClose={close} width={480}>
      <div className="form">
        <p className="hint">
          Put Word's cursor right after the {s.sectionMode ? "section" : "chapter, appendix or section"} heading. The marker is hidden; equation numbers after it restart at {label}.1, and Update numbers
          renumbers the equations after it.
        </p>
        <label className="check">
          <input type="checkbox" checked={s.appendix} onChange={(e) => s.set({ appendix: e.target.checked })} /> Appendix (letters: A.1.1)
        </label>
        <label>
          {s.appendix ? "Appendix (1 = A, 2 = B…)" : "Chapter"}
          <input type="number" min={1} value={s.chapter} onChange={(e) => s.set({ chapter: Math.max(1, Number(e.target.value) || 1) })} />
        </label>
        <label>
          Section (0 = chapter or appendix start, no section)
          <input type="number" min={0} value={s.section} onChange={(e) => s.set({ section: Math.max(0, Number(e.target.value) || 0) })} />
        </label>
        <p>
          Marker: <code>{label}</code>
        </p>
        <div className="modal-actions">
          <div className="spacer" />
          <button onClick={close}>Cancel</button>
          <button
            className="primary"
            onClick={() => {
              void insertNumberMarker({ chapter: s.chapter, section: s.section, appendix: s.appendix }).then(() => import("../lib/numbering").then((m) => m.updateNumbers()));
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
