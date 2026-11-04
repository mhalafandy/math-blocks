import { parseLatex } from "@mathblocks/math-latex";
import { renderSvg, type FontSet } from "@mathblocks/math-render";
import { addinSupports, connector } from "./connector";
import { classicStyle, loadFonts, notationProfile } from "./render";
import { useApp, type NumberStyle } from "./store";
import { availableWidth, DEFAULT_TEXT_WIDTH_PT } from "./pageWidth";

/** Asks Word for the text width at the equation being edited (or the cursor). Quietly keeps the last value on failure. */
export async function refreshTextWidth() {
  const app = useApp.getState();
  if (!app.connector.connected || !addinSupports("textWidth")) return;
  try {
    const r = await connector.request("textWidth", app.editing?.tag ? { tag: app.editing.tag } : {}, 4000);
    if (r.textWidthPt > 0) app.setTextWidth(r.textWidthPt);
  } catch {
    // Not critical: the last known (or default) width stays.
  }
}

/** A typical number for this numbering style ("(12)", "(3.12)", "(3.2.12)"). */
export function numberSample(style: NumberStyle): string {
  const parts = style.parts ?? (style.chapter ? "chapter" : "eq");
  const sep = style.separator ?? ".";
  const body = parts === "section" ? `3${sep}2${sep}12` : parts === "chapter" ? `3${sep}12` : "12";
  return `${style.open}${body}${style.close}`;
}

export interface WidthMeasure {
  /** Equation width as drawn (pt). */
  widthPt: number;
  /** What it may take on its line (pt): text width, minus the number for numbered equations. */
  availPt: number;
  textWidthPt: number;
  fromWord: boolean;
  /** Measures any LaTeX the same way (for suggested breaks). */
  measure: (latex: string) => number;
}

export async function measureWidth(latex: string, numbered: boolean): Promise<WidthMeasure> {
  const app = useApp.getState();
  const fonts: FontSet = await loadFonts();
  const sizePt = app.equationSizePt;
  const opts = { fonts, style: classicStyle(), display: true, sizePt, notation: notationProfile() };
  const measure = (l: string) => renderSvg(parseLatex(l).root, opts).widthPt;
  const textWidthPt = app.textWidthPt ?? DEFAULT_TEXT_WIDTH_PT;
  const numberPt = numbered ? measure(`\\text{${numberSample(app.numberStyle)}}`) : 0;
  return { widthPt: measure(latex), availPt: availableWidth(textWidthPt, numbered, numberPt), textWidthPt, fromWord: app.textWidthPt != null, measure };
}
