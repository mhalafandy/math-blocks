import { parseLatex } from "@mathblocks/math-latex";
import { charGlyph, mathTypePadding, renderSvg, type FontSet, type GlyphInfo, type RenderStyle } from "@mathblocks/math-render";
import type { MathStyle } from "@mathblocks/math-core";
import type { MathTypeSample, Wmf, WmfOp } from "@mathblocks/mathtype";

/**
 * Measured comparison with MathType (self-test, and CI on a synthetic document): MathType's own
 * preview picture (its WMF, drawn here with the real font outlines) and MathBlocks' drawing of the same
 * equation at the same size, aligned on the baseline and overlaid, with a difference score.
 */

/** The categories the report groups by (an equation can be in several; the first that applies is its group). */
export const CATEGORIES: { id: string; label: string; test: RegExp }[] = [
  { id: "matrices", label: "Matrices", test: /\\begin\{[pbvBV]?matrix|\\begin\{array/ },
  { id: "radicals", label: "Radicals", test: /\\sqrt/ },
  { id: "fractions", label: "Fractions", test: /\\[dt]?frac|\\binom|\\over\b/ },
  { id: "operators", label: "Large operators", test: /\\(sum|prod|int|iint|iiint|oint|lim|bigcup|bigcap|coprod)\b/ },
  { id: "accents", label: "Accents and harpoons", test: /\\(hat|bar|dot|ddot|vec|tilde|check|breve|overrightharpoon|overleftharpoon|overrightarrow|overline|underline|widehat|widetilde|pvec|bvec|vectrix|dyadic)\b/ },
  { id: "delimiters", label: "Delimiters", test: /\\left|\\right|\\big|\\Big|[()[\]]|\\[lr]angle|\\\{|\\\}/ },
  { id: "scripts", label: "Scripts", test: /[_^]/ },
  { id: "spacing", label: "Spacing and plain symbols", test: /./ },
];
export const categoryOf = (latex: string) => CATEGORIES.find((c) => c.test.test(latex))!.id;

/** MathType's size: the most common Times/Symbol em in the picture, in points. */
export function mathTypeSizePt(wmf: Wmf, heightPt: number): number | null {
  const unitsPerPt = (wmf.bounds.bottom - wmf.bounds.top) / Math.max(1e-6, heightPt);
  const counts = new Map<number, number>();
  for (const op of wmf.ops) if (op.k === "text" && op.font.height < 0) counts.set(-op.font.height, (counts.get(-op.font.height) ?? 0) + op.codes.length);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return top && unitsPerPt > 0 ? Math.round((top[0] / unitsPerPt) * 2) / 2 : null;
}

function fontFor(op: Extract<WmfOp, { k: "text" }>, fonts: FontSet) {
  const face = op.font.face.toLowerCase();
  if (face.includes("symbol")) return { font: fonts.symbol ?? fonts.math, symbolEncoded: true };
  if (face.includes("mt extra")) return { font: fonts.extra ?? fonts.math, symbolEncoded: true };
  const bold = op.font.weight >= 600;
  const font = bold ? (op.font.italic ? fonts.boldItalic : fonts.bold) : op.font.italic ? fonts.italic : fonts.regular;
  return { font, symbolEncoded: false };
}

/** MathType's picture as SVG (points), its text drawn with the real fonts' outlines. */
export function wmfToSvg(wmf: Wmf, fonts: FontSet, widthPt: number, heightPt: number, color = "#000"): string {
  const b = wmf.window && wmf.window.w && wmf.window.h ? { left: wmf.window.x, top: wmf.window.y, right: wmf.window.x + wmf.window.w, bottom: wmf.window.y + wmf.window.h } : wmf.bounds;
  const sx = widthPt / Math.max(1, b.right - b.left);
  const sy = heightPt / Math.max(1, b.bottom - b.top);
  const parts: string[] = [];
  for (const op of wmf.ops) {
    if (op.k === "poly") parts.push(`<path fill-rule="nonzero" d="${op.rings.map((r) => `M${r.map(([x, y]) => `${x} ${y}`).join("L")}Z`).join("")}"/>`);
    else if (op.k === "rect") parts.push(`<rect x="${op.left}" y="${op.top}" width="${op.right - op.left}" height="${op.bottom - op.top}"/>`);
    else if (op.k === "line") parts.push(`<path fill="none" stroke="${color}" stroke-width="${Math.max(1, 0.4 / sy)}" d="M${op.pts.map(([x, y]) => `${x} ${y}`).join("L")}"/>`);
    else {
      const { font, symbolEncoded } = fontFor(op, fonts);
      const upm = (font as unknown as { unitsPerEm: number }).unitsPerEm || 1000;
      const asc = (font as unknown as { ascender: number }).ascender / upm;
      const desc = -(font as unknown as { descender: number }).descender / upm;
      // Negative height: the em; positive: the cell (ascent + descent).
      const em = op.font.height < 0 ? -op.font.height : op.font.height / (asc + desc);
      const glyphs = op.codes.map((code): GlyphInfo | null => {
        if (symbolEncoded) return charGlyph(font, String.fromCharCode(code)) ?? charGlyph(font, String.fromCharCode(0xf000 + code));
        return charGlyph(font, String.fromCharCode(code));
      });
      const adv = glyphs.map((g, i) => op.dx?.[i] ?? (g ? g.w * em : em * 0.5));
      const total = adv.reduce((a, c) => a + c, 0);
      let x = op.x;
      const h = op.align & 6;
      if (h === 6) x -= total / 2;
      else if (h === 2) x -= total;
      const v = op.align & 24;
      const y = v === 24 ? op.y : v === 8 ? op.y - desc * em : op.y + asc * em;
      glyphs.forEach((g, i) => {
        if (g) parts.push(`<path d="${(g.glyph as unknown as { getPath: (x: number, y: number, s: number) => { toPathData: (d: number) => string } }).getPath(x, y, em).toPathData(2)}"/>`);
        x += adv[i]!;
      });
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPt}pt" height="${heightPt}pt" viewBox="0 0 ${widthPt} ${heightPt}"><g fill="${color}" transform="scale(${sx} ${sy}) translate(${-b.left} ${-b.top})">${parts.join("")}</g></svg>`;
}

export interface Drawn {
  svg: string;
  widthPt: number;
  heightPt: number;
  depthPt: number;
}

/** MathBlocks' drawing of the equation at `sizePt`, padded as the pictures in Word are. */
export function ourDrawing(latex: string, display: boolean, o: { fonts: FontSet; style: RenderStyle; mathStyle: MathStyle; sizePt: number }): Drawn {
  const r = renderSvg(parseLatex(latex).root, { fonts: o.fonts, style: { ...o.style, color: "#000" }, display, sizePt: o.sizePt, mathStyle: o.mathStyle, padding: mathTypePadding(o.sizePt) });
  return { svg: r.svg, widthPt: r.widthPt, heightPt: r.heightPt, depthPt: r.depthPt };
}

export interface Comparison {
  /** 0 = the same ink, 100 = nothing in common (1 px tolerance). */
  score: number;
  /** Ink sizes (points) and the horizontal shift applied to align the left ink edges. */
  mtInk: { w: number; h: number } | null;
  ourInk: { w: number; h: number } | null;
  /** Baselines: how far ours sits from MathType's when both pictures are placed by their depth (pt). */
  baselineShiftPt: number;
  mt: string;
  ours: string;
  overlay: string;
}

/** Where each picture goes on the common canvas: baselines on one row, `S` pixels per point. */
export function placement(mt: Drawn, ours: Drawn, S: number) {
  const m = 6 * S;
  const above = Math.max(mt.heightPt - mt.depthPt, ours.heightPt - ours.depthPt) * S;
  const below = Math.max(mt.depthPt, ours.depthPt) * S;
  const W = Math.ceil(Math.max(mt.widthPt, ours.widthPt) * S + 2 * m);
  const H = Math.ceil(above + below + 2 * m);
  const at = (d: Drawn) => ({ x: m, y: m + above - (d.heightPt - d.depthPt) * S, w: d.widthPt * S, h: d.heightPt * S });
  return { W, H, mt: at(mt), ours: at(ours) };
}

export interface MaskInk {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Ink box of a mask (null when blank). */
export function maskInk(mask: Uint8Array, W: number): MaskInk | null {
  let x0 = Infinity;
  let x1 = -1;
  let y0 = Infinity;
  let y1 = -1;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % W;
    const y = (i / W) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x1 >= 0 ? { x0, x1, y0, y1 } : null;
}

/** Shifts a mask horizontally by `dx` pixels. */
export function shiftMask(mask: Uint8Array, W: number, dx: number): Uint8Array {
  if (!dx) return mask;
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = (i % W) + dx;
    if (x >= 0 && x < W) out[i + dx] = 1;
  }
  return out;
}

/**
 * The difference of two ink masks (same canvas): left ink edges aligned first, then the share of ink
 * that has no ink of the other within one pixel. 0 = the same, 100 = nothing in common. Also the
 * overlay (RGBA): red = MathType only, blue = MathBlocks only, dark = both.
 */
export function scoreMasks(a: Uint8Array, b0: Uint8Array, W: number, H: number, S: number) {
  const ia = maskInk(a, W);
  const ib0 = maskInk(b0, W);
  const b = ia && ib0 ? shiftMask(b0, W, ia.x0 - ib0.x0) : b0;
  const ib = maskInk(b, W);
  const near = (mask: Uint8Array, i: number) => {
    const x = i % W;
    const y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && mask[yy * W + xx]) return true;
      }
    return false;
  };
  let onlyA = 0;
  let onlyB = 0;
  let total = 0;
  const rgba = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let i = 0; i < W * H; i++) {
    const inA = a[i] === 1;
    const inB = b[i] === 1;
    if (inA) total++;
    if (inB) total++;
    let rgb: number[] | null = null;
    if (inA && !near(b, i)) {
      onlyA++;
      rgb = [220, 40, 40];
    } else if (inB && !near(a, i)) {
      onlyB++;
      rgb = [30, 90, 230];
    } else if (inA || inB) rgb = [30, 30, 30];
    if (rgb) rgba.set(rgb, i * 4);
  }
  const size = (k: MaskInk | null) => (k ? { w: (k.x1 - k.x0 + 1) / S, h: (k.y1 - k.y0 + 1) / S } : null);
  return {
    score: total ? Math.round(((onlyA + onlyB) / total) * 1000) / 10 : 0,
    mtInk: size(ia),
    ourInk: size(ib),
    baselineShiftPt: ia && ib ? Math.round(((ib.y1 - ia.y1) / S) * 100) / 100 : 0,
    rgba,
    shifted: b,
  };
}

