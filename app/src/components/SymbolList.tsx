import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { Modal, askConfirm } from "./Dialogs";
import { MathPreview } from "./MathPreview";
import { connector } from "../lib/connector";
import { useApp } from "../lib/store";
import { activeStyle, saveDocumentStyle } from "../lib/docStyle";
import { definitionSymbol, defineTag, DEFAULT_LIST_SETTINGS, listSettings, tableEntries, type DefineTag, type DefinitionIn, type ListCheck, type SymbolListSettings } from "../lib/symbolList";
import type { DocumentSymbols } from "../lib/symbolListRun";

/**
 * List of symbols (docs/SYMBOL-LIST.md): the document's definitions (\define markers), the checks, and the
 * table written or updated in one click; Define symbol…; the style page (Settings → List of symbols).
 */

const CHECK_LABEL: Record<ListCheck["kind"], string> = { undefined: "Used but not defined", unused: "Defined but not used", "two-meanings": "One symbol, two meanings", twice: "Defined more than once", "two-symbols": "One meaning, two symbols", late: "Defined after its first use" };

interface ListState {
  open: boolean;
  busy: boolean;
  doc: DocumentSymbols | null;
  checks: ListCheck[];
  message?: string;
  set: (s: Partial<Omit<ListState, "set">>) => void;
}
export const useSymbolList = create<ListState>((set) => ({ open: false, busy: false, doc: null, checks: [], set: (s) => set(s) }));

/** Opens the list of symbols (ribbon, Ctrl+K) and reads the document. */
export async function openSymbolList(message?: string) {
  const ui = useSymbolList.getState();
  ui.set({ open: true, busy: true, message });
  try {
    const { checkDocumentSymbols } = await import("../lib/symbolListRun");
    const r = await checkDocumentSymbols();
    ui.set({ busy: false, doc: r.doc, checks: r.checks });
  } catch (e) {
    ui.set({ busy: false, message: e instanceof Error ? e.message : String(e) });
  }
}

