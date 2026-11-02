import { useEffect, useRef, useState } from "react";
import type { Diagnostic } from "@mathblocks/math-latex";
import { useApp } from "../lib/store";

let inserter: ((text: string) => void) | null = null;

/** Inserts text at the LaTeX editor's cursor (used by the palette in LaTeX-only layout). */
export function insertIntoLatex(text: string): boolean {
  if (!inserter) return false;
  inserter(text);
  return true;
}

/**
 * LaTeX source editor. M1: plain text area with diagnostics underneath.
 * M2 replaces it with CodeMirror 6 (highlighting, completion, bracket matching, squiggles).
 */
export function LatexEditor({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const latex = useApp((s) => s.latex);
  const source = useApp((s) => s.source);
  const setLatex = useApp((s) => s.setLatex);
  const [text, setText] = useState(latex);
  const area = useRef<HTMLTextAreaElement>(null);

  // Keep the user's own text while they type; adopt external changes otherwise.
  useEffect(() => {
    if (source !== "latex") setText(latex);
  }, [latex, source]);

  useEffect(() => {
    inserter = (snippet) => {
      const el = area.current;
      if (!el) return;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      const before = el.value.slice(0, start);
      // Keep commands separate from following letters: "\\alpha x", not "\\alphax".
      const pad = /\\[A-Za-z]+$/.test(before) && /^[A-Za-z]/.test(snippet) ? " " : "";
      const next = before + pad + snippet + el.value.slice(end);
      setText(next);
      setLatex(next, "latex");
      const caret = start + pad.length + snippet.length;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    };
    return () => {
      inserter = null;
    };
  }, [setLatex]);

  const jumpTo = (d: Diagnostic) => {
    const el = area.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(d.start, Math.max(d.end, d.start + 1));
  };

  return (
    <div className="latex-editor">
      <textarea
        ref={area}
        value={text}
        spellCheck={false}
        aria-label="LaTeX source"
        onChange={(e) => {
          setText(e.target.value);
          setLatex(e.target.value, "latex");
        }}
      />
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
