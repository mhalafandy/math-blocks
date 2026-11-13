import { useEffect, useMemo, useRef, useState } from "react";
import { parseLatex } from "@mathblocks/math-latex";
import { mathTypePadding, renderSvg, type FontSet } from "@mathblocks/math-render";
import { classicStyle, hasClassicFonts, loadFonts } from "../lib/render";
import { activeStyle } from "../lib/docStyle";
import { measureWidth } from "../lib/lineWidth";
import { DEFAULT_TEXT_WIDTH_PT } from "../lib/pageWidth";
import { useApp } from "../lib/store";

/**
 * The Word preview: the equation exactly as Word gets it (the same drawing as the Classic picture: the
 * document style, the size, MathType's padding), at true size (1 pt = 1/72 inch, as Word shows it at
 * 100 %), zoomable, with the line-width guides (the text width, or the room beside the number) and the
 * baseline. It follows the editor as you type. Shown in its own window (desktop) or as a pane.
 */

const PX_PER_PT = 96 / 72;
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
const ZOOM_KEY = "mathblocks.preview.zoom";

export function PreviewView({ latex, display, numbered, sizePt, textWidthPt, onClose }: { latex: string; display: boolean; numbered: boolean; sizePt: number; textWidthPt: number | null; onClose?: () => void }) {
  const docStyle = useApp((s) => s.docStyle);
  const accents = useApp((s) => s.accentRules);
  const profile = useApp((s) => s.notationProfile);
  const [fonts, setFonts] = useState<FontSet | null>(null);
  const [real, setReal] = useState(true);
  const [zoom, setZoom] = useState(() => {
    try {
      return Number(localStorage.getItem(ZOOM_KEY)) || 2;
    } catch {
      return 2;
    }
  });
  const [guides, setGuides] = useState(true);
  useEffect(() => {
    void loadFonts().then(setFonts);
    void hasClassicFonts().then(setReal);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(ZOOM_KEY, String(zoom));
    } catch {
      // Not remembered.
    }
  }, [zoom]);
  const drawn = useMemo((): { svg: string; w: number; h: number; d: number } | { error: string } | null => {
    if (!fonts || !latex.trim()) return null;
    try {
      const r = renderSvg(parseLatex(latex).root, { fonts, style: classicStyle(), display, sizePt, mathStyle: activeStyle(), padding: mathTypePadding(sizePt) });
      return { svg: r.svg, w: r.widthPt, h: r.heightPt, d: r.depthPt };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fonts, latex, display, sizePt, docStyle, accents, profile]);
  // The room on the line, as the width bar measures it (text width; beside the number for numbered equations).
  const [avail, setAvail] = useState(textWidthPt ?? DEFAULT_TEXT_WIDTH_PT);
  useEffect(() => {
    let live = true;
    void measureWidth(latex || "x", numbered).then((m) => live && setAvail(m.availPt)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [latex, numbered, textWidthPt, docStyle]);
  const text = textWidthPt ?? DEFAULT_TEXT_WIDTH_PT;
  const k = PX_PER_PT * zoom;
  // The equation in view (centred) when it or the zoom changes: the whole line can be wider than the window.
  const canvasRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = canvasRef.current?.querySelector(".preview-eq");
    el?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [drawn, zoom]);
  const step = (dir: 1 | -1) => setZoom((z) => ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS.findIndex((x) => x >= z - 1e-9) + dir))] ?? z);
  return (
    <div className="preview-view">
      <div className="preview-bar">
        <strong>Word preview</strong>
        <span className="muted">{drawn && "w" in drawn ? `${drawn.w.toFixed(1)} × ${(drawn.h).toFixed(1)} pt, depth ${drawn.d.toFixed(1)} pt · ${sizePt} pt · ${display ? (numbered ? "numbered" : "display") : "inline"}` : ""}</span>
        <div className="spacer" />
        <button className="icon-btn" title="Smaller" onClick={() => step(-1)}>−</button>
        <button className="link-button" title="True size (as Word shows it at 100 %)" onClick={() => setZoom(1)}>
          {Math.round(zoom * 100)} %
        </button>
        <button className="icon-btn" title="Larger" onClick={() => step(1)}>+</button>
        <label className="check" title="The line width (text width, or the room beside the number) and the baseline">
          <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} /> guides
        </label>
        {onClose && (
          <button className="icon-btn" title="Close the preview" onClick={onClose}>
            ✕
          </button>
        )}
      </div>
      {!real && <div className="preview-note">Times New Roman or Symbol not found here: letters come from STIX; Word on your PC uses Times New Roman and Symbol.</div>}
      <div className="preview-canvas" ref={canvasRef}>
        {!drawn ? (
          <p className="muted">{latex.trim() ? "Drawing…" : "Type an equation: it appears here as Word will get it."}</p>
        ) : "error" in drawn ? (
          <p className="bad">{drawn.error}</p>
        ) : (
          <div className="preview-page" style={{ width: Math.max(avail, drawn.w) * k + 40, minHeight: drawn.h * k + 40 }}>
            <div className="preview-line" style={{ width: (display ? avail : text) * k, height: drawn.h * k }}>
              {guides && (
                <>
                  <div className="preview-guide v" style={{ left: 0 }} title="Start of the line" />
                  <div className="preview-guide v" style={{ left: (display ? avail : text) * k }} title={display ? (numbered ? "Room beside the number" : "Text width") : "Text width"} />
                  <div className="preview-guide h" style={{ top: (drawn.h - drawn.d) * k }} title="Baseline" />
                  <span className="preview-guide-label" style={{ left: (display ? avail : text) * k }}>
                    {Math.round(display ? avail : text)} pt
                  </span>
                </>
              )}
              <div
                className="preview-eq"
                style={{ left: display ? ((avail - drawn.w) / 2) * k : 0, width: drawn.w * k, height: drawn.h * k }}
                dangerouslySetInnerHTML={{ __html: drawn.svg.replace(/width="[\d.]+pt" height="[\d.]+pt"/, `width="${drawn.w * k}" height="${drawn.h * k}"`) }}
              />
            </div>
            {display && drawn.w > avail + 0.5 && <p className="bad">Wider than the line by {(drawn.w - avail).toFixed(1)} pt.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
