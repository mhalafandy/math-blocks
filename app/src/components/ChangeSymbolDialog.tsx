import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { Modal } from "./Dialogs";
import { MathPreview } from "./MathPreview";
import { MiniMathField } from "./MiniMathField";
import { connector } from "../lib/connector";
import { useApp } from "../lib/store";
import { activeStyle } from "../lib/docStyle";
import { changeInLatex, findClashes, occurrenceId, takes, type ChangeChoices, type ChangePlan, type Clash, type Occurrence, type OccurrenceClass, type PlannedEquation } from "../lib/changeSymbol";
import type { ApplyOptions, ApplyResult, ChangeContext, Mention } from "../lib/changeSymbolRun";
import { definitionSymbol } from "../lib/symbolList";

/**
 * Change symbol… (the quantity keeps its meaning and unit; only its symbol changes everywhere). Opened from the list
 * of symbols (a definition's "Change its symbol…"), the editor's right-click menu and Ctrl+K. Nothing changes in
 * Word until Apply: the preview lists every occurrence with its equation drawn before → after.
 */

export interface ChangeSymbolRequest {
  /** The symbol to change (empty: chosen in the dialog). */
  from: string;
  /** For tests: the document as read, and what Apply does (instead of Word). */
  ctx?: ChangeContext;
  apply?: (choices: ChangeChoices, o: ApplyOptions) => Promise<ApplyResult>;
}

export const useChangeSymbol = create<{ req: ChangeSymbolRequest | null; set: (r: ChangeSymbolRequest | null) => void }>((set) => ({ req: null, set: (req) => set({ req }) }));

export function openChangeSymbol(req: ChangeSymbolRequest) {
  useChangeSymbol.getState().set(req);
}

const GROUPS: { cls: OccurrenceClass; title: string; hint: string }[] = [
  { cls: "exact", title: "The symbol", hint: "" },
  { cls: "decorated", title: "With an index, power, prime, dot or frame label", hint: "Changed keeping the index or decoration. Untick any you want to keep as they are." },
];

