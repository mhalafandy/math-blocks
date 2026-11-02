import { useEffect, useRef } from "react";
import { closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { Annotation, EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, placeholder } from "@codemirror/view";
import type { Diagnostic } from "@mathblocks/math-latex";
import { setLastEditor } from "../lib/focus";
import { latexExtensions } from "../lib/latexLanguage";
import { useApp } from "../lib/store";

let activeView: EditorView | null = null;

/** Inserts text at the LaTeX editor's cursor (used by the symbol palette). */
export function insertIntoLatex(text: string): boolean {
  const view = activeView;
  if (!view) return false;
  const { from, to } = view.state.selection.main;
  const before = view.state.doc.sliceString(Math.max(0, from - 40), from);
  // Keep commands separate from following letters: "\alpha x", not "\alphax".
  const pad = /\\[A-Za-z]+$/.test(before) && /^[A-Za-z]/.test(text) ? " " : "";
  view.dispatch({
    changes: { from, to, insert: pad + text },
    selection: { anchor: from + pad.length + text.length },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

/** Focuses the LaTeX editor (Ctrl+L). */
export function focusLatexEditor() {
  activeView?.focus();
}

/**
 * LaTeX source editor (CodeMirror 6): syntax colours, completion with templates (Tab moves
 * between fields), bracket matching and auto-closing, error underlines from our own parser, undo.
 * The text you type is never reformatted underneath you; it only changes when the equation is
 * edited elsewhere (visual editor, library, palette).
 */
export function LatexEditor({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latex = useApp((s) => s.latex);
  const source = useApp((s) => s.source);

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: useApp.getState().latex,
        extensions: [
          history(),
          closeBrackets(),
          bracketMatching(),
          highlightActiveLine(),
          placeholder("Type LaTeX here, e.g. \\frac{a}{b}  (Ctrl+Space for suggestions)"),
          keymap.of([...closeBracketsKeymap, ...completionKeymap, ...historyKeymap, ...defaultKeymap]),
          ...latexExtensions,
          EditorView.contentAttributes.of({ "aria-label": "LaTeX source", spellcheck: "false" }),
          EditorView.updateListener.of((u) => {
            if (u.focusChanged && u.view.hasFocus) setLastEditor("latex");
            // Only user edits flow out; programmatic updates from other editors carry "external".
            if (u.docChanged && !u.transactions.some((tr) => tr.annotation(external))) {
              useApp.getState().setLatex(u.state.doc.toString(), "latex");
            }
          }),
        ],
      }),
    });
    view.current = v;
    activeView = v;
    return () => {
      v.destroy();
      if (activeView === v) activeView = null;
    };
  }, []);

  // Adopt changes made elsewhere (visual editor, library, palette); keep the user's own text otherwise.
  useEffect(() => {
    const v = view.current;
    if (!v || source === "latex") return;
    const current = v.state.doc.toString();
    if (current !== latex) {
      v.dispatch({ changes: { from: 0, to: current.length, insert: latex }, annotations: external.of(true) });
    }
  }, [latex, source]);

  const jumpTo = (d: Diagnostic) => {
    const v = view.current;
    if (!v) return;
    const len = v.state.doc.length;
    v.dispatch({ selection: { anchor: Math.min(d.start, len), head: Math.min(Math.max(d.end, d.start + 1), len) }, scrollIntoView: true });
    v.focus();
  };

  return (
    <div className="latex-editor">
      <div className="cm-host" ref={host} />
      <ul className="diagnostics" aria-live="polite">
        {diagnostics.length === 0 ? (
          <li className="ok">No problems</li>
        ) : (
          diagnostics.map((d, i) => (
            <li key={i} className={d.severity}>
              <button type="button" onClick={() => jumpTo(d)}>
                <span className="pos">col {d.start + 1}</span> {d.message}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

/** Marks transactions that come from outside the LaTeX editor, so they are not echoed back. */
const external = Annotation.define<boolean>();
