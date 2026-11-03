import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { parseLatex } from "@mathblocks/math-latex";
import { Modal } from "./Dialogs";
import { MathPreview } from "./MathPreview";
import { listSymbols, renameInLatex } from "../lib/symbols";
import { useApp } from "../lib/store";
import { useLibrary } from "../lib/library/useLibrary";

/**
 * Templates (M7): any equation can be reused with other symbols. The dialog lists its symbols
 * (v₀, θ, 𝐫…); type new ones and the result is previewed, then opened in the editor as an
 * independent equation (or sent to Word directly).
 */
export const useTemplate = create<{ source: { latex: string; display: boolean; name?: string } | null; set: (s: { latex: string; display: boolean; name?: string } | null) => void }>(
  (set) => ({ source: null, set: (source) => set({ source }) }),
);

export const openTemplate = (latex: string, display: boolean, name?: string) => useTemplate.getState().set({ latex, display, name });

export function TemplateDialog({ onSend }: { onSend: () => void }) {
  const source = useTemplate((s) => s.source);
  const set = useTemplate((s) => s.set);
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => setValues({}), [source]);
  const symbols = useMemo(() => (source ? listSymbols(parseLatex(source.latex).root) : []), [source]);
  const result = useMemo(() => (source ? renameInLatex(source.latex, values) : ""), [source, values]);
  if (!source) return null;
  const close = () => set(null);
  const bad = Object.entries(values).filter(([, v]) => v.trim() && parseLatex(v).diagnostics.some((d) => d.severity === "error"));

  const toEditor = () => {
    useLibrary.getState().closeEquation();
    const app = useApp.getState();
    app.setEditing(null);
    app.setLatex(result, "external");
    app.setDisplay(source.display);
    close();
  };

  return (
    <Modal title={source.name ? `Use “${source.name}” with other symbols` : "Use with other symbols"} onClose={close} width={600}>
      <div className="form">
        <div className="save-preview">
          <MathPreview latex={result} />
        </div>
        {symbols.length === 0 ? (
          <p className="empty">This equation has no symbols to replace.</p>
        ) : (
          <div className="tpl-grid">
            {symbols.map((s, i) => (
              <label key={s.key} className="tpl-row">
                <span className="tpl-from">
                  <MathPreview latex={s.key} />
                  {s.count > 1 && <span className="muted"> ×{s.count}</span>}
                </span>
                <span aria-hidden>→</span>
                <input
                  autoFocus={i === 0}
                  placeholder={s.key}
                  value={values[s.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [s.key]: e.target.value })}
                  spellCheck={false}
                />
              </label>
            ))}
          </div>
        )}
        <p className="hint">Type LaTeX, e.g. <code>{"\\rho"}</code>, <code>u_1</code>, <code>{"\\vec{F}"}</code>. Powers stay: renaming v₀ keeps v₀². The result is an independent equation (not linked).</p>
        {bad.length > 0 && <p className="conv-msg">Check: {bad.map(([k]) => k).join(", ")}</p>}
        <div className="modal-actions">
          <button onClick={close}>Cancel</button>
          <button onClick={toEditor}>Open in editor</button>
          <button
            className="primary"
            disabled={!useApp.getState().connector.connected}
            title={useApp.getState().connector.connected ? "Insert at Word's cursor" : "Start Word to enable"}
            onClick={() => {
              toEditor();
              requestAnimationFrame(onSend);
            }}
          >
            Send to Word
          </button>
        </div>
      </div>
    </Modal>
  );
}
