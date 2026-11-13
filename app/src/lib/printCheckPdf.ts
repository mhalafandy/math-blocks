import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { parseLatex } from "@mathblocks/math-latex";
import { renderSvg, type FontSet, type RenderStyle } from "@mathblocks/math-render";
import type { MathStyle } from "@mathblocks/math-core";
import { flagsOf, inkBox, medianScale, type Flag, type Ink, type Measured, type PrintEntry } from "./printCheck";

/**
 * The PDF side of the print check, in the app's web view: pdf.js renders Word's PDF; each entry is found
 * by its markers (E12: on the inline line, D12 above the display equation) and cropped; the crops' ink is
 * compared with MathBlocks' own drawing of the same equation at the same size.
 */

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Pixels per point for the page images and the crops. */
const S = 3;

export interface PrintRow {
  entry: PrintEntry;
  inline: Measured & { crop?: string; flags: Flag[] };
  display: Measured & { crop?: string; flags: Flag[] };
  tile?: string;
}

interface Marker {
  page: number;
  /** Baseline and the text item's right end, in page pixels. */
  y: number;
  xEnd: number;
}

const toPng = (c: HTMLCanvasElement) => c.toDataURL("image/png");

/** The ink of MathBlocks' drawing of `latex` at `sizePt` (points; y from the baseline, up positive). */
async function drawnInk(latex: string, o: { fonts: FontSet; style: RenderStyle; mathStyle: MathStyle; sizePt: number; display: boolean }): Promise<{ ink: Ink | null; missing: boolean }> {
  const r = renderSvg(parseLatex(latex).root, { fonts: o.fonts, style: { ...o.style, color: "#000" }, display: o.display, sizePt: o.sizePt, mathStyle: o.mathStyle, margin: 0 });
  const missing = r.sources.includes("none");
  const w = Math.max(1, Math.ceil(r.widthPt * S));
  const h = Math.max(1, Math.ceil(r.heightPt * S));
  const img = new Image();
  const url = URL.createObjectURL(new Blob([r.svg], { type: "image/svg+xml" }));
  try {
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    const box = inkBox(g.getImageData(0, 0, w, h).data, w, 0, 0, w, h);
    if (!box) return { ink: null, missing };
    const baseline = (r.heightPt - r.depthPt) * S;
    return { ink: { x0: box.x0 / S, x1: box.x1 / S, top: (baseline - box.y0) / S, bottom: (baseline - box.y1) / S }, missing };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Renders the PDF, measures every entry, and saves the page images through `save` (file name, PNG data URL).
 * `failed`: Convert LaTeX's problems by entry index (not written).
 */
export async function analysePrint(
  pdf: Uint8Array,
  entries: PrintEntry[],
  o: { fonts: FontSet; style: RenderStyle; mathStyle: MathStyle; sizePt: number; save: (file: string, dataUrl: string) => Promise<void>; failed?: Map<number, string>; progress?: (text: string) => void },
): Promise<{ rows: PrintRow[]; pages: number }> {
  const doc = await pdfjs.getDocument({ data: pdf }).promise;
  const inlineAt = new Map<number, Marker & { xRight?: number }>();
  const displayAt = new Map<number, Marker>();
  const rows = new Map<number, PrintRow>();
  const byIndex = new Map(entries.map((e) => [e.i, e]));
  // Expected ink first (independent of the PDF).
  const expected = new Map<number, { inline: { ink: Ink | null; missing: boolean }; display: { ink: Ink | null; missing: boolean } }>();
  for (const e of entries) {
    expected.set(e.i, { inline: await drawnInk(e.latex, { ...o, display: false }), display: await drawnInk(e.latex, { ...o, display: true }) });
  }
  for (let p = 1; p <= doc.numPages; p++) {
    o.progress?.(`page ${p} of ${doc.numPages}`);
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: S });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const g = canvas.getContext("2d", { willReadFrequently: true })!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    await o.save(`print/page-${String(p).padStart(3, "0")}.png`, toPng(canvas));
    const text = await page.getTextContent();
    const items = (text.items as { str: string; transform: number[]; width: number }[]).map((it) => {
      const [x, y] = vp.convertToViewportPoint(it.transform[4]!, it.transform[5]!);
      return { str: it.str, x, y, w: it.width * S };
    });
    // Word splits a line's text into pieces ("D2" + "80"): the markers are read on whole lines (pieces on one
    // baseline, left to right), the equation sits between the piece ending in "ab" and the one starting "cd".
    const lines: (typeof items)[] = [];
    for (const it of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
      const line = lines.find((l) => Math.abs(l[0]!.y - it.y) < 1.5 * S);
      if (line) line.push(it);
      else lines.push([it]);
    }
    const pageMarkers: { i: number; kind: "E" | "D"; y: number }[] = [];
    for (const line of lines) {
      line.sort((a, b) => a.x - b.x);
      const text = line.map((x) => x.str).join("");
      const y = line[0]!.y;
      const e = /E(\d+):/.exec(text);
      if (e) {
        const i = Number(e[1]);
        const left = line.find((x) => /ab\s*$/.test(x.str));
        const right = line.find((x) => /^\s*cd/.test(x.str));
        inlineAt.set(i, { page: p, y, xEnd: left ? left.x + left.w : line[0]!.x + line[0]!.w, xRight: right?.x });
        pageMarkers.push({ i, kind: "E", y });
        continue;
      }
      const d = /^\s*D(\d+)\s*$/.exec(text);
      if (d) {
        displayAt.set(Number(d[1]), { page: p, y, xEnd: line[line.length - 1]!.x + line[line.length - 1]!.w });
        pageMarkers.push({ i: Number(d[1]), kind: "D", y });
      }
    }
    pageMarkers.sort((a, b) => a.y - b.y);
    const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
    const crop = (x0: number, y0: number, x1: number, y1: number) => {
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(x1 - x0));
      c.height = Math.max(1, Math.round(y1 - y0));
      c.getContext("2d")!.drawImage(canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
      return toPng(c);
    };
    // Inline lines first: where each one's ink really starts (a tall inline equation rises above its text),
    // so that a display band above it stops there.
    const lineTop = new Map<number, number>();
    for (const pass of ["E", "D"] as const)
    for (const m of pageMarkers) {
      if (m.kind !== pass) continue;
      const e = byIndex.get(m.i);
      if (!e) continue;
      const exp = expected.get(m.i)!;
      const row = rows.get(m.i) ?? { entry: e, inline: { pdf: null, expected: exp.inline.ink, missingGlyph: exp.inline.missing, flags: [] }, display: { pdf: null, expected: exp.display.ink, missingGlyph: exp.display.missing, flags: [] } };
      rows.set(m.i, row);
      if (m.kind === "E") {
        const at = inlineAt.get(m.i)!;
        const xL = at.xEnd + 1;
        const xR = (at.xRight ?? xL + 400 * S) - 1;
        const up = ((exp.inline.ink?.top ?? 10) + 4) * S;
        const down = (Math.max(0, -(exp.inline.ink?.bottom ?? 0)) + 4) * S;
        const box = inkBox(data, canvas.width, xL, at.y - up, xR, at.y + down);
        row.inline.crop = crop(Math.max(0, xL - 6 * S), at.y - up, xR + 6 * S, at.y + down);
        if (box) {
          row.inline.pdf = { x0: (box.x0 - xL) / S, x1: (box.x1 - xL) / S, top: (at.y - box.y0) / S, bottom: (at.y - box.y1) / S };
          row.inline.touchesSides = box.x0 <= xL + 1 || box.x1 >= xR - 1;
        }
        // The line's top: its equation's ink, or the text's (about 9 pt above the baseline at 11 pt).
        lineTop.set(m.i, Math.min(box ? box.y0 : at.y, at.y - 9 * S));
      } else {
        // The display equation: between the D marker and the next line below it (or the page's bottom margin),
        // stopping above that line's real ink.
        const next = pageMarkers.find((x) => x.y > m.y + 1);
        const y0 = m.y + 3 * S;
        const y1 = next ? (next.kind === "E" ? (lineTop.get(next.i) ?? next.y - 11 * S) : next.y - 11 * S) - 2 * S : canvas.height - 60 * S;
        const box = inkBox(data, canvas.width, 50 * S, y0, canvas.width - 50 * S, y1);
        if (box) {
          row.display.pdf = { x0: box.x0 / S, x1: box.x1 / S, top: -box.y0 / S, bottom: -box.y1 / S };
          row.display.crop = crop(Math.max(0, box.x0 - 8 * S), box.y0 - 6 * S, Math.min(canvas.width, box.x1 + 8 * S), box.y1 + 6 * S);
        }
      }
    }
  }
  // Entries Convert LaTeX did not write; entries whose markers were not found at all.
  for (const e of entries) {
    if (rows.has(e.i)) continue;
    const exp = expected.get(e.i)!;
    rows.set(e.i, { entry: e, inline: { pdf: null, expected: exp.inline.ink, flags: [] }, display: { pdf: null, expected: exp.display.ink, flags: [] } });
  }
  const list = [...rows.values()].sort((a, b) => a.entry.i - b.entry.i);
  for (const r of list) {
    const why = o.failed?.get(r.entry.i);
    if (why) {
      r.inline.notConverted = why;
      r.display.notConverted = why;
    }
  }
  const scaleIn = medianScale(list.map((r) => r.inline));
  const scaleDisp = medianScale(list.map((r) => r.display));
  for (const r of list) {
    r.inline.flags = flagsOf(r.inline, { scale: scaleIn, inline: true });
    r.display.flags = flagsOf(r.display, { scale: scaleDisp, inline: false });
  }
  return { rows: list, pages: doc.numPages };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** The contact sheet: each entry's palette tile, then how it came out inline and as a display equation, and its flags. */
export function contactSheet(rows: PrintRow[], title: string): string {
  const flagged = rows.filter((r) => r.inline.flags.length || r.display.flags.length).length;
  const tr = rows
    .map((r) => {
      const flags = [...new Set([...r.inline.flags.map((f) => `inline: ${f}`), ...r.display.flags.map((f) => `display: ${f}`)])];
      return `<tr class="${flags.length ? "bad" : ""}"><td class="n">${r.entry.i}</td><td><b>${esc(r.entry.name)}</b><br><code>${esc(r.entry.latex)}</code></td><td class="tile">${r.tile ?? ""}</td><td>${r.inline.crop ? `<img src="${r.inline.crop}">` : "—"}</td><td>${r.display.crop ? `<img src="${r.display.crop}">` : "—"}</td><td class="flags">${flags.map(esc).join("<br>") || "✓"}</td></tr>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font:13px system-ui,sans-serif;margin:16px;color:#222}table{border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:4px 8px;vertical-align:middle;text-align:left}
td.n{color:#888}td.tile svg{display:block}img{max-height:${40 * S}px;max-width:${260 * S / 2}px;image-rendering:auto;zoom:0.5}tr.bad{background:#fff3f0}td.flags{color:#b42318}tr:not(.bad) td.flags{color:#2e7d32}
code{font-size:11px;color:#555}</style></head><body><h1>${esc(title)}</h1><p>${rows.length} palette entries, each inline in a sentence and as a display equation, as Word printed them to PDF (cropped from the page images in this folder, ${S * 72} dpi). ${flagged} flagged. Flags compare each crop with MathBlocks' own drawing at the same size: empty, missing glyph, clipped, touching its neighbours, off the baseline, a different size than the others.</p>
<table><tr><th>#</th><th>Entry</th><th>Palette tile</th><th>Inline (PDF)</th><th>Display (PDF)</th><th>Flags</th></tr>${tr}</table></body></html>`;
}
