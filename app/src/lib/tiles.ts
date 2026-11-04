import { parseLatex } from "@mathblocks/math-latex";
import { PLACEHOLDER, renderSvg, type FontSet, type RenderStyle } from "@mathblocks/math-render";
import type { NotationProfile } from "@mathblocks/math-core";

/**
 * Palette tiles drawn by MathBlocks' own engine in the Word style (Classic: Times / Symbol), so
 * what is picked looks like what Word gets. Every tile:
 * - is drawn at the same font size and centred on the math axis (not on its box);
 * - is only ever scaled down, when it would not fit its cell;
 * - shows one placeholder look (a small dotted box); a slot inside a letter style (\mathbf{#0})
 *   shows a sample letter instead, so bold / calligraphic / blackboard variants stay visible;
 * - is filled with currentColor, so it follows the light/dark theme.
 */

export interface TileCell {
  /** Cell size in CSS px. */
  w: number;
  h: number;
  /** Font size in CSS px (the same for every tile). */
  fontPx: number;
  /** Inner padding in px. */
  pad: number;
}

export const SYMBOL_CELL: TileCell = { w: 40, h: 40, fontPx: 22, pad: 3 };
export const STRUCTURE_CELL: TileCell = { w: 84, h: 52, fontPx: 20, pad: 4 };

/** Math axis height (em): where fraction bars and the middle of = sit (Times). */
const AXIS = 0.25;

const STYLED_SLOT = /\\(mathbf|boldsymbol|bm|mathrm|mathsf|mathtt|mathcal|mathbb|mathfrak|mathit|mathscr)\{#0\}/g;
const SAMPLE: Record<string, string> = { mathcal: "F", mathscr: "F", mathbb: "R", mathfrak: "g" };

/** Palette template → tile LaTeX: sample letters in styled slots, dotted boxes elsewhere. */
export function tileLatex(template: string): string {
  return template
    .replace(STYLED_SLOT, (_, cmd: string) => `\\${cmd}{${SAMPLE[cmd] ?? "x"}}`)
    .replace(/#0|#\?/g, PLACEHOLDER);
}

export interface Tile {
  svg: string;
  /** Scale applied to fit (1 = natural size). */
  scale: number;
}

/** One tile as an inline SVG of the cell's size. */
export function renderTile(template: string, cell: TileCell, o: { fonts: FontSet; style: RenderStyle; notation?: NotationProfile; display?: boolean }): Tile {
  const r = renderSvg(parseLatex(tileLatex(template)).root, { fonts: o.fonts, style: { ...o.style, color: "currentColor" }, display: o.display ?? true, notation: o.notation, margin: 0 });
  const { w, h, d } = r.box;
  const F = cell.fontPx;
  // Largest scale ≤ 1 that keeps the ink inside the cell with the axis on the cell's centre line.
  const half = cell.h / 2 - cell.pad;
  const fit = Math.min(1, (cell.w - 2 * cell.pad) / Math.max(1e-6, w * F), half / Math.max(1e-6, (h - AXIS) * F), half / Math.max(1e-6, (d + AXIS) * F));
  const s = (F * fit) / 1000; // renderSvg uses 1000 units per em
  const inner = r.svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  // In renderSvg's coordinates the baseline is at y = h·1000 (margin 0).
  const baselineY = cell.h / 2 + AXIS * F * fit;
  const tx = (cell.w - w * 1000 * s) / 2;
  const ty = baselineY - h * 1000 * s;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cell.w}" height="${cell.h}" viewBox="0 0 ${cell.w} ${cell.h}"><g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(5)})">${inner}</g></svg>`;
  return { svg, scale: fit };
}