/** Both pictures rasterised on one canvas, scored, with PNG images (in the app's web view). */
export async function compareDrawings(mt: Drawn, ours: Drawn, S = 4): Promise<Comparison> {
  const pl = placement(mt, ours, S);
  const raster = async (d: Drawn, at: { x: number; y: number; w: number; h: number }) => {
    const c = document.createElement("canvas");
    c.width = pl.W;
    c.height = pl.H;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, pl.W, pl.H);
    const img = new Image();
    const url = URL.createObjectURL(new Blob([d.svg], { type: "image/svg+xml" }));
    try {
      img.src = url;
      await img.decode();
      g.drawImage(img, at.x, at.y, at.w, at.h);
    } finally {
      URL.revokeObjectURL(url);
    }
    const data = g.getImageData(0, 0, pl.W, pl.H).data;
    const mask = new Uint8Array(pl.W * pl.H);
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4]! < 140 ? 1 : 0;
    return { canvas: c, mask };
  };
  const a = await raster(mt, pl.mt);
  const b = await raster(ours, pl.ours);
  const r = scoreMasks(a.mask, b.mask, pl.W, pl.H, S);
  const png = (rgba: Uint8ClampedArray) => {
    const c = document.createElement("canvas");
    c.width = pl.W;
    c.height = pl.H;
    c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba), pl.W, pl.H), 0, 0);
    return c.toDataURL("image/png");
  };
  const maskPng = (mask: Uint8Array) => {
    const rgba = new Uint8ClampedArray(mask.length * 4).fill(255);
    for (let i = 0; i < mask.length; i++) if (mask[i]) rgba.set([0, 0, 0], i * 4);
    return png(rgba);
  };
  return { score: r.score, mtInk: r.mtInk, ourInk: r.ourInk, baselineShiftPt: r.baselineShiftPt, mt: a.canvas.toDataURL("image/png"), ours: maskPng(r.shifted), overlay: png(r.rgba) };
}

