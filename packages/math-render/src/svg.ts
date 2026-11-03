import type { Row } from "@mathblocks/math-core";
import { layout, type Box } from "./layout";
import type { FontSet } from "./fonts";
import { CLASSIC, type RenderStyle } from "./style";

export interface RenderOptions {
  fonts: FontSet;
  style?: RenderStyle;
  display?: boolean;
  /** Font size of the equation in points (sets the SVG's physical size). */
  sizePt?: number;
  /** Extra margin around the ink, em. */
  margin?: number;
}

export interface RenderResult {
  svg: string;
  /** Size in points; depth = how far the picture goes below the text baseline. */
  widthPt: number;
  heightPt: number;
  depthPt: number;
  box: Box;
}

const U = 1000; // SVG units per em
const f = (n: number) => (Math.round(n * 100) / 100).toString();
const r1 = (n: number | undefined) => {
  const v = Math.round((n ?? 0) * 10) / 10;
  return Object.is(v, -0) ? "0" : String(v);
};

/** SVG path data from glyph outline commands (opentype.js' own toPathData can emit NaN). */
function pathData(commands: { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }[]): string {
  let d = "";
  for (const c of commands) {
    if (c.type === "M" || c.type === "L") d += `${c.type}${r1(c.x)} ${r1(c.y)}`;
    else if (c.type === "Q") d += `Q${r1(c.x1)} ${r1(c.y1)} ${r1(c.x)} ${r1(c.y)}`;
    else if (c.type === "C") d += `C${r1(c.x1)} ${r1(c.y1)} ${r1(c.x2)} ${r1(c.y2)} ${r1(c.x)} ${r1(c.y)}`;
    else if (c.type === "Z") d += "Z";
  }
  return d;
}

/** Typesets an equation into a standalone SVG of glyph outlines (no fonts needed to view it). */
export function renderSvg(root: Row, o: RenderOptions): RenderResult {
  const style = o.style ?? CLASSIC;
  const box = layout(root, { fonts: o.fonts, style, display: o.display ?? true });
  const m = o.margin ?? 0.04;
  const sizePt = o.sizePt ?? 12;
  const w = box.w + 2 * m;
  const h = box.h + m;
  const d = box.d + m;
  const paths: string[] = [];
  const byColor = new Map<string, string[]>();
  const add = (color: string | undefined, el: string) => {
    const k = color ?? style.color;
    if (!byColor.has(k)) byColor.set(k, []);
    byColor.get(k)!.push(el);
  };
  for (const it of box.items) {
    if (it.k === "r") {
      add(it.color, `<rect x="${f((it.x + m) * U)}" y="${f((h - it.y - it.h) * U)}" width="${f(it.w * U)}" height="${f(it.h * U)}"/>`);
      continue;
    }
    const sx = it.sx ?? 1;
    const sy = it.sy ?? 1;
    const fontSize = it.s * U;
    const p = pathData(it.g.glyph.getPath(0, 0, fontSize).commands);
    if (!p) continue;
    const tx = (it.x + m) * U;
    const ty = (h - it.y) * U;
    const k = it.slant ?? 0;
    const transform = k
      ? `matrix(${f(sx)} 0 ${f(-k * sy)} ${f(sy)} ${f(tx)} ${f(ty)})`
      : sx !== 1 || sy !== 1
        ? `translate(${f(tx)} ${f(ty)}) scale(${f(sx)} ${f(sy)})`
        : `translate(${f(tx)} ${f(ty)})`;
    add(it.color, `<path transform="${transform}" d="${p}"/>`);
  }
  for (const [color, els] of byColor) paths.push(`<g fill="${color}">${els.join("")}</g>`);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w * sizePt)}pt" height="${f((h + d) * sizePt)}pt" viewBox="0 0 ${f(w * U)} ${f((h + d) * U)}">` +
    paths.join("") +
    `</svg>`;
  return { svg, widthPt: w * sizePt, heightPt: (h + d) * sizePt, depthPt: d * sizePt, box };
}
