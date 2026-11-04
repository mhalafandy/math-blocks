import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { Modal } from "./Dialogs";
import { MathPreview } from "./MathPreview";
import { connector } from "../lib/connector";
import { currentProfile } from "../lib/equation";
import { buildDocumentIndex, type DocumentIndex } from "../lib/symbolIndex";
import { buildNomenclaturePackage, loadExcluded, nomenclatureEntries, NOMENCLATURE_TAG, parseNomenclature, saveExcluded, type KeptDescription } from "../lib/nomenclature";
import { useApp } from "../lib/store";

/**
 * List of symbols (nomenclature): generated from the document's equations, inserted at the
 * cursor as a table, and regenerated in place later. Descriptions can be typed here or in Word;
 * both are kept when the list is updated.
 */
export const useNomenclature = create<{ open: boolean; set: (o: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));
export const openNomenclature = () => useNomenclature.getState().set(true);

const WHERE_PREF = "mathblocks.nomenclature.showWhere";

export function NomenclatureDialog() {
  const open = useNomenclature((s) => s.open);
  const setOpen = useNomenclature((s) => s.set);
  const connected = useApp((s) => s.connector.connected);
  const [index, setIndex] = useState<DocumentIndex | null>(null);
  const [kept, setKept] = useState<Map<string, KeptDescription>>(new Map());
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [showWhere, setShowWhere] = useState(() => {
    try {
      return localStorage.getItem(WHERE_PREF) !== "0";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!open || !connected) return;
    setIndex(null);
    setEdits({});
    setLoading(true);
    (async () => {
      const idx = await buildDocumentIndex();
      setIndex(idx);
      setExcluded(loadExcluded(idx.document));
      try {
        const r = await connector.request("readEquation", { tag: NOMENCLATURE_TAG });
        setKept(parseNomenclature(r.flatOpc));
        setExists(true);
      } catch {
        setKept(new Map());
        setExists(false);
      }
    })()
      .catch((e: unknown) => useApp.getState().notify(e instanceof Error ? e.message : String(e), "error"))
      .finally(() => setLoading(false));
  }, [open, connected]);

  const entries = useMemo(() => (index ? nomenclatureEntries(index) : []), [index]);
  const shown = query.trim() ? entries.filter((e) => e.key.toLowerCase().includes(query.trim().toLowerCase()) || (edits[e.key] ?? kept.get(e.key)?.text ?? "").toLowerCase().includes(query.trim().toLowerCase())) : entries;
  const included = entries.filter((e) => !excluded.has(e.key));
  const described = included.filter((e) => (edits[e.key] ?? kept.get(e.key)?.text ?? "").trim()).length;

  if (!open) return null;
  const close = () => setOpen(false);

  const run = async () => {
    if (!index) return;
    const notify = useApp.getState().notify;
    setBusy(true);
    try {
      const descriptions = new Map<string, KeptDescription>();
      for (const e of included) {
        const k = kept.get(e.key);
        const edit = edits[e.key];
        if (edit !== undefined && edit !== (k?.text ?? "")) descriptions.set(e.key, { text: edit });
        else if (k) descriptions.set(e.key, k);
      }
      const app = useApp.getState();
      const pkg = await buildNomenclaturePackage(included, descriptions, { look: app.look, profile: currentProfile(), sizePt: app.equationSizePt, showWhere });
      if (exists) await connector.request("replaceEquation", { tag: NOMENCLATURE_TAG, flatOpc: pkg, undoLabel: "Update list of symbols" }, 120_000);
      else await connector.request("insertEquation", { tag: NOMENCLATURE_TAG, flatOpc: pkg, display: true, undoLabel: "Insert list of symbols" }, 120_000);
      saveExcluded(index.document, excluded);
      notify(`${exists ? "Updated" : "Inserted"} the list of symbols: ${included.length} symbols${included.length - described ? `, ${included.length - described} still without a description` : ""}. One Ctrl+Z in Word undoes it.`);
      close();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: string, on: boolean) => {
    const next = new Set(excluded);
    if (on) next.delete(key);
    else next.add(key);
    setExcluded(next);
  };

  return (
    <Modal title={index ? `List of symbols — “${index.name}”` : "List of symbols"} onClose={close} width={820}>
      <div className="form nomenclature">
        {!connected && <p className="empty">Start Word with your document open: the list is made from its equations.</p>}
        {loading && <p className="empty">Reading the document…</p>}
        {index && !loading && (
          <>
            <p className="hint">
              {exists ? "The document already has a list: it will be regenerated in place. " : "The list is inserted as a table at Word's cursor. "}
              Descriptions can be typed here or later in Word (they are kept when you update the list). Untick symbols that should not be listed (indices, dummy variables).
            </p>
            <div className="nom-tools">
              <input className="pal-search" type="search" placeholder="Filter…" value={query} onChange={(e) => setQuery(e.target.value)} />
              <button className="ghost" onClick={() => setExcluded(new Set())}>
                Tick all
              </button>
              <button className="ghost" onClick={() => setExcluded(new Set(entries.filter((e) => e.count === 1).map((e) => e.key)))} title="Untick symbols that appear only once">
                Untick single uses
              </button>
              <div className="spacer" />
              <label className="check">
                <input
                  type="checkbox"
                  checked={showWhere}
                  onChange={(e) => {
                    setShowWhere(e.target.checked);
                    try {
                      localStorage.setItem(WHERE_PREF, e.target.checked ? "1" : "0");
                    } catch {
                      /* convenience */
                    }
                  }}
                />
                “First appears” column
              </label>
            </div>
            {entries.length === 0 && <p className="empty">No symbols in this document's MathBlocks equations.</p>}
            <div className="nom-list">
              {shown.map((e, i) => {
                const prev = shown[i - 1];
                return (
                  <div key={e.key}>
                    {(!prev || prev.group !== e.group) && <div className="nom-group muted">{e.group} symbols</div>}
                    <div className={excluded.has(e.key) ? "nom-row off" : "nom-row"}>
                      <input type="checkbox" checked={!excluded.has(e.key)} onChange={(ev) => toggle(e.key, ev.target.checked)} />
                      <span className="nom-sym">
                        <MathPreview latex={e.key} />
                      </span>
                      <input
                        className="nom-desc"
                        value={edits[e.key] ?? kept.get(e.key)?.text ?? ""}
                        onChange={(ev) => setEdits({ ...edits, [e.key]: ev.target.value })}
                        placeholder="Description, e.g. position of the spacecraft"
                        disabled={excluded.has(e.key)}
                      />
                      <span className="muted nom-where" title={`${e.count} use(s)`}>
                        {e.where}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <div className="modal-actions">
          {index && (
            <span className="muted">
              {included.length} listed · {described} described
            </span>
          )}
          <div className="spacer" />
          <button onClick={close}>Cancel</button>
          <button className="primary" disabled={!index || !included.length || busy} onClick={() => void run()}>
            {busy ? "Working…" : exists ? "Update list in Word" : "Insert at cursor"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
