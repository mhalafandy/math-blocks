import { create } from "zustand";
import { Modal } from "./Dialogs";
import { MathPreview } from "./MathPreview";
import { useApp } from "../lib/store";
import type { StyleIssue } from "../lib/styleCheck";
import type { DocumentIndex } from "../lib/symbolIndex";

/**
 * Check style: equations that deviate from the document's style (forced \mathrm/\mathit/\mathbf,
 * an index written in two ways, a letter in several forms, pictures drawn in an older style). Per
 * item or for all ticked: conform to the style (one Ctrl+Z), or keep as a deliberate exception
 * (remembered in the document's style, not listed again).
 */
interface State {
  open: boolean;
  busy: boolean;
  index: DocumentIndex | null;
  issues: StyleIssue[];
  ticked: Set<string>;
  message?: string;
  set: (s: Partial<Omit<State, "set">>) => void;
}

export const useCheckStyle = create<State>((set) => ({ open: false, busy: false, index: null, issues: [], ticked: new Set(), set: (s) => set(s) }));

export async function openCheckStyle(message?: string) {
  const app = useApp.getState();
  if (!app.connector.connected) return app.notify("Word is not connected.", "error");
  const ui = useCheckStyle.getState();
  ui.set({ open: true, busy: true, index: null, issues: [], message });
  try {
    const { checkDocumentStyle } = await import("../lib/styleRun");
    const r = await checkDocumentStyle();
    ui.set({ busy: false, index: r.index, issues: r.issues, ticked: new Set(r.issues.filter((i) => i.fix || i.redraw || i.rule).map((i) => i.key)) });
  } catch (e) {
    ui.set({ open: false, busy: false });
    app.notify(e instanceof Error ? e.message : String(e), "error");
  }
}

const KIND_LABEL: Record<StyleIssue["kind"], string> = { forced: "Forced look", mixed: "Written two ways", forms: "Several forms", outdated: "Older drawing", rule: "Proposed rule" };

export function CheckStyleDialog() {
  const s = useCheckStyle();
  if (!s.open) return null;
  const close = () => s.set({ open: false, index: null, issues: [] });
  const conform = async (issues: StyleIssue[]) => {
    if (!s.index || !issues.length) return;
    s.set({ busy: true });
    try {
      const { conformIssues } = await import("../lib/styleRun");
      const r = await conformIssues(s.index, issues);
      await openCheckStyle(`${r.equations} equation(s) conformed to the style. One Ctrl+Z in Word undoes it.${r.note}`);
    } catch (e) {
      s.set({ busy: false, message: e instanceof Error ? e.message : String(e) });
    }
  };
  const keep = async (issues: StyleIssue[]) => {
    if (!issues.length) return;
    s.set({ busy: true });
    try {
      const { keepAsExceptions } = await import("../lib/styleRun");
      await keepAsExceptions(issues.map((i) => i.key));
      s.set({ busy: false, issues: s.issues.filter((i) => !issues.includes(i)), message: `${issues.length} item(s) kept as exceptions (not listed again).` });
    } catch (e) {
      s.set({ busy: false, message: e instanceof Error ? e.message : String(e) });
    }
  };
  const ticked = s.issues.filter((i) => s.ticked.has(i.key));
  const toggle = (key: string) => {
    const next = new Set(s.ticked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    s.set({ ticked: next });
  };
  return (
    <Modal title={s.index ? `Check style — “${s.index.name}”` : "Check style"} onClose={close} width={880}>
      <div className="form">
        {s.message && <p>{s.message}</p>}
        {!s.index ? (
          <p className="hint">{s.busy ? "Reading the document's equations…" : ""}</p>
        ) : s.issues.length === 0 ? (
          <p>Every equation follows the document style.</p>
        ) : (
          <>
            <p className="hint">{s.issues.length} item(s) deviate from the document style. Conforming removes the hand-forced look so the style draws it; nothing else changes.</p>
            <div style={{ maxHeight: 460, overflow: "auto" }}>
              {s.issues.map((i) => (
                <div key={i.key} style={{ borderBottom: "1px solid var(--border, #ddd)", padding: "6px 0", display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                  <div>
                    <label className="check">
                      <input type="checkbox" checked={s.ticked.has(i.key)} onChange={() => toggle(i.key)} disabled={s.busy} /> <strong>{KIND_LABEL[i.kind]}</strong> — {i.message}
                    </label>
                    <div className="hint">
                      {i.equations.length} equation(s){i.equations.length > 1 ? ", first:" : ":"} <MathPreview latex={i.snippet} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "start" }}>
                    {(i.fix || i.redraw || i.rule) && (
                      <button onClick={() => void conform([i])} disabled={s.busy}>
                        {i.rule ? "Accept rule" : "Conform"}
                      </button>
                    )}
                    <button onClick={() => void keep([i])} disabled={s.busy}>
                      {i.rule ? "Reject" : "Keep as exception"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="modal-actions">
          <button onClick={() => void keep(ticked)} disabled={s.busy || !ticked.length}>
            Keep ticked as exceptions
          </button>
          <div className="spacer" />
          <button onClick={close} disabled={s.busy}>
            Close
          </button>
          <button className="primary" onClick={() => void conform(ticked.filter((i) => i.fix || i.redraw || i.rule))} disabled={s.busy || !ticked.some((i) => i.fix || i.redraw || i.rule)}>
            {s.busy && s.index ? "Working…" : `Conform ticked (${ticked.filter((i) => i.fix || i.redraw || i.rule).length})`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
