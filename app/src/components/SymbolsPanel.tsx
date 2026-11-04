import { useMemo, useState } from "react";
import { parseLatex } from "@mathblocks/math-latex";
import { MathPreview } from "./MathPreview";
import { askConfirm } from "./Dialogs";
import { useApp } from "../lib/store";
import { goToCopy } from "../lib/linking";
import { buildDocumentIndex, definitionStatus, dependencies, indexEquations, renameInDocument, type DefinitionStatus, type DocumentIndex, type IndexedEquation, type IndexedSymbol } from "../lib/symbolIndex";
import { renameInLatex } from "../lib/symbols";

/** Bottom panel tab: the symbols of the Word document (or of the current equation). */
export function SymbolsPanel() {
  const connected = useApp((s) => s.connector.connected);
  const latex = useApp((s) => s.latex);
  const [index, setIndex] = useState<DocumentIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | DefinitionStatus>("all");
  const editingTag = useApp((s) => s.editing?.tag ?? null);

  const local = useMemo(
    () => indexEquations([{ tag: "", page: 0, context: "", latex, display: true, blockId: null }]),
    [latex],
  );
  const symbols = index?.symbols ?? local;
  const status = useMemo(() => new Map(index ? index.symbols.map((s) => [s.key, definitionStatus(index, s)] as const) : []), [index]);
  const counts = useMemo(() => {
    const c = { defined: 0, undefined: 0, usedBefore: 0 };
    for (const v of status.values()) c[v]++;
    return c;
  }, [status]);
  const deps = useMemo(() => (index && editingTag ? dependencies(index, editingTag) : null), [index, editingTag]);
  const byQuery = query.trim() ? symbols.filter((s) => s.key.toLowerCase().includes(query.trim().toLowerCase())) : symbols;
  const shown = index && filter !== "all" ? byQuery.filter((s) => status.get(s.key) === filter) : byQuery;

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
          <button onClick={() => void import("./NomenclatureDialog").then((m) => m.openNomenclature())} title="Insert or update a list of symbols (nomenclature) in the Word document">
            List of symbols…
          </button>
        )}
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
      {index && (
        <div className="sym-filters">
          {(
            [
              ["all", `All ${index.symbols.length}`, "Every symbol"],
              ["usedBefore", `Used before defined ${counts.usedBefore}`, "Used in an equation that comes before the equation defining it"],
              ["undefined", `Not defined by an equation ${counts.undefined}`, "No equation of the form “symbol = …” (it may be defined in the text)"],
              ["defined", `Defined first ${counts.defined}`, "Defined by an equation before any use"],
            ] as const
          ).map(([k, label, title]) => (
            <button key={k} className={filter === k ? "chip on" : "chip"} onClick={() => setFilter(k)} title={title}>
              {label}
            </button>
          ))}
        </div>
      )}
      {index && deps?.equation && <Dependencies index={index} deps={deps} />}
      {shown.length === 0 && <p className="empty">No symbols{query ? ` matching “${query}”` : ""}.</p>}
      <ul className="sym-list">
        {shown.map((s) => (
          <SymbolRow key={s.key} s={s} index={index} status={status.get(s.key)} expanded={open === s.key} onToggle={() => setOpen(open === s.key ? null : s.key)} onRenamed={load} />
        ))}
      </ul>
    </div>
  );
}

const label = (e: IndexedEquation) => e.number ?? (e.page ? `p. ${e.page}` : "equation");

/** The equation being edited: which definitions it relies on, and which equations rely on it. */
function Dependencies({ index, deps }: { index: DocumentIndex; deps: ReturnType<typeof dependencies> }) {
  if (!deps.dependsOn.length && !deps.usedBy.length) return <p className="sym-deps muted">This equation neither uses nor provides a definition of another equation.</p>;
  return (
    <div className="sym-deps">
      {deps.dependsOn.length > 0 && (
        <div>
          <span className="muted">This equation uses</span>
          {deps.dependsOn.map((d) => (
            <button key={d.symbol} className="chip" onClick={() => void goToCopy(index.document, d.equation.tag)} title="Go to the definition">
              <MathPreview latex={d.symbol} /> from {label(d.equation)}
            </button>
          ))}
        </div>
      )}
      {deps.usedBy.length > 0 && (
        <div>
          <span className="muted">Its definition is used by</span>
          {deps.usedBy.map((e) => (
            <button key={e.tag} className="chip" onClick={() => void goToCopy(index.document, e.tag)} title="Go to it">
              {label(e)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SymbolRow({ s, index, status, expanded, onToggle, onRenamed }: { s: IndexedSymbol; index: DocumentIndex | null; status?: DefinitionStatus; expanded: boolean; onToggle: () => void; onRenamed: () => Promise<void> }) {
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
        {s.definedIn && index && <span className="sym-def">defined {s.definedIn.number ?? `p. ${s.definedIn.page || "?"}`}</span>}
        {status === "usedBefore" && <span className="sym-warn">used before its definition</span>}
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
                  {e.number && <span className="eq-number">{e.number}</span>}
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
