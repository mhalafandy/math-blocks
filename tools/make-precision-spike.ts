/**
 * Precision-mode spike: renders the reference equations with MathJax 4 (New Computer Modern,
 * LaTeX-quality layout) as SVG pictures with PNG fallback, next to the native Word equation in
 * Latin Modern Math, so both can be compared in Word.
 *
 * Needs Playwright (pre-installed in the dev container) to rasterise the PNG fallbacks.
 * Run: pnpm spike:precision
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import MathJax from "@mathjax/src";
import { parseLatex } from "@mathblocks/math-latex";
import { toOmml, TUNED_PROFILE, withFont } from "@mathblocks/math-omml";
import { buildDocx, centeredParagraph, heading, paragraph, pictureRun, textRun, type MediaPart } from "@mathblocks/ooxml";
import { REFERENCE_EQUATIONS } from "../fixtures/reference-equations";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "spike", "m1-P-precision-vs-native.docx");
const FONT_PT = 11; // body text size: equations match the surrounding text
const PNG_SCALE = 4; // PNG fallback resolution multiplier

const require = createRequire(import.meta.url);
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright")) as typeof import("playwright");

interface Rendered {
  svg: string;
  widthPt: number;
  heightPt: number;
  depthPt: number;
}

await MathJax.init({
  loader: { load: ["input/tex", "output/svg"] },
  output: { font: "mathjax-newcm", fontCache: "none" },
});

/** Renders LaTeX to a standalone SVG sized in points, with its baseline depth. */
async function render(latex: string, display: boolean): Promise<Rendered> {
  const node = await MathJax.tex2svgPromise(latex, { display });
  let svg: string = MathJax.startup.adaptor.outerHTML(node);
  svg = svg.slice(svg.indexOf("<svg"), svg.lastIndexOf("</svg>") + 6);
  const vb = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg)!;
  const vbW = Number(vb[3]);
  const vbH = Number(vb[4]);
  const heightEx = Number(/height="([\d.]+)ex"/.exec(svg)![1]);
  const valignEx = Number(/vertical-align: ([-\d.]+)ex/.exec(svg)?.[1] ?? 0);
  const emPerEx = vbH / 1000 / heightEx;
  const widthPt = (vbW / 1000) * FONT_PT;
  const heightPt = (vbH / 1000) * FONT_PT;
  const depthPt = -valignEx * emPerEx * FONT_PT;
  svg = svg
    .replace(/ style="[^"]*"/, "")
    .replace(/width="[\d.]+ex"/, `width="${widthPt.toFixed(2)}pt"`)
    .replace(/height="[\d.]+ex"/, `height="${heightPt.toFixed(2)}pt"`)
    .replace(/currentColor/g, "#000000")
    .replace(/ data-[a-z-]+="[^"]*"/g, "");
  return { svg: `<?xml version="1.0" encoding="UTF-8"?>${svg}`, widthPt, heightPt, depthPt };
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: PNG_SCALE * (96 / 72) });
async function rasterise(r: Rendered): Promise<Uint8Array> {
  await page.setContent(`<html><body style="margin:0;background:transparent">${r.svg.replace(/^<\?xml[^>]*\?>/, "")}</body></html>`);
  const el = page.locator("body > svg").first();
  return new Uint8Array(await el.screenshot({ omitBackground: true }));
}

const media: MediaPart[] = [];
let n = 0;
async function picture(latex: string, display: boolean, label: string): Promise<string> {
  const r = await render(latex, display);
  n++;
  const svgName = `eq${n}.svg`;
  const pngName = `eq${n}.png`;
  media.push({ rId: `rIdS${n}`, name: svgName, data: new TextEncoder().encode(r.svg) });
  media.push({ rId: `rIdP${n}`, name: pngName, data: await rasterise(r) });
  return pictureRun({
    pngRId: `rIdP${n}`,
    svgRId: `rIdS${n}`,
    widthPt: r.widthPt,
    heightPt: r.heightPt,
    depthPt: display ? 0 : r.depthPt,
    id: n,
    name: `Equation ${n}`,
    description: `${label} | LaTeX: ${latex}`,
  });
}

const native = withFont(TUNED_PROFILE, "Latin Modern Math");
const grey = { color: "7F7F7F", size: 18 } as const;
const p: string[] = [];
p.push(paragraph(textRun("MathBlocks: native Word equations vs. precision rendering", { bold: true, size: 36 })));
p.push(paragraph(textRun("For each equation: first the native Word equation (Latin Modern Math, tuned spacing), then the same equation typeset by MathBlocks' precision engine (LaTeX-quality layout, New Computer Modern), inserted as a vector picture (SVG). Zoom in to 400% to compare. Pictures stay sharp at any zoom and in print.", { italic: true })));

for (const eq of REFERENCE_EQUATIONS.filter((e) => e.display)) {
  p.push(heading(eq.title, 2));
  p.push(paragraph(textRun("Native Word equation", grey)));
  p.push(paragraph(toOmml(parseLatex(eq.latex).root, { display: true, profile: native })));
  p.push(paragraph(textRun("Precision rendering", grey)));
  p.push(centeredParagraph(await picture(eq.latex, true, eq.title)));
}

p.push(heading("Inline equations", 2));
p.push(paragraph(textRun("Native: the kinetic energy ") + toOmml(parseLatex("E_k = \\tfrac{1}{2} m v^2").root, { profile: native }) + textRun(" of a body moving at speed ") + toOmml(parseLatex("v").root, { profile: native }) + textRun(" on an orbit with ") + toOmml(parseLatex("v^2=\\mu\\left(\\frac{2}{r}-\\frac{1}{a}\\right)").root, { profile: native }) + textRun(".")));
p.push(paragraph(textRun("Precision: the kinetic energy ") + (await picture("E_k = \\tfrac{1}{2} m v^2", false, "inline")) + textRun(" of a body moving at speed ") + (await picture("v", false, "inline")) + textRun(" on an orbit with ") + (await picture("v^2=\\mu\\left(\\frac{2}{r}-\\frac{1}{a}\\right)", false, "inline")) + textRun(".")));

await browser.close();
writeFileSync(OUT, buildDocx({ paragraphs: p, media, mathFont: "Latin Modern Math", bodyFont: "Calibri" }));
console.log(`wrote ${OUT} (${n} pictures)`);
