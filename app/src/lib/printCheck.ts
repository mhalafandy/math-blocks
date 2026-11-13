import { ENTRIES } from "./palette";

/**
 * Every palette entry in Word, checked as it prints (self-test). Each entry goes into a test document
 * inline in a sentence ("E12: ab ⟨equation⟩ cd") and as a display equation (after a "D12" marker line);
 * Convert LaTeX writes them; Word saves the PDF; the app renders its pages (pdf.js), finds each entry by
 * its markers, crops the inline and display results and compares their ink with MathBlocks' own drawing
 * of the same equation at the same size. The pure parts (the document, the flags) are here and
 * unit-tested; the PDF side is in printCheckPdf.ts.
 */

export interface PrintEntry {
  /** Index in the document (markers E{i}: / D{i}). */
  i: number;
  id: string;
  name: string;
  /** The palette LaTeX with its slots filled (x for the main slot, a, b, c… for the others). */
  latex: string;
}

/** Palette LaTeX → LaTeX with sample contents in its slots. */
export function fillSlots(latex: string): string {
  let k = 0;
  const letters = "abcdefghjkmnpqrstuvw";
  return latex.replace(/#0/g, "x").replace(/#\?|#@/g, () => letters[k++ % letters.length]!);
}

/** One entry per distinct LaTeX (the palette shows some symbols in several places). */
export function printEntries(): PrintEntry[] {
  const seen = new Set<string>();
  const out: PrintEntry[] = [];
  for (const e of ENTRIES) {
    const latex = fillSlots(e.latex);
    if (seen.has(latex)) continue;
    seen.add(latex);
    out.push({ i: out.length + 1, id: e.id, name: e.name, latex });
  }
  return out;
}

/** The test document's paragraphs (Convert LaTeX input): per entry, the inline sentence, the marker, the display. */
export function printParagraphs(entries: PrintEntry[]): { style: string; text: string; keepNext?: boolean }[] {
  const out: { style: string; text: string; keepNext?: boolean }[] = [];
  for (const e of entries) {
    // The three lines of an entry stay on one page (each crop is found on the page of its marker).
    out.push({ style: "Normal", text: `E${e.i}: ab $${e.latex}$ cd`, keepNext: true });
    out.push({ style: "Normal", text: `D${e.i}`, keepNext: true });
    out.push({ style: "MTDisplayEquation", text: `\t$$${e.latex}$$` });
  }
  return out;
}

/** Ink box of a crop (points, y up from the baseline for inline; from the crop's top otherwise). */
export interface Ink {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
}

export interface Measured {
  /** Ink found in the PDF crop (null: nothing printed). */
  pdf: Ink | null;
  /** Ink of MathBlocks' own drawing at the same size (what should print). */
  expected: Ink | null;
  /** Ink reaches the crop's left or right edge (inline: it touches the text around it). */
  touchesSides?: boolean;
  /** The renderer found no glyph for a character. */
  missingGlyph?: boolean;
  /** Convert LaTeX did not write this equation. */
  notConverted?: string;
}

export type Flag = "not converted" | "empty" | "missing glyph" | "clipped" | "touches its neighbours" | "off the baseline" | "different size";

/**
 * The flags of one printed equation. `scale`: the median ratio printed/expected over all entries (the
 * neighbours' size); inline: `baseline` true when the crop's y is measured from the text baseline.
 */
export function flagsOf(m: Measured, o: { scale: number; inline: boolean }): Flag[] {
  if (m.notConverted) return ["not converted"];
  const flags: Flag[] = [];
  if (m.missingGlyph) flags.push("missing glyph");
  // Nothing drawn (a space: \quad, \,) and nothing printed: right.
  if (!m.pdf) return m.expected ? [...flags, "empty"] : flags;
  if (!m.expected) return flags;
  const pw = m.pdf.x1 - m.pdf.x0;
  const ph = m.pdf.top - m.pdf.bottom;
  const ew = m.expected.x1 - m.expected.x0;
  const eh = m.expected.top - m.expected.bottom;
  const rw = ew > 0.5 ? pw / ew : 1;
  const rh = eh > 0.5 ? ph / eh : 1;
  // Part of it missing: noticeably narrower or shorter than the drawing (relative to the neighbours' size).
  if (rw < o.scale * 0.85 || rh < o.scale * 0.85) flags.push("clipped");
  // The same equation at a different size than its neighbours.
  else if (Math.abs(rw / o.scale - 1) > 0.08 && Math.abs(rh / o.scale - 1) > 0.08) flags.push("different size");
  if (o.inline && m.touchesSides) flags.push("touches its neighbours");
  // Inline: the ink's bottom where the drawing puts it relative to the baseline (within ¾ pt).
  if (o.inline && Math.abs(m.pdf.bottom - m.expected.bottom * o.scale) > 0.75) flags.push("off the baseline");
  return flags;
}

/** The median of the size ratios (printed / drawn) of the entries that printed: what "the neighbours' size" is. */
export function medianScale(list: Measured[]): number {
  const r = list
    .filter((m) => m.pdf && m.expected && m.expected.x1 - m.expected.x0 > 0.5)
    .map((m) => (m.pdf!.x1 - m.pdf!.x0) / (m.expected!.x1 - m.expected!.x0))
    .sort((a, b) => a - b);
  return r.length ? r[Math.floor(r.length / 2)]! : 1;
}

/** Ink box of an RGBA image region (dark pixels), in pixels; null when blank. */
export function inkBox(data: Uint8ClampedArray, width: number, x0: number, y0: number, x1: number, y1: number, threshold = 140): { x0: number; y0: number; x1: number; y1: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.ceil(y1); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(width, Math.ceil(x1)); x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3]! / 255;
      const lum = 255 - a * (255 - (0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!));
      if (lum < threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return Number.isFinite(minX) ? { x0: minX, y0: minY, x1: maxX + 1, y1: maxY + 1 } : null;
}
