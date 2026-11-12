import { useMemo } from "react";
import { create } from "zustand";
import { Modal } from "./Dialogs";
import { MathPreview } from "./MathPreview";
import { KIND_RULES, SUGGESTED_KIND_RULES, applyKindRules, reviewKinds } from "../lib/kindRules";
import type { DocumentIndex } from "../lib/symbolIndex";

/**
 * Review notation kinds: every older form in the document that could be a notation kind, with how many
 * equations it changes and examples before → after. Tick what to apply; one Ctrl+Z undoes it.
 */
interface State {
  open: boolean;
  busy: boolean;
  index: DocumentIndex | null;
  enabled: Set<string>;
  done?: string;
  set: (s: Partial<Omit<State, "set">>) => void;
}

export const useKindsReview = create<State>((set) => ({ open: false, busy: false, index: null, enabled: new Set(SUGGESTED_KIND_RULES), set: (s) => set(s) }));

export async function openKindsReview() {
  const { useApp } = await import("../lib/store");
  if (!useApp.getState().connector.connected) return useApp.getState().notify("Word is not connected.", "error");
  useKindsReview.getState().set({ open: true, busy: true, index: null, done: undefined, enabled: new Set(SUGGESTED_KIND_RULES) });
  try {
    const { buildDocumentIndex } = await import("../lib/symbolIndex");
    const index = await buildDocumentIndex();
    useKindsReview.getState().set({ busy: false, index });
  } catch (e) {
    useKindsReview.getState().set({ open: false, busy: false });
    useApp.getState().notify(e instanceof Error ? e.message : String(e), "error");
  }
}

export function KindsReviewDialog() {
  const s = useKindsReview();
  const latexes = useMemo(() => (s.index ? s.index.equations.map((e) => e.latex) : []), [s.index]);
  const items = useMemo(() => reviewKinds(latexes, s.enabled), [latexes, s.enabled]);
  const changed = useMemo(() => latexes.filter((l) => applyKindRules(l, s.enabled).latex !== l).length, [latexes, s.enabled]);
  if (!s.open) return null;
  const close = () => s.set({ open: false, index: null });
  const toggle = (id: string) => {
    const next = new Set(s.enabled);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    s.set({ enabled: next });
  };
  const apply = async () => {
    if (!s.index) return;
    s.set({ busy: true });
    try {
      const { rewriteDocument } = await import("../lib/symbolIndex");
      const r = await rewriteDocument(s.index, s.index.equations, (l) => applyKindRules(l, s.enabled).latex, "Apply notation kinds");
      s.set({ busy: false, done: `${r.equations} equation(s) now use notation kinds${r.libraryEquations ? ` (and ${r.libraryEquations} library equation(s))` : ""}. One Ctrl+Z in Word undoes it.${r.note}` });
    } catch (e) {
      s.set({ busy: false });
      const { useApp } = await import("../lib/store");
      useApp.getState().notify(e instanceof Error ? e.message : String(e), "error");
    }
  };
  return (
    <Modal title={s.index ? `Review notation kinds — “${s.index.name}”` : "Review notation kinds"} onClose={close} width={900}>
      <div className="form">
        {!s.index ? (
          <p className="hint">{s.busy ? "Reading the document's equations…" : ""}</p>
        ) : s.done ? (
          <p>{s.done}</p>
        ) : (
          <>
            <p className="hint">
              {latexes.length} equation(s). Each line is an older way of writing that MathBlocks can turn into a notation kind (so its look is set in one place and the consistency checks understand it).
              Ticked: {changed} equation(s) change. Nothing is written before you apply.
            </p>
            <div style={{ maxHeight: 460, overflow: "auto" }}>
              {items
                .filter((i) => i.count > 0)
                .map((i) => (
                  <div key={i.rule.id} style={{ borderBottom: "1px solid var(--border, #ddd)", padding: "6px 0" }}>
                    <label className="check">
                      <input type="checkbox" checked={s.enabled.has(i.rule.id)} onChange={() => toggle(i.rule.id)} disabled={s.busy} /> <strong>{i.count}</strong> — {i.rule.label}
                    </label>
                    {i.rule.note && <div className="hint">{i.rule.note}</div>}
                    {i.examples.slice(0, 2).map((x, k) => (
                      <div key={k} style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 12 }}>
                        <MathPreview latex={x.before} />
                        <span>→</span>
                        <MathPreview latex={x.after} />
                        <code style={{ opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }}>{x.after}</code>
                      </div>
                    ))}
                  </div>
                ))}
              {items.every((i) => i.count === 0) && <p>Every equation already uses notation kinds where it can.</p>}
            </div>
          </>
        )}
        <div className="modal-actions">
          <button onClick={() => s.set({ enabled: new Set(KIND_RULES.map((r) => r.id)) })} disabled={s.busy || !!s.done}>
            Tick all
          </button>
          <button onClick={() => s.set({ enabled: new Set(SUGGESTED_KIND_RULES) })} disabled={s.busy || !!s.done}>
            Suggested
          </button>
          <div className="spacer" />
          {s.done ? (
            <button className="primary" onClick={close}>
              Close
            </button>
          ) : (
            <>
              <button onClick={close} disabled={s.busy}>
                Cancel
              </button>
              <button className="primary" onClick={() => void apply()} disabled={s.busy || !s.index || changed === 0}>
                {s.busy && s.index ? "Applying…" : `Apply to ${changed} equation(s)`}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
