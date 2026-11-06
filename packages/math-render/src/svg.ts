import type { NotationProfile, Row } from "@mathblocks/math-core";
import { layout, type Box, type GlyphSource } from "./layout";
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
  /**
   * Picture padding around the ink in points, like MathType's (measured on its WMF pictures:
   * about 2 pt left/right/below and 2.3 pt above at 12 pt), with the depth below the baseline,
   * the height above it and the width rounded up to whole points as MathType does — so the run's
   * lowering (half-points) is exact. Overrides `margin`.
   */
  padding?: PicturePadding;
  /** Notation profile for kind objects (\pvec…); default: Hughes. */
  notation?: NotationProfile;
}

/** Glyph outline command (opentype.js form, y down). */
export interface PathCmd {
  type: string;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

/** One drawing operation in SVG units (y down), for painting without an SVG decoder. */
export type PaintOp =
  | { kind: "path"; d: string; cmds: PathCmd[]; m: [number, number, number, number, number, number]; color: string }
  | { kind: "rect"; x: number; y: number; w: number; h: number; color: string };

export interface RenderResult {
  svg: string;
  /** Same drawing as `svg`, as operations; `viewW`/`viewH` are the SVG viewBox size. */
  ops: PaintOp[];
  viewW: number;
  viewH: number;
  /** Size in points; depth = how far the picture goes below the text baseline. */
  widthPt: number;
  heightPt: number;
  depthPt: number;
  box: Box;
  /** Fonts the drawing used ("math" = the STIX fallback, "extra" = MT Extra). */
  sources: GlyphSource[];
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

/**
 * Moves every outline point a distance `d` into the ink (thinning a glyph's strokes). The ink side
 * of travel is the same for all contours of a filled glyph (holes run the other way), and is
 * found from the largest contour's orientation. Control points move with their neighbours.
 */
export function thinOutline(cmds: PathCmd[], d: number): PathCmd[] {
  const contours: PathCmd[][] = [];
  let cur: PathCmd[] = [];
  for (const c of cmds) {
    if (c.type === "M" && cur.length) {
      contours.push(cur);
      cur = [];
    }
    cur.push({ ...c });
    if (c.type === "Z") {
      contours.push(cur);
      cur = [];
    }
  }
  if (cur.length) contours.push(cur);
  const pts = (cs: PathCmd[]) => cs.filter((c) => c.x !== undefined).map((c) => [c.x!, c.y!] as [number, number]);
  const area = (p: [number, number][]) => p.reduce((a, [x, y], i) => {
    const [x2, y2] = p[(i + 1) % p.length]!;
    return a + x * y2 - x2 * y;
  }, 0) / 2;
  let outer = 0;
  for (const cs of contours) {
    const a = area(pts(cs));
    if (Math.abs(a) > Math.abs(outer)) outer = a;
  }
  // y down: a positive area runs clockwise on screen, ink on the right of travel.
  const side = outer >= 0 ? 1 : -1;
  const out: PathCmd[] = [];
  for (const cs of contours) {
    // Polygon of all points in order (end points and control points) for the normals.
    const seq: { c: PathCmd; key: "1" | "2" | "" }[] = [];
    for (const c of cs) {
      if (c.x1 !== undefined) seq.push({ c, key: "1" });
      if (c.x2 !== undefined) seq.push({ c, key: "2" });
      if (c.x !== undefined) seq.push({ c, key: "" });
    }
    const get = (s: { c: PathCmd; key: string }) => [s.c[`x${s.key}` as "x"]!, s.c[`y${s.key}` as "y"]!] as [number, number];
    const moved = seq.map((s, i) => {
      const [px, py] = get(seq[(i - 1 + seq.length) % seq.length]!);
      const [nx, ny] = get(seq[(i + 1) % seq.length]!);
      let tx = nx - px;
      let ty = ny - py;
      const len = Math.hypot(tx, ty) || 1;
      tx /= len;
      ty /= len;
      const [x, y] = get(s);
      return [x + side * -ty * d, y + side * tx * d] as [number, number];
    });
    seq.forEach((s, i) => {
      s.c[`x${s.key}` as "x"] = moved[i]![0];
      s.c[`y${s.key}` as "y"] = moved[i]![1];
    });
    out.push(...cs);
  }
  return out;
}

/** Typesets an equation into a standalone SVG of glyph outlines (no fonts needed to view it). */
export interface PicturePadding {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Round depth, height and width up to whole points. */
  wholePoints?: boolean;
}

/** MathType's picture padding at 12 pt (Appendix A), scaled with the equation size. */
export const mathTypePadding = (sizePt: number): PicturePadding => {
  const k = sizePt / 12;
  return { left: 2 * k, right: 2 * k, top: 2.3 * k, bottom: 2 * k, wholePoints: true };
};

export function renderSvg(root: Row, o: RenderOptions): RenderResult {
  const style = o.style ?? CLASSIC;
  const used = new Set<GlyphSource>();
  const box = layout(root, { fonts: o.fonts, style, display: o.display ?? true, notation: o.notation, used });
  const sizePt = o.sizePt ?? 12;
  const pad = o.padding;
  const mm = o.margin ?? 0.04;
  // Left margin (x offset of the drawing) and the box: width, height above and depth below the baseline (em).
  const m = pad ? pad.left / sizePt : mm;
  let w = box.w + (pad ? (pad.left + pad.right) / sizePt : 2 * mm);
  let h = (pad ? Math.max(box.h, 0) + pad.top / sizePt : box.h + mm);
  let d = (pad ? Math.max(box.d, 0) + pad.bottom / sizePt : box.d + mm);
  if (pad?.wholePoints) {
    const up = (em: number) => Math.ceil(em * sizePt - 1e-6) / sizePt;
    w = up(w);
    h = up(h);
    d = up(d);
  }
  const paths: string[] = [];
  const ops: PaintOp[] = [];
  const byColor = new Map<string, string[]>();
  const add = (color: string | undefined, el: string) => {
    const k = color ?? style.color;
    if (!byColor.has(k)) byColor.set(k, []);
    byColor.get(k)!.push(el);
  };
  for (const it of box.items) {
    if (it.k === "p") {
      const cmds: PathCmd[] = it.pts.map(([px, py], i) => ({ type: i ? "L" : "M", x: (it.x + px + m) * U, y: (h - it.y - py) * U }));
      cmds.push({ type: "Z" });
      const p = pathData(cmds);
      add(it.color, `<path d="${p}"/>`);
      ops.push({ kind: "path", d: p, cmds, m: [1, 0, 0, 1, 0, 0], color: it.color ?? style.color });
      continue;
    }
    if (it.k === "r") {
      add(it.color, `<rect x="${f((it.x + m) * U)}" y="${f((h - it.y - it.h) * U)}" width="${f(it.w * U)}" height="${f(it.h * U)}"/>`);
      ops.push({ kind: "rect", x: (it.x + m) * U, y: (h - it.y - it.h) * U, w: it.w * U, h: it.h * U, color: it.color ?? style.color });
      continue;
    }
    const sx = it.sx ?? 1;
    const sy = it.sy ?? 1;
    const fontSize = it.s * U;
    let cmds = it.g.glyph.getPath(0, 0, fontSize).commands as PathCmd[];
    if (it.thin) cmds = thinOutline(cmds, (it.thin * U) / ((it.sx ?? 1) || 1));
    const p = pathData(cmds);
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
    ops.push({ kind: "path", d: p, cmds, m: [sx, 0, -k * sy, sy, tx, ty], color: it.color ?? style.color });
  }
  for (const [color, els] of byColor) paths.push(`<g fill="${color}">${els.join("")}</g>`);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w * sizePt)}pt" height="${f((h + d) * sizePt)}pt" viewBox="0 0 ${f(w * U)} ${f((h + d) * U)}">` +
    paths.join("") +
    `</svg>`;
  return { svg, ops, viewW: w * U, viewH: (h + d) * U, widthPt: w * sizePt, heightPt: (h + d) * sizePt, depthPt: d * sizePt, box, sources: [...used] };
}
