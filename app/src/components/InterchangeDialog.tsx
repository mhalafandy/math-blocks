import { create } from "zustand";
import { Modal } from "./Dialogs";
import type { InterchangePlan } from "../lib/latexInterchange";
import type { InterchangeResult } from "../lib/latexInterchangeRun";

/**
 * Convert LaTeX (interchange convention): the pre-flight report before anything is written — counts and
 * every problem with the text around it — then progress, then the result with the time per equation.
 */
interface State {
  open: boolean;
  name: string;
  plan: InterchangePlan | null;
  stage: "preflight" | "working" | "result";
  progress?: string;
  result?: InterchangeResult;
  show: (s: { name: string; plan: InterchangePlan; stage: State["stage"]; progress?: string; result?: InterchangeResult }) => void;
  close: () => void;
}

export const useInterchange = create<State>((set) => ({
  open: false,
  name: "",
  plan: null,
  stage: "preflight",
  show: (s) => set({ open: true, ...s }),
  close: () => set({ open: false, plan: null, result: undefined, progress: undefined }),
}));

export function InterchangeDialog() {
  const s = useInterchange();
  if (!s.open || !s.plan) return null;
  const plan = s.plan;
  const c = plan.counts;
  const errors = plan.issues.filter((i) => i.severity === "error");
  const warnings = plan.issues.filter((i) => i.severity === "warning");
  const valid = plan.equations.filter((e) => !e.invalid).length;
  const answer = async (go: boolean) => (await import("../lib/latexInterchangeRun")).answerPreflight(go);
  const copy = async () => {
    const { describePlan, describeResult } = await import("../lib/latexInterchangeRun");
    const text = describePlan(plan, s.name) + (s.result ? `\n\n${describeResult(s.result)}\n${s.result.failed.map((f) => `NOT WRITTEN  ${f.what} — ${f.problem}`).join("\n")}` : "");
    await navigator.clipboard?.writeText(text).catch(() => undefined);
  };
  const close = () => {
    if (s.stage === "preflight") void answer(false);
    s.close();
  };
  return (
    <Modal title={`Convert LaTeX — “${s.name}”`} onClose={close} width={820}>
      <div className="form">
        <p>
          {c.inline} inline, {c.display} display, {c.numbered} numbered{c.legacyNumbers ? ` (${c.legacyNumbers} with a typed number)` : ""}, {c.references} reference(s), {c.markers} numbering marker(s)
          {c.mapped ? `; ${c.mapped} with older forms mapped to notation kinds` : ""}.
        </p>
        {s.stage === "preflight" && (
          <p className={errors.length ? "error" : "hint"}>
            {errors.length ? `${errors.length} error(s): those items are not converted.` : "No errors."} {warnings.length ? `${warnings.length} warning(s).` : ""} Nothing has been written yet.
          </p>
        )}
        {s.stage === "working" && <p className="hint">{s.progress ?? "Working…"}</p>}
        {s.stage === "result" && s.result && (
          <>
            <p>
              {s.result.equations} equation(s) written in {((s.result.buildMs + s.result.writeMs) / 1000).toFixed(1)} s —{" "}
              {s.result.equations ? Math.round((s.result.buildMs + s.result.writeMs) / s.result.equations) : 0} ms per equation (building {Math.round(s.result.buildMs)} ms, writing in Word {Math.round(s.result.writeMs)} ms). One Ctrl+Z in Word undoes it.
            </p>
            {s.result.undoBrokenAt && <p className="error">Word closed the undo record early ({s.result.undoBrokenAt}): it may take more than one Ctrl+Z. Please send connector.log.</p>}
            {(s.result.broken?.length ?? 0) > 0 && (
              <ul className="issue-list">
                {s.result.broken!.map((b, i) => (
                  <li key={i} className="error">
                    Broken reference (no such equation): <code>{b.snippet}</code>
                  </li>
                ))}
              </ul>
            )}
            {s.result.failed.length > 0 && (
              <ul className="issue-list">
                {s.result.failed.map((f, i) => (
                  <li key={i} className="error">
                    Not written: <code>{f.what}</code> — {f.problem}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {plan.issues.length > 0 && (
          <ul className="issue-list" style={{ maxHeight: 320, overflow: "auto" }}>
            {plan.issues.map((i, k) => (
              <li key={k} className={i.severity}>
                <strong>{i.severity === "error" ? "Error" : "Warning"}:</strong> {i.what}
                <br />
                <code>{i.snippet}</code>
              </li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          <button onClick={() => void copy()}>Copy report</button>
          <div className="spacer" />
          {s.stage === "preflight" ? (
            <>
              {plan.needsNumberingConversion && (
                <button
                  onClick={() => {
                    close();
                    void import("../lib/numberingConversionRun").then((m) => m.openNumberingConversion());
                  }}
                >
                  Convert numbering first…
                </button>
              )}
              <button onClick={close}>Stop</button>
              <button className="primary" disabled={!valid && !c.markers && !c.references} onClick={() => void answer(true)}>
                {errors.length ? `Convert the ${valid} valid equation(s)` : `Convert ${valid} equation(s)`}
              </button>
            </>
          ) : (
            <button className="primary" disabled={s.stage === "working"} onClick={close}>
              Close
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
