/// <reference lib="dom" />
/**
 * The MathType comparison harness on a synthetic MathType document (CI): generic equations whose preview
 * pictures are WMF files written from MathBlocks' own drawing (polygons; one written as WMF text, to test
 * MathType-style text records), one of them deliberately lowered by 2 pt. The same code as the self-test
 * reads the document (MTEF → LaTeX, the WMF, its size and lowering), draws both, aligns on the baseline and
 * scores: the faithful ones must score near 0, the lowered one clearly not.
 *
 * Run: pnpm tsx tools/mt-compare-check.ts [out.html]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { DEFAULT_STYLE } from "@mathblocks/math-core";
import { parseLatex } from "@mathblocks/math-latex";
import { CLASSIC, loadFont, mathTypePadding, renderSvg, type FontSet } from "@mathblocks/math-render";
import { mathTypeDocx, mathTypeRun, mathTypeSamples, readWmf, writeWmf, type SyntheticEquation } from "@mathblocks/mathtype";
import { categoryOf, mathTypeSizePt, ourDrawing, placement, scoreMasks, wmfToSvg } from "../app/src/lib/mtCompare";

const L = "/usr/share/fonts/truetype/liberation/LiberationSerif-";
const require = createRequire(import.meta.url);
const STIX = require.resolve("@fontsource/stix-two-math/files/stix-two-math-latin-400-normal.woff", { paths: [fileURLToPath(new URL("../packages/math-render/", import.meta.url))] });
const fonts: FontSet = {
  regular: loadFont(readFileSync(L + "Regular.ttf")),
  italic: loadFont(readFileSync(L + "Italic.ttf")),
  bold: loadFont(readFileSync(L + "Bold.ttf")),
  boldItalic: loadFont(readFileSync(L + "BoldItalic.ttf")),
  math: loadFont(readFileSync(STIX)),
};
const SIZE = 12;
const TW = 20; // logical units per point (twips, 1440 per inch)

/** A preview picture written from MathBlocks' drawing: glyph outlines as polygons, rules as rectangles. */
function previewOf(latex: string, lowerPt = 0): { wmf: Uint8Array; widthPt: number; heightPt: number; depthPt: number } {
  const r = renderSvg(parseLatex(latex).root, { fonts, style: CLASSIC, display: false, sizePt: SIZE, mathStyle: DEFAULT_STYLE, padding: mathTypePadding(SIZE) });
  const k = r.widthPt / r.viewW; // points per SVG unit
  const polys: [number, number][][][] = [];
  for (const op of r.ops) {
    if (op.kind === "rect") {
      const x0 = op.x * k * TW;
      const y0 = (op.y * k + lowerPt) * TW;
      polys.push([[[x0, y0], [x0 + op.w * k * TW, y0], [x0 + op.w * k * TW, y0 + op.h * k * TW], [x0, y0 + op.h * k * TW]]]);
      continue;
    }
    const [a, b, c, d, e, f] = op.m;
    const pt = (x: number, y: number): [number, number] => [(a * x + c * y + e) * k * TW, ((b * x + d * y + f) * k + lowerPt) * TW];
    const rings: [number, number][][] = [];
    let ring: [number, number][] = [];
    let cx = 0;
    let cy = 0;
    for (const cmd of op.cmds) {
      if (cmd.type === "M") {
        if (ring.length) rings.push(ring);
        ring = [pt(cmd.x!, cmd.y!)];
      } else if (cmd.type === "L") ring.push(pt(cmd.x!, cmd.y!));
      else if (cmd.type === "Q" || cmd.type === "C") {
        for (let t = 0.25; t <= 1.001; t += 0.25) {
          const u = 1 - t;
          const x = cmd.type === "Q" ? u * u * cx + 2 * u * t * cmd.x1! + t * t * cmd.x! : u * u * u * cx + 3 * u * u * t * cmd.x1! + 3 * u * t * t * cmd.x2! + t * t * t * cmd.x!;
          const y = cmd.type === "Q" ? u * u * cy + 2 * u * t * cmd.y1! + t * t * cmd.y! : u * u * u * cy + 3 * u * u * t * cmd.y1! + 3 * u * t * t * cmd.y2! + t * t * t * cmd.y!;
          ring.push(pt(x, y));
        }
      } else if (cmd.type === "Z" && ring.length) {
        rings.push(ring);
        ring = [];
      }
      if (cmd.x !== undefined) {
        cx = cmd.x;
        cy = cmd.y!;
      }
    }
    if (ring.length) rings.push(ring);
    if (rings.length) polys.push(rings);
  }
  const bounds = { left: 0, top: 0, right: Math.round(r.widthPt * TW), bottom: Math.round(r.heightPt * TW) };
  return { wmf: writeWmf({ bounds, polys }), widthPt: r.widthPt, heightPt: r.heightPt, depthPt: r.depthPt };
}

