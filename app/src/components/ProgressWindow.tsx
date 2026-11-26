import { useProgress } from "../lib/progress";

/** The app's one progress window (lib/progress.ts): title, bar and count, current step, Cancel. */
export function ProgressWindow() {
  const op = useProgress((s) => s.op);
  const set = useProgress((s) => s.set);
  if (!op) return null;
  const pct = op.total ? Math.min(100, Math.round((op.done / Math.max(1, op.total)) * 100)) : null;
  return (
    <div className="modal-backdrop progress-backdrop">
      <div className="modal progress-window" role="dialog" aria-modal="true" aria-label={op.title} aria-busy="true">
        <h2>{op.title}</h2>
        <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={op.total ?? undefined} aria-valuenow={op.total ? op.done : undefined}>
          <div className={pct === null ? "progress-fill indeterminate" : "progress-fill"} style={pct === null ? undefined : { width: `${pct}%` }} />
        </div>
        <p className="progress-count">{op.total ? `${op.done} / ${op.total}` : op.done ? `${op.done}` : " "}</p>
        <p className="hint progress-text">{op.cancelled ? "Stopping…" : op.text || " "}</p>
        {op.canCancel && (
          <div className="modal-actions">
            <div className="spacer" />
            <button disabled={op.cancelled} onClick={() => set({ ...op, cancelled: true })}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
