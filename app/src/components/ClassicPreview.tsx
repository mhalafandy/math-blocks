import { useEffect, useState } from "react";
import { parseLatex } from "@mathblocks/math-latex";
import { renderSvg } from "@mathblocks/math-render";
import { classicStyle, hasClassicFonts, loadFonts, notationProfile } from "../lib/render";

/** The equation as the MathBlocks engine will draw it in Word (Classic style). */
export function ClassicPreview({ latex, display, sizePt, guidePt }: { latex: string; display: boolean; sizePt: number; guidePt?: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [widthPt, setWidthPt] = useState(0);
  const [real, setReal] = useState(true);
  useEffect(() => {
    let live = true;
    // Typeset shortly after typing pauses (keeps typing fluid on long equations).
    const timer = setTimeout(() => void (async () => {
      try {
        const fonts = await loadFonts();
        if (!live) return;
        setReal(await hasClassicFonts());
        // Shown at twice the size for legibility.
        const r = renderSvg(parseLatex(latex).root, { fonts, style: classicStyle(), display, sizePt: sizePt * 2, notation: notationProfile() });
        setSvg(r.svg);
        setWidthPt(r.widthPt / 2);
      } catch {
        setSvg(null);
      }
    })(), svg ? 120 : 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [latex, display, sizePt]);
  return (
    <div className="classic-preview">
      {svg ? (
        <div className="classic-svg">
          <div className="classic-guide">
            <div dangerouslySetInnerHTML={{ __html: svg }} />
            {/* The available line width, centred on the equation: shown once the equation comes close to it. */}
            {display && guidePt && widthPt > 0.85 * guidePt
              ? ([-1, 1] as const).map((side) => (
                  <div key={side} className="classic-guide-line" style={{ left: `${50 + side * (guidePt / widthPt) * 50}%` }}>
                    {side > 0 && <span className="classic-guide-label">line width</span>}
                  </div>
                ))
              : null}
          </div>
        </div>
      ) : (
        <span className="muted">Preparing preview…</span>
      )}
      {!real && <p className="hint">Times New Roman or Symbol was not found, so this preview uses a stand-in font. In the desktop app on Windows, MathType's own fonts are used.</p>}
    </div>
  );
}
