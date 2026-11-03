/**
 * Converts a MathType document to MathBlocks pictures in the Classic style, for comparing with
 * the original in Word. Run: pnpm tsx tools/make-classic-sample.ts <in.docx> <out.docx> [sizePt]
 * Fonts: Times New Roman when available (Windows), else Liberation Serif (same metrics).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { parseLatex } from "@mathblocks/math-latex";
import { convertDocx, type PictureData } from "@mathblocks/mathtype";
import { CLASSIC, loadFont, renderSvg, type FontSet } from "@mathblocks/math-render";

const [input, output, size] = process.argv.slice(2);
if (!input || !output) throw new Error("usage: make-classic-sample <in.docx> <out.docx> [sizePt]");
const sizePt = Number(size ?? 12);

const require = createRequire(import.meta.url);
function textFonts(): [string, string, string, string] {
  const win = "C:\\Windows\\Fonts\\";
  if (existsSync(win + "times.ttf")) return [win + "times.ttf", win + "timesi.ttf", win + "timesbd.ttf", win + "timesbi.ttf"];
  const l = "/usr/share/fonts/truetype/liberation/LiberationSerif-";
  return [l + "Regular.ttf", l + "Italic.ttf", l + "Bold.ttf", l + "BoldItalic.ttf"];
}
const [r, i, b, bi] = textFonts();
const stix = join(dirname(require.resolve("@fontsource/stix-two-math/package.json", { paths: [join(process.cwd(), "packages/math-render")] })), "files", "stix-two-math-latin-400-normal.woff");
const fonts: FontSet = {
  regular: loadFont(readFileSync(r)),
  italic: loadFont(readFileSync(i)),
  bold: loadFont(readFileSync(b)),
  boldItalic: loadFont(readFileSync(bi)),
  math: loadFont(readFileSync(stix)),
};

const bytes = new Uint8Array(readFileSync(input));
const plan = convertDocx(bytes).equations;

const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"));
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 4 * (96 / 72) });
const pictures: PictureData[] = [];
for (const e of plan) {
  if (!e.latex) {
    pictures.push(null as unknown as PictureData);
    continue;
  }
  const res = renderSvg(parseLatex(e.latex).root, { fonts, style: CLASSIC, display: e.display, sizePt });
  await page.setContent(`<html><body style="margin:0;background:transparent">${res.svg}</body></html>`);
  const png = new Uint8Array(await page.locator("svg").first().screenshot({ omitBackground: true }));
  pictures.push({ svg: res.svg, png, widthPt: res.widthPt, heightPt: res.heightPt, depthPt: res.depthPt });
}
await browser.close();

let k = 0;
const out = convertDocx(bytes, { picture: () => pictures[k++] ?? null });
writeFileSync(output, out.docx);
console.log(`${out.converted} equations as MathBlocks Classic pictures → ${output}`);
