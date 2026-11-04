import { useEffect, useState } from "react";
import { measureWidth, refreshTextWidth, type WidthMeasure } from "../lib/lineWidth";
import { suggestBreak, type BreakSuggestion } from "../lib/pageWidth";
import { useApp } from "../lib/store";
import { MathPreview } from "./MathPreview";

/**
 * Page-width check for display equations: how much of the line the equation takes
 * ("112% of line width"); when it is too wide, a suggested line break to confirm. Never shrinks.
 */
/** The current equation's width against its line (null for inline or empty equations). */
export function useWidthMeasure(): WidthMeasure | null {
  const latex = useApp((s) => s.latex);
  const display = useApp((s) => s.display);
  const numbered = useApp((s) => s.numbered);
  const sizePt = useApp((s) => s.equationSizePt);
  const textWidthPt = useApp((s) => s.textWidthPt);
  const editingTag = useApp((s) => s.editing?.tag);
  const connected = useApp((s) => s.connector.connected);
  const [m, setM] = useState<WidthMeasure | null>(null);

  useEffect(() => {
    void refreshTextWidth();
  }, [editingTag, connected]);

  useEffect(() => {
    if (!display || !latex.trim()) return setM(null);
    let live = true;
    const t = setTimeout(() => {
      measureWidth(latex, numbered)
        .then((r) => live && setM(r))
        .catch(() => live && setM(null));
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [latex, display, numbered, sizePt, textWidthPt]);
  return m;
}

export function WidthBar() {
  const latex = useApp((s) => s.latex);
  const display = useApp((s) => s.display);
  const numbered = useApp((s) => s.numbered);
  const m = useWidthMeasure();
  const [suggestion, setSuggestion] = useState<BreakSuggestion | null>(null);
  useEffect(() => setSuggestion(null), [latex]);

  if (!display || !m || !latex.trim()) return null;
  const over = m.widthPt > m.availPt + 0.5;
  const pct = Math.max(Math.round((m.widthPt / Math.max(1, m.availPt)) * 100), over ? 101 : 0);
  const level = over ? "bad" : pct > 90 ? "warn" : "ok";
  const where = `${Math.round(m.availPt)} pt${numbered ? " beside the number" : ""}${m.fromWord ? "" : " (default; open Word for the real width)"}`;
  const suggest = () => {
    const s = suggestBreak(latex, m.measure, m.availPt);
    if (!s) return useApp.getState().notify("No place to break it: line breaks go before + − or a relation outside brackets and fractions.");
    setSuggestion(s);
  };
  return (
    <div className={`width-bar ${level}`} title={`Equation ${Math.round(m.widthPt)} pt; line ${where}`}>
      <div className="width-row">
        <div className="width-track" aria-hidden>
          <div className="width-fill" style={{ width: `${Math.min(100, (pct / 130) * 100)}%` }} />
          <div className="width-limit" style={{ left: `${(100 / 130) * 100}%` }} />
        </div>
        <span className="width-text">
          {pct}% of line width{pct > 100 ? " — too wide" : ""}
        </span>
        {pct > 100 && !suggestion && (
          <button className="link" onClick={suggest}>
            Suggest a line break
          </button>
        )}
      </div>
      {suggestion && (
        <div className="width-suggest">
          <MathPreview latex={suggestion.latex} />
          <div className="width-suggest-actions">
            <span className="muted">
              {suggestion.lines} lines{suggestion.fits ? "" : " — one part is still wider than the line"}
            </span>
            <button className="primary" onClick={() => (useApp.getState().setLatex(suggestion.latex, "external"), setSuggestion(null))}>
              Use this break
            </button>
            <button onClick={() => setSuggestion(null)}>Keep as is</button>
          </div>
        </div>
      )}
    </div>
  );
}
