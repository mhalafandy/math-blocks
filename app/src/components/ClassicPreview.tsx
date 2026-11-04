import { useEffect, useState } from "react";
import { parseLatex } from "@mathblocks/math-latex";
import { renderSvg } from "@mathblocks/math-render";
import { classicStyle, hasClassicFonts, loadFonts, notationProfile } from "../lib/render";

/** The equation as the MathBlocks engine will draw it in Word (Classic style). */
export function ClassicPreview({ latex, display, sizePt }: { latex: string; display: boolean; sizePt: number }) {
  const [svg, setSvg] = useState<string | null>(null);
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
        setSvg(renderSvg(parseLatex(latex).root, { fonts, style: classicStyle(), display, sizePt: sizePt * 2, notation: notationProfile() }).svg);
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
      {svg ? <div className="classic-svg" dangerouslySetInnerHTML={{ __html: svg }} /> : <span className="muted">Preparing preview…</span>}
      {!real && <p className="hint">Times New Roman or Symbol was not found, so this preview uses a stand-in font. In the desktop app on Windows, MathType's own fonts are used.</p>}
    </div>
  );
}