export interface CompareRow {
  sample: MathTypeSample;
  category: string;
  sizePt: number | null;
  result: Comparison | null;
  problem?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** The HTML report: by category (worst average first), each sorted worst first; side by side and overlaid. */
export function compareReport(rows: CompareRow[], title: string): string {
  const scored = rows.filter((r) => r.result);
  const mean = (l: CompareRow[]) => (l.length ? Math.round((l.reduce((s, r) => s + r.result!.score, 0) / l.length) * 10) / 10 : 0);
  const groups = CATEGORIES.map((c) => ({ c, list: scored.filter((r) => r.category === c.id).sort((a, b) => b.result!.score - a.result!.score) })).filter((g) => g.list.length).sort((a, b) => mean(b.list) - mean(a.list));
  const summary = groups.map((g) => `<tr><td><a href="#${g.c.id}">${g.c.label}</a></td><td>${g.list.length}</td><td>${mean(g.list)}</td><td>${g.list[0]!.result!.score}</td></tr>`).join("");
  const body = groups
    .map(
      (g) =>
        `<h2 id="${g.c.id}">${g.c.label} — mean ${mean(g.list)}, ${g.list.length} equation(s)</h2><table class="rows">${g.list
          .map((r) => {
            const x = r.result!;
            return `<tr><td class="n">#${r.sample.index}<br><b>${x.score}</b></td><td><code>${esc(r.sample.latex ?? "")}</code><br><small>${r.sample.display ? "display" : "inline"} · ${r.sizePt ?? "?"} pt · ink MathType ${x.mtInk ? `${x.mtInk.w.toFixed(1)}×${x.mtInk.h.toFixed(1)}` : "—"} pt, MathBlocks ${x.ourInk ? `${x.ourInk.w.toFixed(1)}×${x.ourInk.h.toFixed(1)}` : "—"} pt · baseline ${x.baselineShiftPt > 0 ? "+" : ""}${x.baselineShiftPt} pt</small></td><td><img src="${x.mt}" title="MathType"></td><td><img src="${x.ours}" title="MathBlocks"></td><td><img src="${x.overlay}" title="Overlay: red MathType only, blue MathBlocks only"></td></tr>`;
          })
          .join("")}</table>`,
    )
    .join("");
  const skipped = rows.filter((r) => !r.result);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:13px system-ui,sans-serif;margin:16px;color:#222}table{border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:4px 8px;text-align:left;vertical-align:middle}td.n{color:#666;white-space:nowrap}img{zoom:0.5;max-width:900px}code{font-size:11px}</style></head><body>
<h1>${esc(title)}</h1><p>${scored.length} equation(s) compared${skipped.length ? `, ${skipped.length} skipped` : ""}. Score: 0 = the same ink, 100 = nothing in common (1 px tolerance at 4 px/pt), after aligning the baselines and the left ink edges. Overlay: <span style="color:#dc2828">red = only in MathType</span>, <span style="color:#1e5ae6">blue = only in MathBlocks</span>, black = both.</p>
<table><tr><th>Category</th><th>Equations</th><th>Mean score</th><th>Worst</th></tr>${summary}</table>${body}
${skipped.length ? `<h2>Skipped</h2><ul>${skipped.map((r) => `<li>#${r.sample.index}: ${esc(r.problem ?? "")}</li>`).join("")}</ul>` : ""}</body></html>`;
}
