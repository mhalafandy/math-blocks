import { useState } from "react";
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { open as pickFiles } from "@tauri-apps/plugin-dialog";
import { Modal } from "./Dialogs";
import { MathPreview } from "./MathPreview";
import { formLabel, formLatex, templateOf } from "../lib/notation";
import { analyseThesis, chapterOf, docxEquations, loadChapters, placeOf, saveChapters, type Chapter, type ChapterEquation, type ThesisReport } from "../lib/thesis";
import { useLibrary } from "../lib/library/useLibrary";
import { useApp } from "../lib/store";

/**
 * Thesis check: the chapter files (one .docx per chapter) are read from disk — open in Word or
 * not — and checked together: notation, definitions, linked copies; plus one list of symbols.
 */
export const useThesis = create<{ open: boolean; set: (o: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));
export const openThesis = () => useThesis.getState().set(true);

const GREEK_CMD = /^\\[a-zA-Z]+$/;

export function ThesisDialog() {
  const open = useThesis((s) => s.open);
  const set = useThesis((s) => s.set);
  const [chapters, setChapters] = useState<Chapter[]>(loadChapters);
  const [report, setReport] = useState<ThesisReport | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const close = () => set(false);
  const update = (next: Chapter[]) => {
    setChapters(next);
    saveChapters(next);
    setReport(null);
  };

  const add = async () => {
    const picked = await pickFiles({ title: "Add chapter files", multiple: true, filters: [{ name: "Word document", extensions: ["docx", "docm"] }] });
    const paths = (Array.isArray(picked) ? picked : picked ? [picked] : []).filter((p) => !chapters.some((c) => c.path === p));
    update([...chapters, ...paths.map(chapterOf)].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
  };
  const move = (i: number, d: -1 | 1) => {
    const next = [...chapters];
    const [c] = next.splice(i, 1);
    next.splice(i + d, 0, c!);
    update(next);
  };

  const check = async () => {
    setBusy(true);
    try {
      const reads = [];
      for (const c of chapters) {
        try {
          const bytes = new Uint8Array(await invoke<ArrayBuffer>("document_read", { path: c.path }));
          reads.push(docxEquations(bytes, c));
        } catch (e) {
          reads.push({ chapter: c, equations: [], mathType: 0, error: e instanceof Error ? e.message : String(e) });
        }
      }
      const lib = useLibrary.getState();
      setReport(analyseThesis(reads, (id) => lib.equations.find((q) => q.id === id)?.latex ?? null));
    } finally {
      setBusy(false);
    }
  };

  const openChapter = (c: Chapter | string) => void invoke("document_open", { path: typeof c === "string" ? c : c.path }).catch((e: unknown) => useApp.getState().notify(String(e), "error"));
  const pathOf = (e: ChapterEquation) => chapters.find((c) => c.name === e.chapter)?.path ?? "";

  return (
    <Modal title="Thesis check (all chapters)" onClose={close} width={860}>
      <div className="form thesis">
        <p className="hint">Add the chapter files of your thesis (one Word file per chapter). They are read as last saved, whether open in Word or not; nothing is changed.</p>
        <ul className="thesis-chapters">
          {chapters.map((c, i) => {
            const r = report?.reads.find((x) => x.chapter.path === c.path);
            return (
              <li key={c.path}>
                <span className="thesis-name" title={c.path}>
                  {c.name}
                </span>
                {r && (
                  <span className="muted">
                    {r.error ? <span className="conv-msg">{r.error}</span> : `${r.equations.length} equations`}
                    {r.mathType ? ` · ${r.mathType} MathType not converted` : ""}
                  </span>
                )}
                <div className="spacer" />
                <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
                  ↑
                </button>
                <button className="icon-btn" disabled={i === chapters.length - 1} onClick={() => move(i, 1)} title="Move down">
                  ↓
                </button>
                <button className="icon-btn" onClick={() => openChapter(c)} title="Open in Word">
                  ↗
                </button>
                <button className="icon-btn" onClick={() => update(chapters.filter((x) => x !== c))} title="Remove from the list">
                  ✕
                </button>
              </li>
            );
          })}
          {chapters.length === 0 && <li className="empty">No chapters yet.</li>}
        </ul>
        <div className="modal-actions">
          <button onClick={() => void add()}>Add chapter files…</button>
          <div className="spacer" />
          <button className="primary" disabled={!chapters.length || busy} onClick={() => void check()}>
            {busy ? "Reading…" : report ? "Check again" : "Check all chapters"}
          </button>
        </div>

        {report && (
          <div className="thesis-report">
            <p>
              <strong>{report.equations.length}</strong> MathBlocks equations, <strong>{report.symbols.length}</strong> symbols in {report.reads.length} chapters.
            </p>

            <h4>Notation written in more than one way {report.inconsistencies.length ? `(${report.inconsistencies.length})` : "✓"}</h4>
            {report.inconsistencies.map((inc) => (
              <div key={inc.letter} className="thesis-item">
                {inc.forms.map((f) => {
                  const t = templateOf(f.key);
                  return (
                    <span key={f.key} className="notation-inc-form">
                      <MathPreview latex={t ? formLatex(t, inc.letter, GREEK_CMD.test(inc.letter)) : inc.letter} />
                      <span className="muted">
                        {formLabel(f.key)} ×{f.count} — {(inc.chapters.get(f.key) ?? []).join(", ")}
                      </span>
                    </span>
                  );
                })}
              </div>
            ))}
            {report.inconsistencies.length > 0 && <p className="hint">Fix a chapter with Ctrl+K → “Change notation / check consistency” while it is open in Word.</p>}

            <h4>Symbols defined differently in different chapters {report.definedDifferently.length ? `(${report.definedDifferently.length})` : "✓"}</h4>
            {report.definedDifferently.map((d) => (
              <div key={d.symbol} className="thesis-item column">
                {d.definitions.map((x) => (
                  <div key={x.equation.tag} className="thesis-def">
                    <span className="muted thesis-place">{placeOf(x.equation)}</span>
                    <MathPreview latex={x.equation.latex} />
                    <button className="ghost" onClick={() => openChapter(pathOf(x.equation))}>
                      Open
                    </button>
                  </div>
                ))}
              </div>
            ))}

            <h4>Linked equations out of date {report.outdated.length ? `(${report.outdated.length})` : "✓"}</h4>
            {report.outdated.map((o) => (
              <div key={o.equation.tag + o.equation.chapter} className="thesis-def">
                <span className="muted thesis-place">{placeOf(o.equation)}</span>
                <MathPreview latex={o.equation.latex} />
                <span aria-hidden>→</span>
                <MathPreview latex={o.latest} />
                <button className="ghost" onClick={() => openChapter(pathOf(o.equation))} title="MathBlocks offers to update it when the chapter opens">
                  Open to update
                </button>
              </div>
            ))}

            <div className="modal-actions">
              <span className="muted">Put Word's cursor where the list should go (e.g. the front matter document), then:</span>
              <div className="spacer" />
              <button
                disabled={!report.symbols.length}
                onClick={() =>
                  void import("./NomenclatureDialog").then((m) =>
                    m.openNomenclature({ name: "Thesis", symbols: report.symbols, where: (e) => placeOf(e as ChapterEquation) }),
                  )
                }
              >
                List of symbols for the whole thesis…
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
