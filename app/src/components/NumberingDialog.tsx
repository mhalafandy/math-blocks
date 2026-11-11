import { useMemo } from "react";
import { create } from "zustand";
import { Modal } from "./Dialogs";
import { describeNumberingChanges, planNumberingConversion, type NumberingMode, type NumberingScan } from "../lib/numberingConversion";
import type { NumberingResult } from "../lib/numberingConversionRun";

/**
 * Convert MathType numbering: choose "keep the existing numbers" or "renumber to chapter.section.equation",
 * see every number before → after and every problem, then confirm or cancel. Nothing is written before.
 */
interface State {
  open: boolean;
  scan: NumberingScan | null;
  mode: NumberingMode;
  busy: boolean;
  result?: NumberingResult;
  show: (scan: NumberingScan, mode: NumberingMode) => void;
  set: (s: Partial<Omit<State, "show" | "set">>) => void;
}

export const useNumberingDialog = create<State>((set) => ({
  open: false,
  scan: null,
  mode: "renumber",
  busy: false,
  show: (scan, mode) => set({ open: true, scan, mode, busy: false, result: undefined }),
  set: (s) => set(s),
}));

export function NumberingDialog() {
  const s = useNumberingDialog();
  const plan = useMemo(() => (s.scan ? planNumberingConversion(s.scan, s.mode) : null), [s.scan, s.mode]);
  if (!s.open || !s.scan || !plan) return null;
  const close = () => s.set({ open: false, scan: null, result: undefined });
  const errors = plan.problems.filter((p) => p.severity === "error");
  const copy = () => void navigator.clipboard?.writeText(describeNumberingChanges(plan, s.scan!.name)).catch(() => undefined);
  const convert = async () => {
    s.set({ busy: true });
    try {
      const { convertNumbering } = await import("../lib/numberingConversionRun");
      const result = await convertNumbering(s.scan!, s.mode);
      s.set({ busy: false, result });
    } catch (e) {
      s.set({ busy: false });
      const { useApp } = await import("../lib/store");
      useApp.getState().notify(e instanceof Error ? e.message : String(e), "error");
    }
  };
  const r = s.result;
  return (
    <Modal title={`Convert MathType numbering — “${s.scan.name}”`} onClose={close} width={820}>
      <div className="form">
        <p className="hint">
          {plan.counts.numbers} MathType number(s){plan.counts.breaks ? `, ${plan.counts.breaks} break(s)` : ""}. They become MathBlocks numbers (one numbering scheme, so new equations continue them); every number
          keeps its bookmark, so references keep pointing at their equation.
        </p>
        {!r && (
          <>
            <label className="check">
              <input type="radio" checked={s.mode === "keep"} onChange={() => s.set({ mode: "keep" })} disabled={s.busy} /> Keep the existing numbers ({plan.levels} level{plan.levels > 1 ? "s" : ""})
            </label>
            <label className="check">
              <input type="radio" checked={s.mode === "renumber"} onChange={() => s.set({ mode: "renumber" })} disabled={s.busy || !plan.canRenumber} /> Renumber to chapter.section.equation (a section marker after
              each section heading{plan.levels >= 3 ? "; the numbers already have three levels" : ""})
            </label>
          </>
        )}
        {r ? (
          <>
            <p>
              Done in {(r.ms / 1000).toFixed(1)} s{r.backup ? `; backup ${r.backup.split(/[\\/]/).pop()}` : ""}. One Ctrl+Z in Word undoes it.
              {r.mismatches.length ? "" : " Every number shows what was planned."}
            </p>
            {r.undoBrokenAt && <p className="error">Word closed the undo record early ({r.undoBrokenAt}): it may take more than one Ctrl+Z.</p>}
            {(r.mismatches.length > 0 || r.problems.length > 0 || (r.broken?.length ?? 0) > 0) && (
              <ul className="issue-list">
                {r.mismatches.map((m, i) => (
                  <li key={`m${i}`} className="error">
                    {m.bookmark} shows {m.shows}, planned {m.planned}
                  </li>
                ))}
                {r.problems.map((p, i) => (
                  <li key={`p${i}`} className="error">
                    {p}
                  </li>
                ))}
                {(r.broken ?? []).map((b, i) => (
                  <li key={`b${i}`} className="error">
                    Broken reference: <code>{b.snippet}</code>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className={errors.length ? "error" : "hint"}>
            {plan.counts.changed} number(s) change. {plan.problems.length ? `${plan.problems.length} problem(s) — see below.` : "No problems."} Nothing has been written yet.
          </p>
        )}
        <div style={{ maxHeight: 260, overflow: "auto", columns: 3, fontSize: 12.5, margin: "6px 0" }}>
          {plan.changes.map((c, i) => (
            <div key={i} style={{ breakInside: "avoid" }} className={c.old.replace(/\s+/g, "") !== c.new ? "" : "hint"}>
              {c.old} → <strong>{c.new}</strong>
            </div>
          ))}
        </div>
        {plan.problems.length > 0 && (
          <ul className="issue-list" style={{ maxHeight: 200, overflow: "auto" }}>
            {plan.problems.map((p, i) => (
              <li key={i} className={p.severity}>
                <strong>{p.severity === "error" ? "Error" : "Warning"}:</strong> {p.what}
                {p.snippet && (
                  <>
                    <br />
                    <code>{p.snippet}</code>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          <button onClick={copy}>Copy the list</button>
          <div className="spacer" />
          {r ? (
            <button className="primary" onClick={close}>
              Close
            </button>
          ) : (
            <>
              <button onClick={close} disabled={s.busy}>
                Cancel
              </button>
              <button className="primary" onClick={() => void convert()} disabled={s.busy || errors.length > 0}>
                {s.busy ? "Converting…" : s.mode === "renumber" ? "Renumber and convert" : "Convert, keeping the numbers"}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
