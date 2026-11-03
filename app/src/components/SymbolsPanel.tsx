import { useMemo, useState } from "react";
import { parseLatex } from "@mathblocks/math-latex";
import { MathPreview } from "./MathPreview";
import { askConfirm } from "./Dialogs";
import { useApp } from "../lib/store";
import { goToCopy } from "../lib/linking";
import { buildDocumentIndex, indexEquations, renameInDocument, type DocumentIndex, type IndexedSymbol } from "../lib/symbolIndex";
import { renameInLatex } from "../lib/symbols";

/** Bottom panel tab: the symbols of the Word document (or of the current equation). */
export function SymbolsPanel() {
  const connected = useApp((s) => s.connector.connected);
  const latex = useApp((s) => s.latex);
  const [index, setIndex] = useState<DocumentIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const local = useMemo(
    () => indexEquations([{ tag: "", page: 0, context: "", latex, display: true, blockId: null }]),
    [latex],
  );
  const symbols = index?.symbols ?? local;
  const shown = query.trim() ? symbols.filter((s) => s.key.toLowerCase().includes(query.trim().toLowerCase())) : symbols;

  const load = async () => {
    setLoading(true);
    try {
      setIndex(await buildDocumentIndex());
    } catch (e) {
      useApp.getState().notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="symbols-panel">
      <div className="sym-head">
        {index ? (
          <span>
            <strong>{index.name}</strong>: {index.symbols.length} symbols in {index.equations.length} MathBlocks equations
          </span>
        ) : (
          <span className="muted">Symbols of the current equation{connected ? "" : " (start Word to index a whole document)"}</span>
        )}
        <div className="spacer" />
        <input className="pal-search sym-search" type="search" placeholder="Filter symbols…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button onClick={() => void import("./NotationDialog").then((m) => m.openNotation())} title="Change how vectors, dyadics, unit vectors… are written, everywhere at once">
          Change notation…
        </button>
        {connected && (
          <button onClick={() => void load()} disabled={loading} title="Read every MathBlocks equation of the active Word document">
            {loading ? "Reading…" : index ? "Refresh" : "Index Word document"}
          </button>
        )}
        {index && (
          <button className="ghost" onClick={() => setIndex(null)} title="Back to the current equation">
            ✕
          </button>
        )}
      </div>
      {shown.length === 0 && <p className="empty">No symbols{query ? ` matching “${query}”` : ""}.</p>}
      <ul className="sym-list">
        {shown.map((s) => (
          <SymbolRow key={s.key} s={s} index={index} expanded={open === s.key} onToggle={() => setOpen(open === s.key ? null : s.key)} onRenamed={load} />
        ))}
      </ul>
    </div>
  );
}

function SymbolRow({ s, index, expanded, onToggle, onRenamed }: { s: IndexedSymbol; index: DocumentIndex | null; expanded: boolean; onToggle: () => void; onRenamed: () => Promise<void> }) {
  const [to, setTo] = useState("");
  const valid = !!to.trim() && !parseLatex(to).diagnostics.some((d) => d.severity === "error");
  const renameCurrent = () => {
    const app = useApp.getState();
    app.setLatex(renameInLatex(app.latex, { [s.key]: to }), "external");
    setTo("");
  };
  const renameDocument = async () => {
    if (!index) return;
    const linked = s.equations.filter((e) => e.blockId).length;
    const ok = await askConfirm(
      `Rename ${s.key}`,
      `Replace ${s.key} by ${to} in ${s.equations.length} equation(s) of “${index.name}”${linked ? ` (${linked} linked: their library equations get a new version, so all their copies follow)` : ""}? One Ctrl+Z in Word undoes the document part.`,
      "Rename",
      false,
    );
    if (!ok) return;
    try {
      const r = await renameInDocument(index, s.key, to);
      useApp.getState().notify(`Renamed in ${r.equations} equation(s)${r.libraryEquations ? ` and ${r.libraryEquations} library equation(s)` : ""}`);
      setTo("");
      await onRenamed();
    } catch (e) {
      useApp.getState().notify(e instanceof Error ? e.message : String(e), "error");
    }
  };
  return (
    <li className={expanded ? "sym-row open" : "sym-row"}>
      <button className="sym-summary" onClick={onToggle}>
        <span className="sym-key">
          <MathPreview latex={s.key} />
        </span>
        <span className="muted">
          {s.count}× {index ? `in ${s.equations.length} equation${s.equations.length > 1 ? "s" : ""}` : ""}
        </span>
        {s.definedIn && index && <span className="sym-def">defined p. {s.definedIn.page || "?"}</span>}
      </button>
      {expanded && (
        <div className="sym-detail">
          <div className="sym-rename">
            <span>Rename to</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="LaTeX, e.g. u_1" spellCheck={false} />
            {to.trim() && valid && <MathPreview latex={to} />}
            {index ? (
              <button className="primary" disabled={!valid} onClick={() => void renameDocument()}>
                Rename everywhere
              </button>
            ) : (
              <button className="primary" disabled={!valid} onClick={renameCurrent}>
                Rename
              </button>
            )}
          </div>
          {index && (
            <ul className="sym-uses">
              {s.equations.map((e) => (
                <li key={e.tag}>
                  <span className="muted">p. {e.page || "?"}</span>
                  <span className="sym-eq">
                    <MathPreview latex={e.latex} />
                  </span>
                  {s.definedIn === e && <span className="sym-def">definition</span>}
                  {e.blockId && <span className="tag">linked</span>}
                  <button onClick={() => void goToCopy(index.document, e.tag)}>Go to</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
