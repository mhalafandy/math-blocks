import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { Modal } from "./Dialogs";
import { MathPreview } from "./MathPreview";
import { CATALOG, changeForm, changeTranspose, findForms, findInconsistencies, findStyleMixes, formLabel, formLatex, templateOf, transposeForms, TRANSPOSE_STYLE_LABEL, type FormUse, type Inconsistency, type TransposeStyle } from "../lib/notation";
import { buildDocumentIndex, rewriteDocument, type DocumentIndex } from "../lib/symbolIndex";
import { useApp } from "../lib/store";

/**
 * "Change notation across the document": e.g. every vector written with an arrow becomes bold
 * with a harpoon, every dyadic with a double bar gets a double arrow. One undo step in Word.
 */
export const useNotation = create<{ open: boolean; set: (open: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));
export const openNotation = () => useNotation.getState().set(true);

const GREEK_CMD = /^\\(alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)$/;

export function NotationDialog() {
  const open = useNotation((s) => s.open);
  const setOpen = useNotation((s) => s.set);
  const connected = useApp((s) => s.connector.connected);
  const [index, setIndex] = useState<DocumentIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string>(CATALOG[0]!.template);
  const [letters, setLetters] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIndex(null);
    setFrom(null);
    if (!connected) return;
    setLoading(true);
    buildDocumentIndex()
      .then(setIndex)
      .catch((e: unknown) => useApp.getState().notify(e instanceof Error ? e.message : String(e), "error"))
      .finally(() => setLoading(false));
  }, [open, connected]);

  const latexes = useMemo(() => (index ? index.equations.map((e) => e.latex) : [useApp.getState().latex]), [index, open]);
  const forms = useMemo(() => findForms(latexes), [latexes]);
  const inconsistent = useMemo(() => findInconsistencies(latexes), [latexes]);
  const mixes = useMemo(() => findStyleMixes(latexes).filter((m) => m.what !== "Transpose"), [latexes]);
  const transposes = useMemo(() => [...transposeForms(latexes)], [latexes]);
  const prefTranspose = useApp((s) => s.transposeForm);
  const [tTo, setTTo] = useState<Exclude<TransposeStyle, "sans">>(prefTranspose);
  const current: FormUse | undefined = forms.find((f) => f.key === from) ?? forms[0];
  useEffect(() => {
    if (current && current.key !== from) {
      setFrom(current.key);
      setLetters(new Set(current.letters.keys()));
    }
  }, [current, from]);

  const sample = current ? [...current.letters.keys()][0] ?? "r" : "r";
  const example = useMemo(() => {
    if (!current) return null;
    const before = latexes.find((l) => changeForm(l, current.key, to, letters) !== l);
    return before ? { before, after: changeForm(before, current.key, to, letters) } : null;
  }, [latexes, current, to, letters]);
  const affected = useMemo(() => (current ? latexes.filter((l) => changeForm(l, current.key, to, letters) !== l).length : 0), [latexes, current, to, letters]);

  if (!open) return null;
  const close = () => setOpen(false);

  const apply = async () => {
    if (!current) return;
    const transform = (l: string) => changeForm(l, current.key, to, letters);
    const notify = useApp.getState().notify;
    setBusy(true);
    try {
      if (index) {
        const r = await rewriteDocument(index, index.equations, transform, "Change notation");
        notify(`Changed the notation in ${r.equations} equation(s)${r.libraryEquations ? ` and ${r.libraryEquations} library equation(s)` : ""}. One Ctrl+Z in Word undoes it.`);
      } else {
        const app = useApp.getState();
        app.setLatex(transform(app.latex), "external");
        notify("Notation changed in the current equation");
      }
      close();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  /** One letter, all its forms → the most used one. */
  const fixLetter = async (inc: Inconsistency) => {
    const target = templateOf(inc.forms[0]!.key);
    if (!target) return;
    const only = new Set([inc.letter]);
    const transform = (l: string) => inc.forms.slice(1).reduce((acc, f) => changeForm(acc, f.key, target, only), l);
    const notify = useApp.getState().notify;
    setBusy(true);
    try {
      if (index) {
        const r = await rewriteDocument(index, index.equations, transform, `Consistent ${inc.letter}`);
        notify(`${inc.letter} is now written one way in ${r.equations} equation(s)${r.libraryEquations ? ` and ${r.libraryEquations} library equation(s)` : ""}`);
        setIndex(await buildDocumentIndex());
      } else {
        const app = useApp.getState();
        app.setLatex(transform(app.latex), "external");
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  /** Every transpose in one form (one undo step). */
  const fixTranspose = async () => {
    const transform = (l: string) => changeTranspose(l, tTo);
    const notify = useApp.getState().notify;
    setBusy(true);
    try {
      if (index) {
        const r = await rewriteDocument(index, index.equations, transform, "Transpose form");
        notify(`Transposes written as ${TRANSPOSE_STYLE_LABEL[tTo]} in ${r.equations} equation(s)${r.libraryEquations ? ` and ${r.libraryEquations} library equation(s)` : ""}`);
        setIndex(await buildDocumentIndex());
      } else {
        const app = useApp.getState();
        app.setLatex(transform(app.latex), "external");
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const groups = [...new Set(CATALOG.map((f) => f.group))];
  return (
    <Modal title={index ? `Change notation in “${index.name}”` : "Change notation"} onClose={close} width={760}>
      <div className="form notation">
        {loading && <p className="empty">Reading the document…</p>}
        {!loading && forms.length === 0 && (
          <p className="empty">{index ? "No vectors, dyadics or other decorated symbols found in this document's MathBlocks equations." : "The current equation has no decorated symbols. Start Word to change a whole document."}</p>
        )}
        {!loading && inconsistent.length > 0 && (
          <div className="notation-inconsistent">
            <h4>Written in more than one way</h4>
            {inconsistent.map((inc) => {
              const target = templateOf(inc.forms[0]!.key);
              return (
                <div key={inc.letter} className="notation-inc-row">
                  {inc.forms.map((f) => (
                    <span key={f.key} className="notation-inc-form">
                      <MathPreview latex={templateOf(f.key) ? formLatex(templateOf(f.key)!, inc.letter, GREEK_CMD.test(inc.letter)) : inc.letter} />
                      <span className="muted">
                        {formLabel(f.key)} ×{f.count}
                      </span>
                    </span>
                  ))}
                  <div className="spacer" />
                  {target && (
                    <button disabled={busy} onClick={() => void fixLetter(inc)} title={`Write every ${inc.letter} as ${formLabel(inc.forms[0]!.key)}`}>
                      Make all {formLabel(inc.forms[0]!.key).toLowerCase()}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!loading && transposes.length > 0 && (
          <div className="notation-inconsistent">
            <h4>Transpose</h4>
            <div className="notation-inc-row">
              <span>{transposes.map(([st, n]) => `${TRANSPOSE_STYLE_LABEL[st]} ×${n}`).join(" · ")}</span>
              <div className="spacer" />
              <span className="muted">write all as</span>
              <select value={tTo} onChange={(e) => setTTo(e.target.value as typeof tTo)}>
                {(["upright", "bold", "italic", "top"] as const).map((k) => (
                  <option key={k} value={k}>
                    {TRANSPOSE_STYLE_LABEL[k]}
                  </option>
                ))}
              </select>
              <button disabled={busy || (transposes.length === 1 && transposes[0]![0] === tTo)} onClick={() => void fixTranspose()}>
                Convert
              </button>
            </div>
          </div>
        )}
        {!loading && mixes.length > 0 && (
          <div className="notation-inconsistent">
            <h4>Same notation in different styles (check whether deliberate)</h4>
            {mixes.map((m) => (
              <div key={m.what} className="notation-inc-row">
                <strong>{m.what}:</strong>
                <span>{m.styles.map((st) => `${st.label} ×${st.count} (${st.letters.join(", ")})`).join(" · ")}</span>
              </div>
            ))}
          </div>
        )}
        {!loading && current && (
          <div className="notation-grid">
            <div>
              <h4>Used now</h4>
              <ul className="notation-list">
                {forms.map((f) => (
                  <li key={f.key}>
                    <button
                      className={f.key === current.key ? "on" : undefined}
                      onClick={() => {
                        setFrom(f.key);
                        setLetters(new Set(f.letters.keys()));
                      }}
                    >
                      <span className="notation-sample">
                        <MathPreview latex={[...f.letters.keys()].slice(0, 4).map((l) => formLatex(CATALOG.find((c) => c.key === f.key)?.template ?? "X", l, GREEK_CMD.test(l))).join(",\\;")} />
                      </span>
                      <span>{formLabel(f.key)}</span>
                      <span className="muted">×{f.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <h4>For these letters</h4>
              <div className="notation-letters">
                {[...current.letters].map(([l, n]) => (
                  <label key={l} className="check">
                    <input
                      type="checkbox"
                      checked={letters.has(l)}
                      onChange={(e) => {
                        const next = new Set(letters);
                        if (e.target.checked) next.add(l);
                        else next.delete(l);
                        setLetters(next);
                      }}
                    />
                    <MathPreview latex={l} /> <span className="muted">×{n}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h4>Change to</h4>
              {groups.map((g) => (
                <div key={g} className="notation-target-group">
                  <div className="muted notation-group-name">{g}</div>
                  <div className="notation-targets">
                    {CATALOG.filter((c) => c.group === g).map((c) => (
                      <button key={c.group + c.template} className={to === c.template ? "on" : undefined} onClick={() => setTo(c.template)} title={c.label}>
                        <MathPreview latex={formLatex(c.template, sample, GREEK_CMD.test(sample))} />
                        <span>{c.label.replace(/\s{2}.*$/, "")}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {example && (
          <div className="notation-example">
            <MathPreview latex={example.before} />
            <span aria-hidden>→</span>
            <MathPreview latex={example.after} />
          </div>
        )}
        <div className="modal-actions">
          <span className="muted">{current ? `${affected} equation(s) will change` : ""}</span>
          <div className="spacer" />
          <button onClick={close}>Cancel</button>
          <button className="primary" disabled={!current || !affected || busy || letters.size === 0} onClick={() => void apply()}>
            {busy ? "Changing…" : index ? "Change in document" : "Change"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