// The document: generic equations; "fraction" is lowered by 2 pt in its picture (the defect to find);
// "x" is written as WMF text (Times New Roman italic, as MathType writes a variable).
const NAMES: SyntheticEquation[] = ["pythagoras", "fraction", "matrix", "force", "x"];
const LATEX: Record<string, string> = { pythagoras: "a^{2}+b^{2}=c^{2}", fraction: "\\frac{a}{b}=y", matrix: "\\begin{bmatrix}0&y&z\\end{bmatrix}", force: "\\mathbf{F}=m\\mathbf{a}", x: "x" };
const pictures = NAMES.map((n) => (n === "fraction" ? previewOf(LATEX[n]!, 2) : previewOf(LATEX[n]!)));
{
  // "x" as text: the same position as the polygon drawing (left edge of its padding, baseline).
  const p = pictures[4]!;
  const base = (p.heightPt - p.depthPt) * TW;
  const pad = mathTypePadding(SIZE);
  p.wmf = writeWmf({ bounds: { left: 0, top: 0, right: Math.round(p.widthPt * TW), bottom: Math.round(p.heightPt * TW) }, texts: [{ x: (pad.left ?? 0) * TW, y: base, text: "x", face: "Times New Roman", height: SIZE * TW, italic: true }] });
}
const paragraphs = NAMES.map((_, i) => `<w:p><w:r><w:t xml:space="preserve">Equation ${i + 1}: </w:t></w:r>${mathTypeRun(i + 1, Math.round(pictures[i]!.widthPt), Math.round(pictures[i]!.heightPt), Math.round(pictures[i]!.depthPt * 2))}<w:r><w:t xml:space="preserve"> in a sentence.</w:t></w:r></w:p>`);
// mathTypeRun takes whole points: write the exact sizes back into the pictures' expectations.
pictures.forEach((p) => {
  p.widthPt = Math.round(p.widthPt);
  p.heightPt = Math.round(p.heightPt);
  p.depthPt = Math.round(p.depthPt * 2) / 2;
});
const docx = mathTypeDocx(paragraphs, NAMES, pictures.map((p) => p.wmf));

const samples = mathTypeSamples(docx);
const failures: string[] = [];
if (samples.length !== NAMES.length) failures.push(`found ${samples.length} MathType equations, expected ${NAMES.length}`);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<html><body></body></html>");
await page.evaluate("window.__name = (f) => f");
const S = 4;
const rows: string[] = [];
for (const s of samples) {
  const name = NAMES[s.index - 1]!;
  if (!s.latex || !s.picture || s.pictureType !== "wmf") {
    failures.push(`#${s.index}: latex ${s.latex}, picture ${s.pictureType}`);
    continue;
  }
  const wmf = readWmf(s.picture);
  const size = mathTypeSizePt(wmf, s.heightPt) ?? SIZE;
  const mt = { svg: wmfToSvg(wmf, fonts, s.widthPt, s.heightPt), widthPt: s.widthPt, heightPt: s.heightPt, depthPt: s.depthPt };
  const ours = ourDrawing(s.latex, s.display, { fonts, style: CLASSIC, mathStyle: DEFAULT_STYLE, sizePt: size });
  const pl = placement(mt, ours, S);
  // Rasterise both in the page (plain DOM, no app code) and score in Node with the app's function.
  const masks = await page.evaluate(
    async ([a, b, W, H, pa, pb]) => {
      const draw = async (svg: string, at: { x: number; y: number; w: number; h: number }) => {
        const c = document.createElement("canvas");
        c.width = W as number;
        c.height = H as number;
        const g = c.getContext("2d")!;
        g.fillStyle = "#fff";
        g.fillRect(0, 0, c.width, c.height);
        const img = new Image();
        img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
        await img.decode();
        g.drawImage(img, at.x, at.y, at.w, at.h);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let out = "";
        for (let i = 0; i < d.length; i += 4) out += d[i]! < 140 ? "1" : "0";
        return out;
      };
      return [await draw(a as string, pa as never), await draw(b as string, pb as never)];
    },
    [mt.svg, ours.svg, pl.W, pl.H, pl.mt, pl.ours] as const,
  );
  const toMask = (s01: string) => Uint8Array.from(s01, (c) => (c === "1" ? 1 : 0));
  const r = scoreMasks(toMask(masks[0]!), toMask(masks[1]!), pl.W, pl.H, S);
  const lowered = name === "fraction";
  rows.push(`#${s.index} ${name} (${categoryOf(s.latex)}, ${size} pt): score ${r.score}, baseline shift ${r.baselineShiftPt} pt`);
  if (lowered && r.score < 15) failures.push(`#${s.index} ${name}: the 2 pt lowered picture scored only ${r.score}`);
  if (!lowered && r.score > 6) failures.push(`#${s.index} ${name}: a faithful picture scored ${r.score}`);
}
await browser.close();
console.log(rows.join("\n"));
if (process.argv[2]) writeFileSync(process.argv[2], rows.join("\n"));
if (failures.length) {
  console.log(`${failures.length} failure(s):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("MathType comparison harness: the faithful pictures score near 0, the lowered one is found.");
