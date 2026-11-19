import { useEffect, useState } from "react";
import { create } from "zustand";
import { Modal } from "./Dialogs";
import { connector } from "../lib/connector";
import { useApp } from "../lib/store";
import type { Problem } from "../lib/checkDocument";
import type { CheckResult } from "../lib/checkDocumentRun";

/**
 * Check document (ribbon, Ctrl+K): one report of everything that could be wrong — equations, style, numbers,
 * references, markers, MathType leftovers — with Go to, and the safe repairs ticked to run together (one Ctrl+Z).
 */

export interface CheckRequest {
  /** For tests: a result instead of reading Word, and what Repair does. */
  result?: Omit<CheckResult, "forms"> & { forms?: CheckResult["forms"] };
  repair?: (chosen: Set<string>) => Promise<string>;
}

export const useCheckDocument = create<{ req: CheckRequest | null; set: (r: CheckRequest | null) => void }>((set) => ({ req: null, set: (req) => set({ req }) }));

export function openCheckDocument(req: CheckRequest = {}) {
  useCheckDocument.getState().set({ ...req });
}

const GROUPS: { id: Problem["group"]; title: string }[] = [
  { id: "equations", title: "Equations" },
  { id: "style", title: "Document style" },
  { id: "numbering", title: "Numbers" },
  { id: "references", title: "References" },
  { id: "markers", title: "Hidden markers" },
  { id: "mathtype", title: "MathType" },
];

export function CheckDocumentDialog() {
  const req = useCheckDocument((s) => s.req);
  const set = useCheckDocument((s) => s.set);
  const [result, setResult] = useState<CheckRequest["result"] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    setBusy(true);
    setMessage("");
    try {
      const r: NonNullable<CheckRequest["result"]> = req?.result ?? (await import("../lib/checkDocumentRun").then((m) => m.runCheck()));
      setResult(r);
      setChosen(new Set(r.problems.filter((p) => p.repair).map((p) => p.id)));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!req) return;
    setResult(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);
  if (!req) return null;
  const close = () => set(null);
  const problems = result?.problems ?? [];
  const repairable = problems.filter((p) => p.repair);
  const goTo = (p: Problem) => {
    if (p.tag) void connector.request("selectInstance", { tag: p.tag }).catch(() => undefined);
    else if (p.start !== undefined) void connector.request("selectRange", { start: p.start }).catch(() => undefined);
  };
  const runCommand = (c: NonNullable<Problem["command"]>) => {
    close();
    if (c === "convertMathType") void import("../lib/convertMathType").then((m) => m.convertOpenDocument());
    else void import("../lib/numberingConversionRun").then((m) => m.openNumberingConversion({}));
  };
  const repair = async () => {
    if (!result) return;
    setBusy(true);
    setMessage("");
    try {
      const text = req.repair
        ? await req.repair(chosen)
        : await import("../lib/checkDocumentRun").then(async (m) => {
            const r = await m.repairChosen(result as CheckResult, chosen);
            if (r.guardFailed) return `Undone by the text guard: ${r.guardFailed}`;
            if (r.cancelled) return "Cancelled: the document is as it was.";
            return `Repaired: ${r.redrawn} equation(s) drawn again, ${r.hidden} marker(s) hidden${r.numbersUpdated ? ", numbers and references updated" : ""}. One Ctrl+Z in Word undoes it.`;
          });
      useApp.getState().notify(text);
      if (!req.result) await load();
      else setMessage(text);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Check document" onClose={close} width={860}>
      <div className="form check-document">
        {busy && !result && <p className="hint">Checking the document…</p>}
        {result && (
          <p className="cs-counts" data-testid="cd-summary">
            {result.equations} equation(s) checked in {(result.ms / 1000).toFixed(1)} s: {problems.length === 0 ? "no problems found." : `${problems.filter((p) => p.severity === "error").length} error(s), ${problems.filter((p) => p.severity === "warning").length} warning(s); ${repairable.length} can be repaired here.`}
          </p>
        )}
        <div className="cs-preview">
          {GROUPS.map((g) => {
            const list = problems.filter((p) => p.group === g.id);
            if (!list.length) return null;
            return (
              <section key={g.id} data-testid={`cd-group-${g.id}`}>
                <h4 className="style-section">
                  {g.title} ({list.length})
                </h4>
                {list.map((p) => (
                  <div key={p.id} className={`cd-problem ${p.severity}`}>
                    {p.repair ? (
                      <input type="checkbox" checked={chosen.has(p.id)} onChange={(e) => setChosen((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} title="Repair this" />
                    ) : (
                      <span className="cd-manual" title="Fix by hand">•</span>
                    )}
                    <span className="cd-message">{p.message}</span>
                    {(p.tag || p.start !== undefined) && (
                      <button className="link-button" onClick={() => goTo(p)}>
                        Go to
                      </button>
                    )}
                    {p.command && (
                      <button className="link-button" onClick={() => runCommand(p.command!)}>
                        {p.command === "convertMathType" ? "Convert MathType…" : "Convert numbering…"}
                      </button>
                    )}
                  </div>
                ))}
              </section>
            );
          })}
        </div>
        {message && <p className="conv-msg">{message}</p>}
        <div className="modal-actions">
          <button onClick={() => void load()} disabled={busy}>
            Check again
          </button>
          <button onClick={close}>Close</button>
          <button className="primary" onClick={() => void repair()} disabled={busy || !repairable.some((p) => chosen.has(p.id))} data-testid="cd-repair" title="Draw again, hide markers, update numbers: one Ctrl+Z in Word undoes it">
            Repair {repairable.filter((p) => chosen.has(p.id)).length || ""}
          </button>
        </div>
      </div>
    </Modal>
  );
}