export function ChangeSymbolDialog() {
  const req = useChangeSymbol((s) => s.req);
  const set = useChangeSymbol((s) => s.set);
  const [ctx, setCtx] = useState<ChangeContext | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preview, setPreview] = useState<{ plan: ChangePlan; clashes: Clash[]; mentions: Mention[] } | { error: string } | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [related, setRelated] = useState<Set<string>>(new Set());
  const [skipDefs, setSkipDefs] = useState<Set<number>>(new Set());
  const [blocks, setBlocks] = useState(false);
  const [merge, setMerge] = useState<"" | "both" | "existing" | "changed">("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!req) return;
    setFrom(req.from);
    setTo("");
    setPreview(null);
    setSkip(new Set());
    setRelated(new Set());
    setSkipDefs(new Set());
    setBlocks(false);
    setMerge("");
    setMessage("");
    if (req.ctx) setCtx(req.ctx);
    else {
      setCtx(null);
      setBusy(true);
      void import("../lib/changeSymbolRun")
        .then((m) => m.readForChange())
        .then(setCtx)
        .catch((e: unknown) => setMessage(e instanceof Error ? e.message : String(e)))
        .finally(() => setBusy(false));
    }
  }, [req]);

  // The preview follows the new symbol (after a pause in typing).
  useEffect(() => {
    if (!ctx || !from.trim() || !to.trim()) return setPreview(null);
    const t = setTimeout(() => {
      const run = req?.ctx
        ? import("../lib/changeSymbol").then((m) => {
            const plan = m.planChange(from, to, ctx.eqs, ctx.doc.defs, activeStyle());
            return "error" in plan ? plan : { plan, clashes: m.findClashes(plan, { skip: new Set(), related: new Set() }, ctx.eqs, ctx.doc.defs, activeStyle()), mentions: [] as Mention[] };
          })
        : import("../lib/changeSymbolRun").then((m) => m.previewChange(ctx, from, to));
      void run.then((p) => {
        setPreview(p);
        setSkip(new Set());
        setRelated(new Set());
        setSkipDefs(new Set());
        setMerge("");
      });
    }, 350);
    return () => clearTimeout(t);
  }, [ctx, from, to, req]);

  const choices: ChangeChoices = useMemo(() => ({ skip, related, skipDefinitions: skipDefs }), [skip, related, skipDefs]);
  const plan = preview && "plan" in preview ? preview.plan : null;
  // Clashes for the current choices (ticking a related form can add one).
  const clashes = useMemo(() => (plan && ctx ? findClashes(plan, choices, ctx.eqs, ctx.doc.defs, activeStyle()) : []), [plan, choices, ctx]);
  if (!req) return null;
  const close = () => set(null);
  const style = activeStyle();
  const fromOcc = from.trim() ? definitionSymbol(from, style) : null;
  const quantity = ctx && fromOcc ? ctx.doc.defs.find((d) => definitionSymbol(d.symbol, style)?.key === fromOcc.key) : undefined;

  const toggle = (s: Set<string>, k: string, on: boolean) => {
    const n = new Set(s);
    if (on) n.delete(k);
    else n.add(k);
    return n;
  };
  const afterOf = (e: PlannedEquation) => changeInLatex(e.latex, plan!.target, plan!.to, style, (o) => takes(o, e.tag, choices)).latex;
  const relatedLeft = plan ? plan.related.filter((g) => !related.has(g.key)).reduce((n, g) => n + g.count, 0) : 0;
  const counted = plan
    ? plan.equations.reduce(
        (acc, e) => {
          const n = e.occurrences.filter((o) => takes(o, e.tag, choices)).length;
          return n ? { eqs: acc.eqs + 1, occ: acc.occ + n } : acc;
        },
        { eqs: 0, occ: 0 },
      )
    : { eqs: 0, occ: 0 };
  const defsChanging = plan ? plan.definitions.filter((d) => !skipDefs.has(d.start) && (d.cls !== "related" || (!!d.relatedKey && related.has(d.relatedKey)))).length : 0;
  const needMerge = clashes.length > 0 && !merge;

  const apply = async () => {
    if (!plan || !ctx) return;
    setBusy(true);
    setMessage("");
    try {
      const o: ApplyOptions = { blocks, ...(merge ? { merge } : {}) };
      const r = req.apply ? await req.apply(choices, o) : await import("../lib/changeSymbolRun").then((m) => m.applyChange(ctx, plan, choices, o));
      if (r.guardFailed) return setMessage(`Undone by the text guard: ${r.guardFailed}`);
      if (r.cancelled) return setMessage("Cancelled: the document is as it was.");
      const what = [`${r.equations} equation(s)`, `${r.definitions} definition(s)`, r.list ? "the list of symbols" : "", r.rules ? `${r.rules} rule(s)` : "", r.blocks ? `${r.blocks} block(s)` : ""].filter(Boolean).join(", ");
      useApp.getState().notify(`${plan.target.latex} → ${plan.to.latex}: ${what}. One Ctrl+Z in Word undoes it all.${r.note ? ` ${r.note}` : ""}`);
      close();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Change symbol" onClose={close} width={900}>
      <div className="form change-symbol">
        <div className="row2">
          <label>
            <span>The symbol now</span>
            {req.from ? (
              <div className="block-preview" data-testid="cs-from">
                <MathPreview latex={from} />
              </div>
            ) : (
              <select value={from} onChange={(e) => setFrom(e.target.value)} data-testid="cs-from-select">
                <option value="">Choose a defined symbol…</option>
                {ctx?.doc.defs.map((d) => (
                  <option key={d.start} value={d.symbol}>
                    {d.symbol} — {d.meaning}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label>
            <span>The new symbol (type it as in the editor: \Omega, \pvec{"{"}\Omega{"}"}, u_0)</span>
            <MiniMathField value={to} onChange={setTo} label="New symbol" autoFocus />
            <input className="cs-latex" value={to} onChange={(e) => setTo(e.target.value)} spellCheck={false} placeholder="LaTeX of the new symbol" data-testid="cs-to" />
          </label>
        </div>
        <p className="hint" data-testid="cs-quantity">
          {quantity ? (
            <>
              The quantity: <b>{quantity.meaning}</b>
              {quantity.unit ? ` [${quantity.unit}]` : ""} — its meaning and unit stay; only its symbol changes.
            </>
          ) : fromOcc ? (
            "This symbol has no definition in the document: its equations change, there is nothing in the list."
          ) : (
            ""
          )}
        </p>
        {busy && !ctx && <p className="hint">Reading the document…</p>}
        {preview && "error" in preview && <p className="conv-msg">{preview.error}</p>}
        {plan && (
          <div className="cs-preview" data-testid="cs-preview">
            <p className="cs-counts" data-testid="cs-counts">
              {counted.eqs} equation(s) change ({plan.counts.inline} inline, {plan.counts.display} display, {plan.counts.numbered} numbered in all), {counted.occ} occurrence(s); {defsChanging} definition(s)
              {ctx && ctx.doc.listAt >= 0 ? "; the list of symbols is updated in place" : "; no list of symbols in the document yet"}. Numbers and references stay.
            </p>
            {clashes.length > 0 && (
              <div className="cs-clash" data-testid="cs-clash">
                <b>Already in the document:</b>
                {clashes.map((c) => (
                  <div key={c.key}>
                    <MathPreview latex={c.latex} /> used in {c.equations.length} equation(s){c.equations.length ? ` (${c.equations.map((e) => e.number ?? e.section ?? "inline").slice(0, 6).join(", ")})` : ""}
                    {c.definitions.map((d) => (
                      <div key={d.start} className="muted">
                        defined: “{d.meaning}”{d.unit ? ` [${d.unit}]` : ""}
                      </div>
                    ))}
                  </div>
                ))}
                {quantity && <div className="muted">and the quantity being changed: “{quantity.meaning}”{quantity.unit ? ` [${quantity.unit}]` : ""}</div>}
                <div className="radio-row">
                  <label className="check">
                    <input type="radio" checked={merge === "both"} onChange={() => setMerge("both")} /> Merge, keep both definitions
                  </label>
                  <label className="check">
                    <input type="radio" checked={merge === "existing"} onChange={() => setMerge("existing")} /> Merge, keep the existing definition
                  </label>
                  <label className="check">
                    <input type="radio" checked={merge === "changed"} onChange={() => setMerge("changed")} /> Merge, keep this quantity's definition
                  </label>
                </div>
              </div>
            )}
            {GROUPS.map((g) => {
              const eqs = plan.equations.filter((e) => e.occurrences.some((o) => o.cls === g.cls));
              if (!eqs.length) return null;
              return (
                <section key={g.cls} data-testid={`cs-group-${g.cls}`}>
                  <h4 className="style-section">
                    {g.title} ({eqs.reduce((n, e) => n + e.occurrences.filter((o) => o.cls === g.cls).length, 0)})
                  </h4>
                  {g.hint && <p className="hint">{g.hint}</p>}
                  <EquationList eqs={eqs} cls={g.cls} skip={skip} onToggle={(k, on) => setSkip(toggle(skip, k, on))} afterOf={afterOf} />
                </section>
              );
            })}
            {plan.related.length > 0 && (
              <section data-testid="cs-group-related">
                <h4 className="style-section">Related forms (same letter, other kinds)</h4>
                <label className="check">
                  <input type="checkbox" checked={plan.related.every((g) => related.has(g.key))} onChange={(e) => setRelated(e.target.checked ? new Set(plan.related.map((g) => g.key)) : new Set())} data-testid="cs-related-all" /> Include all
                </label>
                {plan.related.map((g) => (
                  <div key={g.key} className="cs-related">
                    <label className="check">
                      <input type="checkbox" checked={related.has(g.key)} onChange={(e) => setRelated(toggle(related, g.key, !e.target.checked))} />
                      <MathPreview latex={g.latex} /> → <MathPreview latex={g.after} /> <span className="muted">{g.count} occurrence(s){g.definition ? `; defined: “${g.definition.meaning}”${g.definition.unit ? ` [${g.definition.unit}]` : ""} (kept)` : ""}</span>
                    </label>
                    {related.has(g.key) && <EquationList eqs={plan.equations.filter((e) => e.occurrences.some((o) => o.relatedKey === g.key))} cls="related" relatedKey={g.key} skip={skip} onToggle={(k, on) => setSkip(toggle(skip, k, on))} afterOf={afterOf} />}
                  </div>
                ))}
                {relatedLeft > 0 && <p className="hint" data-testid="cs-related-left">{relatedLeft} related occurrence(s) left alone.</p>}
              </section>
            )}
            {plan.definitions.length > 0 && (
              <section data-testid="cs-definitions">
                <h4 className="style-section">Definitions (meaning and unit kept)</h4>
                {plan.definitions.map((d) => {
                  const off = d.cls === "related" && !(d.relatedKey && related.has(d.relatedKey));
                  return (
                    <label key={d.start} className="check">
                      <input type="checkbox" disabled={off} checked={!off && !skipDefs.has(d.start)} onChange={(e) => setSkipDefs((s) => { const n = new Set(s); if (e.target.checked) n.delete(d.start); else n.add(d.start); return n; })} />
                      <MathPreview latex={d.symbol} /> → <MathPreview latex={d.after} /> “{d.meaning}”{d.unit ? ` [${d.unit}]` : ""}
                    </label>
                  );
                })}
              </section>
            )}
            {preview && "mentions" in preview && preview.mentions.length > 0 && (
              <section data-testid="cs-mentions">
                <h4 className="style-section">In the text, not equations (not changed — fix them by hand)</h4>
                {preview.mentions.map((m) => (
                  <div key={`${m.start}`} className="cs-mention">
                    <span className="muted">…{m.context}…</span>{" "}
                    <button className="link-button" onClick={() => void connector.request("selectRange", { start: m.start, end: m.end }).catch(() => undefined)}>
                      Go to
                    </button>
                  </div>
                ))}
              </section>
            )}
            <label className="check">
              <input type="checkbox" checked={blocks} onChange={(e) => setBlocks(e.target.checked)} /> Also change this document's blocks that use it
            </label>
          </div>
        )}
        {message && <p className="conv-msg">{message}</p>}
        <div className="modal-actions">
          <button onClick={close}>Cancel</button>
          <button className="primary" onClick={() => void apply()} disabled={busy || !plan || needMerge || (counted.occ === 0 && defsChanging === 0)} data-testid="cs-apply" title={needMerge ? "The new symbol is already in the document: choose how to merge, or cancel" : "One Ctrl+Z in Word undoes it all"}>
            Change {counted.occ + defsChanging || ""}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Equations with occurrences of one group, by section: the equation before → after, a tick per occurrence. */
function EquationList({ eqs, cls, relatedKey, skip, onToggle, afterOf }: { eqs: PlannedEquation[]; cls: OccurrenceClass; relatedKey?: string; skip: Set<string>; onToggle: (key: string, on: boolean) => void; afterOf: (e: PlannedEquation) => string }) {
  const sections = new Map<string, PlannedEquation[]>();
  for (const e of eqs) {
    const k = e.section ?? "";
    sections.set(k, [...(sections.get(k) ?? []), e]);
  }
  const mine = (o: Occurrence) => o.cls === cls && (!relatedKey || o.relatedKey === relatedKey);
  return (
    <div className="cs-list">
      {[...sections].map(([section, list]) => (
        <div key={section}>
          {section && <div className="cs-section">{section}</div>}
          {list.map((e) => (
            <div key={e.tag} className="cs-eq" data-testid="cs-eq">
              <div className="cs-occ">
                {e.occurrences.filter(mine).map((o) => (
                  <label key={o.id} className="check" title={o.decoration ? `with its ${o.decoration} kept` : ""}>
                    <input type="checkbox" checked={!skip.has(occurrenceId(e.tag, o.id))} onChange={(ev) => onToggle(occurrenceId(e.tag, o.id), ev.target.checked)} />
                    <MathPreview latex={o.before} /> → <MathPreview latex={o.after} />
                  </label>
                ))}
              </div>
              <div className="cs-eq-draw">
                <MathPreview latex={e.latex} /> <span className="muted">→</span> <MathPreview latex={afterOf(e)} />
                <span className="muted"> {e.number ?? (e.display ? "display" : "inline")}</span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