export function SymbolListDialog() {
  const s = useSymbolList();
  if (!s.open) return null;
  const close = () => s.set({ open: false });
  const run = async (what: () => Promise<string | void>) => {
    s.set({ busy: true, message: undefined });
    try {
      const msg = await what();
      await openSymbolList(msg ?? undefined);
    } catch (e) {
      s.set({ busy: false, message: e instanceof Error ? e.message : String(e) });
    }
  };
  const update = () =>
    run(async () => {
      const { updateSymbolList } = await import("../lib/symbolListRun");
      const r = await updateSymbolList();
      return `List of symbols ${r.replaced ? "updated" : "inserted at the cursor"}: ${r.rows} row(s). One Ctrl+Z in Word undoes it.`;
    });
  const remove = (d: DefinitionIn) =>
    run(async () => {
      if (!(await askConfirm("Delete definition", `Delete the definition of ${d.symbol} (“${d.meaning}”) from the document?`, "Delete", true))) return;
      await connector.request("updateDefinition", { start: d.start });
      return "Definition deleted (Ctrl+Z in Word restores it).";
    });
  const ignore = (c: ListCheck) =>
    run(async () => {
      const style = activeStyle();
      const st = listSettings(style.symbolList);
      await saveDocumentStyle({ ...style, symbolList: { ...st, ignore: [...new Set([...st.ignore, c.key])] } as unknown as Record<string, unknown> });
      return `${c.latex} is not asked for any more in this document.`;
    });
  const doc = s.doc;
  const style = activeStyle();
  const byKind = (k: ListCheck["kind"]) => s.checks.filter((c) => c.kind === k);
  return (
    <Modal title={`List of symbols${doc ? "" : ""}`} onClose={close} width={860}>
      <div className="form">
        <p className="hint">
          Define each symbol once, where you introduce it: <code>\define&#123;symbol&#125;&#123;meaning&#125;[unit]</code> in the text (Convert LaTeX keeps it as a hidden marker), or Define symbol… in the editor. The list is made from the definitions; the checks compare them with the equations.
        </p>
        {s.busy && !doc && <p className="hint">Reading the document…</p>}
        {doc && (
          <div style={{ maxHeight: 480, overflow: "auto", display: "grid", gap: 10 }}>
            <section>
              <h4 className="style-section">Definitions ({doc.defs.length})</h4>
              {doc.defs.length === 0 && <p className="hint">None yet.</p>}
              <table className="block-slots">
                <tbody>
                  {doc.defs.map((d) => (
                    <tr key={d.start}>
                      <td>
                        <MathPreview latex={d.symbol} />
                      </td>
                      <td>{d.meaning}</td>
                      <td>{d.unit ? `[${d.unit}]` : ""}</td>
                      <td className="muted">{d.page ? `p. ${d.page}` : ""}</td>
                      <td>
                        <button className="link-button" onClick={() => openDefineSymbol({ symbol: d.symbol, meaning: d.meaning, unit: d.unit, editStart: d.start })} disabled={s.busy}>
                          Edit
                        </button>{" "}
                        <button className="link-button" onClick={() => void remove(d)} disabled={s.busy}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {doc.unreadable.length > 0 && <p className="conv-msg">{doc.unreadable.length} definition marker(s) could not be read: {doc.unreadable.map((u) => u.tag).join("; ")}</p>}
            </section>
            <section>
              <h4 className="style-section">Checks ({s.checks.length})</h4>
              {s.checks.length === 0 && <p className="hint">{doc.defs.length ? "Every symbol used is defined, once, with one meaning." : ""}</p>}
              {(Object.keys(CHECK_LABEL) as ListCheck["kind"][]).map((k) =>
                byKind(k).length ? (
                  <div key={k}>
                    <strong>{CHECK_LABEL[k]}</strong>
                    {byKind(k).map((c) => (
                      <div key={`${k}-${c.key}`} className="symbol-rule">
                        {k !== "two-symbols" && <MathPreview latex={c.latex} />}
                        <span style={{ flex: 1 }}>
                          {k === "two-symbols" ? c.message : ""}
                          {c.equation ? <span className="hint"> in an equation{c.equation.page ? ` on p. ${c.equation.page}` : ""}{c.equation.context ? ` — ${c.equation.context}` : ""}</span> : null}
                          {c.definitions && k !== "two-symbols" ? <span className="hint"> {c.definitions.map((d) => `“${d.meaning}”${d.page ? ` (p. ${d.page})` : ""}`).join(", ")}</span> : null}
                        </span>
                        {k === "undefined" && (
                          <button className="link-button" onClick={() => openDefineSymbol({ symbol: c.latex, equationTag: c.equation?.tag })} disabled={s.busy}>
                            Define…
                          </button>
                        )}
                        {c.equation?.tag && (
                          <button className="link-button" onClick={() => void connector.request("selectInstance", { tag: c.equation!.tag! }).catch(() => undefined)} disabled={s.busy}>
                            Go to
                          </button>
                        )}
                        {k === "undefined" && (
                          <button className="link-button" onClick={() => void ignore(c)} disabled={s.busy} title="A dummy index or a symbol you do not want listed">
                            Ignore
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null,
              )}
            </section>
            <section>
              <h4 className="style-section">Preview</h4>
              <ListPreview defs={doc.defs} doc={doc} settings={listSettings(style.symbolList)} />
            </section>
          </div>
        )}
        {s.message && <p>{s.message}</p>}
        <div className="modal-actions" style={{ flexWrap: "wrap" }}>
          <button onClick={() => void openSymbolList()} disabled={s.busy}>
            Refresh
          </button>
          <button onClick={() => openDefineSymbol({ symbol: "" })} disabled={s.busy}>
            Define symbol…
          </button>
          <button onClick={() => void import("../lib/settingsStore").then((m) => m.openSettings("symbollist"))}>Style…</button>
          <button onClick={() => void import("./NomenclatureDialog").then((m) => m.openNomenclature())} title="The earlier list made from the equations, with descriptions typed in the table">
            Older list…
          </button>
          <div className="spacer" />
          <button onClick={close}>Close</button>
          <button className="primary" onClick={() => void update()} disabled={s.busy || !doc?.defs.length}>
            {doc && doc.listAt >= 0 ? "Update the list" : "Insert the list at the cursor"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** The table as it will be written (drawn by math-render in the document style). */
function ListPreview({ defs, doc, settings }: { defs: DefinitionIn[]; doc: Pick<DocumentSymbols, "eqs"> | null; settings: SymbolListSettings }) {
  const style = activeStyle();
  const rows = useMemo(() => tableEntries(defs, doc?.eqs ?? [], style, settings), [defs, doc, settings, style]);
  if (!rows.length) return <p className="hint">No definitions to list.</p>;
  return (
    <table className="block-slots symbol-list-preview">
      <thead>
        <tr>
          {settings.columns.map((c) => (
            <th key={c}>{settings.columnTitles[c]}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) =>
          "heading" in r ? (
            <tr key={i}>
              <td colSpan={settings.columns.length}>
                <strong>{r.heading}</strong>
              </td>
            </tr>
          ) : (
            <tr key={i}>
              {settings.columns.map((c) => (
                <td key={c}>
                  {c === "symbol" ? <MathPreview latex={r.def.symbol} /> : c === "meaning" ? r.def.meaning : c === "unit" ? (r.def.unit ? (r.def.unit === "-" ? "–" : settings.unitFormat === "brackets" ? `[${r.def.unit}]` : r.def.unit) : "") : (r.first ?? "")}
                </td>
              ))}
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

// ------------------------------------------------------------------ Define symbol…

export type DefineReqPayload = DefineReq;
interface DefineReq extends Partial<DefineTag> {
  symbol: string;
  /** Editing the definition at this position. */
  editStart?: number;
  /** The equation being edited (the definition goes after its paragraph). */
  equationTag?: string;
}
export const useDefineSymbol = create<{ req: DefineReq | null; set: (r: DefineReq | null) => void }>((set) => ({ req: null, set: (req) => set({ req }) }));

/** Define symbol… (editor, floating editor, the list's checks). From the floating editor, the dialog opens in the main window. */
export function openDefineSymbol(req: DefineReq) {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("panel-window")) {
    void import("@tauri-apps/api/event").then((m) => m.emitTo("main", "panel:defineSymbol", req)).catch(() => undefined);
    return;
  }
  useDefineSymbol.getState().set({ ...req, equationTag: req.equationTag ?? useApp.getState().editing?.tag });
}

export function DefineSymbolDialog() {
  const req = useDefineSymbol((x) => x.req);
  const set = useDefineSymbol((x) => x.set);
  const [symbol, setSymbol] = useState("");
  const [meaning, setMeaning] = useState("");
  const [unit, setUnit] = useState("");
  const [where, setWhere] = useState<"afterEquation" | "cursor">("cursor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [existing, setExisting] = useState<DefinitionIn | null>(null);
  useEffect(() => {
    if (!req) return;
    setSymbol(req.symbol);
    setMeaning(req.meaning ?? "");
    setUnit(req.unit ?? "");
    setWhere(req.equationTag ? "afterEquation" : "cursor");
    setError("");
    setExisting(null);
  }, [req]);
  // An existing definition of the same symbol: shown, to edit instead of adding a second one.
  useEffect(() => {
    if (!req || req.editStart !== undefined || !symbol.trim()) return;
    const t = setTimeout(async () => {
      const doc = useSymbolList.getState().doc ?? (await import("../lib/symbolListRun").then((m) => m.readDocumentSymbols()).catch(() => null));
      if (!doc) return;
      const key = definitionSymbol(symbol, activeStyle())?.key;
      setExisting(key ? (doc.defs.find((d) => definitionSymbol(d.symbol, activeStyle())?.key === key) ?? null) : null);
    }, 400);
    return () => clearTimeout(t);
  }, [symbol, req]);
  if (!req) return null;
  const close = () => set(null);
  const occ = symbol.trim() ? definitionSymbol(symbol, activeStyle()) : null;
  const save = async () => {
    if (!occ) return setError("Type one symbol (as in an equation: m, v_0, \\pvec{\\omega}, {}_{max}, \\text{RMS}).");
    if (!meaning.trim()) return setError("The meaning is needed.");
    setBusy(true);
    try {
      const tag = defineTag({ symbol: symbol.trim(), meaning: meaning.trim(), ...(unit.trim() ? { unit: unit.trim() } : {}) });
      if (req.editStart !== undefined) await connector.request("updateDefinition", { start: req.editStart, tag });
      else await connector.request("insertDefinition", { tag, where, ...(where === "afterEquation" && req.equationTag ? { equation: req.equationTag } : {}) });
      useApp.getState().notify(`${symbol.trim()} defined (a hidden marker in the document; one Ctrl+Z in Word removes it).`);
      close();
      if (useSymbolList.getState().open) await openSymbolList();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={req.editStart !== undefined ? "Edit symbol definition" : "Define symbol"} onClose={close} width={620}>
      <div className="form">
        <div className="row2">
          <label>
            <span>Symbol (as in an equation)</span>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} spellCheck={false} autoFocus={!req.symbol} placeholder="m, v_0, \pvec{\omega}, {}_{max}" />
          </label>
          <div className="block-preview">{occ ? <MathPreview latex={symbol} /> : <span className="muted">Preview</span>}</div>
        </div>
        <label>
          <span>Meaning (plain text; inline math in $…$)</span>
          <input value={meaning} onChange={(e) => setMeaning(e.target.value)} autoFocus={!!req.symbol} />
        </label>
        <label>
          <span>Unit (optional; − for dimensionless)</span>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} spellCheck={false} placeholder="m/s, kg\,m^2, -" />
        </label>
        {req.editStart === undefined && (
          <div className="radio-row">
            <label className="check">
              <input type="radio" checked={where === "afterEquation"} disabled={!req.equationTag} onChange={() => setWhere("afterEquation")} /> After the paragraph of the equation being edited
            </label>
            <label className="check">
              <input type="radio" checked={where === "cursor"} onChange={() => setWhere("cursor")} /> At Word's cursor
            </label>
          </div>
        )}
        {existing && (
          <p className="conv-msg">
            Already defined: “{existing.meaning}”{existing.unit ? ` [${existing.unit}]` : ""}{existing.page ? ` (p. ${existing.page})` : ""}.{" "}
            <button className="link-button" onClick={() => set({ symbol: existing.symbol, meaning: existing.meaning, unit: existing.unit, editStart: existing.start })}>
              Edit that one instead
            </button>
          </p>
        )}
        {error && <p className="conv-msg">{error}</p>}
        <div className="modal-actions">
          <button onClick={close}>Cancel</button>
          <button className="primary" onClick={() => void save()} disabled={busy || !useApp.getState().connector.connected}>
            {req.editStart !== undefined ? "Save" : "Define"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Settings → List of symbols

const GROUP_LABEL: Record<string, string> = { latin: "Latin", greek: "Greek", subscripts: "Subscripts", superscripts: "Superscripts", abbreviations: "Abbreviations" };

/** The style of the list (saved in the document style), with a live preview on sample definitions. */
export function SymbolListPage() {
  const [st, setSt] = useState<SymbolListSettings>(() => listSettings(activeStyle().symbolList));
  const [msg, setMsg] = useState("");
  const up = (p: Partial<SymbolListSettings>) => setSt({ ...st, ...p });
  const sample: DefinitionIn[] = useMemo(
    () => [
      { symbol: "a", meaning: "acceleration", unit: "m/s^2" },
      { symbol: "A", meaning: "area", unit: "m^2" },
      { symbol: "\\pvec{\\omega}", meaning: "angular velocity", unit: "rad/s" },
      { symbol: "\\alpha", meaning: "angle", unit: "rad" },
      { symbol: "m", meaning: "mass", unit: "kg" },
      { symbol: "v_0", meaning: "initial speed", unit: "m/s" },
      { symbol: "{}_{max}", meaning: "maximum" },
      { symbol: "\\text{RMS}", meaning: "root mean square" },
    ].map((d, i) => ({ ...d, start: i, equationsBefore: 0, page: 1 + i })),
    [],
  );
  const save = async () => {
    try {
      const style = activeStyle();
      const next = { ...style, symbolList: st as unknown as Record<string, unknown> };
      if (useApp.getState().connector.connected) {
        await saveDocumentStyle(next);
        setMsg("Saved in the document style (Update the list to apply it to the table).");
      } else {
        useApp.getState().setPrefs({ defaultStyle: next });
        setMsg("Word is not connected: saved as your default for new documents.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };
  const toggleCol = (c: SymbolListSettings["columns"][number]) => up({ columns: st.columns.includes(c) ? st.columns.filter((x) => x !== c) : ["symbol", "meaning", "unit", "first"].filter((x) => x === c || st.columns.includes(x as typeof c)) as SymbolListSettings["columns"] });
  return (
    <div className="form">
      <p className="hint">How the list of symbols is sorted, grouped and laid out in this document (saved in the document style).</p>
      <div className="row2">
        <label>
          <span>Sort</span>
          <select value={st.sort} onChange={(e) => up({ sort: e.target.value as SymbolListSettings["sort"] })}>
            <option value="alphabet">Latin, Greek, then sub- and superscripts</option>
            <option value="name">Alphabetical by the letter's name (α with a)</option>
          </select>
        </label>
        <label>
          <span>Within an alphabet</span>
          <select value={st.caseOrder} onChange={(e) => up({ caseOrder: e.target.value as SymbolListSettings["caseOrder"] })}>
            <option value="mixed">a A b B …</option>
            <option value="upper-first">A … Z, then a … z</option>
          </select>
        </label>
      </div>
      <div className="row2">
        <label>
          <span>Groups</span>
          <select value={st.grouping} onChange={(e) => up({ grouping: e.target.value as SymbolListSettings["grouping"] })}>
            <option value="none">None</option>
            <option value="groups">Latin / Greek / subscripts / superscripts / abbreviations</option>
            <option value="kind">By kind (scalars, vectors, matrices…)</option>
          </select>
        </label>
        <label>
          <span>Unit</span>
          <select value={st.unitFormat} onChange={(e) => up({ unitFormat: e.target.value as SymbolListSettings["unitFormat"] })}>
            <option value="brackets">[m/s]</option>
            <option value="plain">m/s</option>
          </select>
        </label>
      </div>
      {st.grouping === "groups" && (
        <div className="radio-row">
          {(Object.keys(GROUP_LABEL) as (keyof typeof GROUP_LABEL)[]).map((g) => (
            <label key={g} className="check">
              <input type="checkbox" checked={st.groups.includes(g as SymbolListSettings["groups"][number])} onChange={(e) => up({ groups: e.target.checked ? [...st.groups, g as SymbolListSettings["groups"][number]] : st.groups.filter((x) => x !== g) })} /> {GROUP_LABEL[g]}
              <input style={{ width: 130 }} value={st.headings[g as SymbolListSettings["groups"][number]] ?? ""} onChange={(e) => up({ headings: { ...st.headings, [g]: e.target.value } })} title="Heading in the table" />
            </label>
          ))}
        </div>
      )}
      <div className="radio-row">
        <span>Columns:</span>
        {(["symbol", "meaning", "unit", "first"] as const).map((c) => (
          <label key={c} className="check">
            <input type="checkbox" checked={st.columns.includes(c)} disabled={c === "symbol" || c === "meaning"} onChange={() => toggleCol(c)} />
            <input style={{ width: 110 }} value={st.columnTitles[c]} onChange={(e) => up({ columnTitles: { ...st.columnTitles, [c]: e.target.value } })} />
          </label>
        ))}
        {st.columns.includes("first") && (
          <select value={st.first} onChange={(e) => up({ first: e.target.value as SymbolListSettings["first"] })}>
            <option value="number">equation number (else page)</option>
            <option value="page">page</option>
          </select>
        )}
      </div>
      <div className="row2">
        <label>
          <span>Word table style (empty: Word's default)</span>
          <input value={st.tableStyle} onChange={(e) => up({ tableStyle: e.target.value })} placeholder="e.g. Table Grid" />
        </label>
        <label className="check">
          <input type="checkbox" checked={st.repeatHeader} onChange={(e) => up({ repeatHeader: e.target.checked })} /> Repeat the heading row on each page
        </label>
      </div>
      <h4 className="style-section">Preview</h4>
      <ListPreview defs={sample} doc={null} settings={st} />
      {msg && <p>{msg}</p>}
      <div className="modal-actions">
        <button onClick={() => setSt({ ...DEFAULT_LIST_SETTINGS })}>Defaults</button>
        <div className="spacer" />
        <button className="primary" onClick={() => void save()}>
          Save
        </button>
      </div>
    </div>
  );
}
