/**
 * Harpoon review sheet: vectors in a line of text at 12 pt and 10 pt (true size), as PNG at 100 %
 * and as an A4 PDF to print. Run: pnpm tsx tools/harpoon-sheet.ts <outDir>
 * (Windows CI uses Times New Roman; elsewhere Liberation Serif, metrically the same.)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { parseLatex } from "@mathblocks/math-latex";
import { loadFont, renderSvg, CLASSIC, MATHTYPE_ACCENTS } from "@mathblocks/math-render";

const out = process.argv[2] ?? "harpoon-sheet";
mkdirSync(out, { recursive: true });
const win = "C:/Windows/Fonts/";
const lib = "/usr/share/fonts/truetype/liberation/LiberationSerif-";
const pick = (w: string, l: string) => (existsSync(win + w) ? win + w : lib + l);
const stix = loadFont(readFileSync(new URL("../packages/math-render/node_modules/@fontsource/stix-two-math/files/stix-two-math-latin-400-normal.woff", import.meta.url)));
const fonts = {
  regular: loadFont(readFileSync(pick("times.ttf", "Regular.ttf"))),
  italic: loadFont(readFileSync(pick("timesi.ttf", "Italic.ttf"))),
  bold: loadFont(readFileSync(pick("timesbd.ttf", "Bold.ttf"))),
  boldItalic: loadFont(readFileSync(pick("timesbi.ttf", "BoldItalic.ttf"))),
  math: stix,
};
const H = (b: string) => `\\overrightharpoon{${b}}`;
const items = [
  H("\\mathbf{a}"), H("\\mathbf{r}"), H("\\boldsymbol{\\omega}"), H("\\mathbf{F}"), H("\\mathbf{H}"),
  `${H("\\mathbf{r}")}_{P/O}`, `${H("\\boldsymbol{\\omega}")}_{B/N}`, `${H("\\mathbf{v}")}_{P/O}`, `${H("\\mathbf{h}")}_{c}`,
  `\\dot{${H("\\mathbf{r}")}}`, `${H("\\mathbf{F}")}=m${H("\\mathbf{a}")}`,
];
function svg(latex: string, sizePt: number, display: boolean, style = CLASSIC) {
  const r = renderSvg(parseLatex(latex).root, { fonts, style, display, sizePt });
  // Lowered by its depth so it sits on the text baseline, as in Word.
  return `<span style="display:inline-block;vertical-align:-${r.depthPt.toFixed(2)}pt">${r.svg}</span>`;
}
const line = (size: number, style = CLASSIC) =>
  `<p style="font:${size}pt 'Times New Roman','Liberation Serif',serif;margin:0 0 ${size * 0.6}pt">The vectors ${items.map((l) => svg(l, size, false, style)).join(", ")} in the frame.</p>`;
const old = { ...CLASSIC, accents: MATHTYPE_ACCENTS };
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 18mm; }
body { margin: 0; padding: 12pt; background: #fff; color: #000; font-family: 'Liberation Serif', 'Times New Roman', serif; }
h1 { font: 600 13pt sans-serif; margin: 0 0 4pt; } h2 { font: 600 10pt sans-serif; margin: 14pt 0 6pt; color: #333; }
.note { font: 9pt sans-serif; color: #444; margin: 0 0 10pt; }
.big svg { margin-right: 14pt; }
</style></head><body>
<h1>Harpoon — print check</h1>
<p class="note">True size. New: stroke 0.0435 em (0.52 pt at 12 pt, 0.44 pt at 10 pt), sharp tip, tapered barb with a mitred end, adaptive length (ink width + 0.14 em, at least 0.48 em). For comparison, the same shape with MathType's stroke of 0.029 em (0.35 pt at 12 pt).</p>
<h2>New — 12 pt (display text size)</h2>${line(12)}
<h2>New — 10 pt (inline / small text)</h2>${line(10)}
<h2>Same shape with MathType's thin stroke (0.029 em) — 12 pt, for comparison</h2>${line(12, old)}
<h2>Same shape with MathType's thin stroke — 10 pt</h2>${line(10, old)}
<h2>New, enlarged ×4 (shape only)</h2><div class="big">${[H("\\mathbf{r}"), H("\\boldsymbol{\\omega}"), `${H("\\mathbf{r}")}_{P/O}`, H("\\mathbf{F}")].map((l) => renderSvg(parseLatex(l).root, { fonts, display: true, sizePt: 48 }).svg).join("")}</div>
</body></html>`;
const file = join(out, "harpoon-sheet.html");
writeFileSync(file, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 640 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(file).href);
await page.screenshot({ path: join(out, "harpoon-sheet-100pct.png"), fullPage: true });
await page.pdf({ path: join(out, "harpoon-print-A4.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log(`written to ${out}: harpoon-sheet-100pct.png, harpoon-print-A4.pdf`);
