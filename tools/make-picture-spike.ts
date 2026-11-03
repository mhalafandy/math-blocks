/**
 * Test document for "picture mode": MathBlocks typesets the equations itself and places them in
 * Word as vector pictures (like MathType), in three fonts, with MathType's numbered layout and
 * inline equations in text. Run: pnpm tsx tools/make-picture-spike.ts <out.docx>
 * (internally re-runs itself once per font: MathJax loads one font per process).
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { buildDocx, heading, paragraph, pictureRun, textRun, type MediaPart } from "@mathblocks/ooxml";

const FONT_PT = 12;
const TEXT_WIDTH = 9026;
const EQUATIONS = {
  display: "f(\\vec{\\mathbf{r}})=\\frac{-\\mu}{r^{2}}\\vec{\\mathbf{r}}",
  display2: "\\mathbf{c}_{sf}=\\int_{-d_s}^{0}\\int_{-y-d_s}^{y+d_s}\\sigma_{sf}\\,\\mathbf{r}\\,\\mathrm{d}z\\,\\mathrm{d}y=\\begin{bmatrix}0&0&0\\end{bmatrix}^{T}",
  inline1: "\\mu",
  inline2: "r=\\lvert\\vec{\\mathbf{r}}\\rvert",
  inline3: "\\frac{1}{2}mv^{2}",
};

interface Rendered {
  svg: string;
  widthPt: number;
  heightPt: number;
  depthPt: number;
}

if (process.argv[2] === "--render") {
  // Child mode: render all equations with one font, print JSON.
  const MathJax = (await import("@mathjax/src")).default;
  await MathJax.init({ loader: { load: ["input/tex", "output/svg"] }, output: { font: process.argv[3], fontCache: "none" } });
  const out: Record<string, Rendered> = {};
  for (const [k, latex] of Object.entries(EQUATIONS)) {
    const display = k.startsWith("display");
    const node = await MathJax.tex2svgPromise(latex, { display });
    let svg: string = MathJax.startup.adaptor.outerHTML(node);
    svg = svg.slice(svg.indexOf("<svg"), svg.lastIndexOf("</svg>") + 6);
    const vb = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg)!;
    const heightEx = Number(/height="([\d.]+)ex"/.exec(svg)![1]);
    void heightEx;
    const vbY = Number(vb[2]);
    const vbH = Number(vb[4]);
    const widthPt = (Number(vb[3]) / 1000) * FONT_PT;
    const heightPt = (vbH / 1000) * FONT_PT;
    // The viewBox starts at -ascent (1000 units per em): what lies below y = 0 is the depth.
    // Lowering the picture by it puts the equation's baseline on the text baseline (like MathType).
    const depthPt = ((vbY + vbH) / 1000) * FONT_PT;
    svg = svg
      .replace(/ style="[^"]*"/, "")
      .replace(/width="[\d.]+ex"/, `width="${widthPt.toFixed(2)}pt"`)
      .replace(/height="[\d.]+ex"/, `height="${heightPt.toFixed(2)}pt"`)
      .replace(/currentColor/g, "#000000")
      .replace(/ data-[a-z-]+="[^"]*"/g, "");
    out[k] = { svg: `<?xml version="1.0" encoding="UTF-8"?>${svg}`, widthPt, heightPt, depthPt };
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

const require = createRequire(import.meta.url);
const { chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"));
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 4 * (96 / 72) });
const raster = async (svg: string) => {
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace(/^<\?xml[^>]*\?>/, "")}</body></html>`);
  return new Uint8Array(await page.locator("body > svg").first().screenshot({ omitBackground: true }));
};

const media: MediaPart[] = [];
let n = 0;
async function pic(r: Rendered, label: string) {
  n++;
  media.push({ rId: `rIdS${n}`, name: `eq${n}.svg`, data: new TextEncoder().encode(r.svg) });
  media.push({ rId: `rIdP${n}`, name: `eq${n}.png`, data: await raster(r.svg) });
  return pictureRun({ pngRId: `rIdP${n}`, svgRId: `rIdS${n}`, widthPt: r.widthPt, heightPt: r.heightPt, depthPt: r.depthPt, id: n, name: `Equation ${n}`, description: label });
}

const t = (s: string) => `<w:r><w:t xml:space="preserve">${s}</w:t></w:r>`;
const fld = (instr: string, shown: string) => `<w:fldSimple w:instr=" ${instr} "><w:r><w:t>${shown}</w:t></w:r></w:fldSimple>`;
const numbered = (content: string, num: number) =>
  `<w:p><w:pPr><w:tabs><w:tab w:val="center" w:pos="${TEXT_WIDTH / 2}"/><w:tab w:val="right" w:pos="${TEXT_WIDTH}"/></w:tabs><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:tab/></w:r>${content}<w:r><w:tab/></w:r>` +
  `<w:bookmarkStart w:id="${num}" w:name="_eqP${num}"/>${t("(1.")}${fld("SEQ PicEq \\* ARABIC", String(num))}${t(")")}<w:bookmarkEnd w:id="${num}"/></w:p>`;

const FONTS: [string, string][] = [
  ["mathjax-stix2", "1. STIX Two (Times-like, closest to MathType)"],
  ["mathjax-termes", "2. TeX Gyre Termes (Times)"],
  ["mathjax-newcm", "3. New Computer Modern (LaTeX look)"],
];

const p: string[] = [
  heading("Picture mode: MathBlocks draws the equations itself"),
  paragraph(textRun("Each equation below is typeset by MathBlocks and placed as a sharp vector picture, like MathType. Same layout as your thesis: centred, number at the right margin. Which font looks best? Zoom to 200–400% to check sharpness.", { italic: true, color: "666666", size: 20 })),
];
let num = 0;
const self = fileURLToPath(import.meta.url);
for (const [font, title] of FONTS) {
  const json = execFileSync(process.execPath, [...process.execArgv, self, "--render", font], { maxBuffer: 64 << 20 }).toString();
  const r = JSON.parse(json) as Record<string, Rendered>;
  p.push(heading(title, 2));
  p.push(numbered(await pic(r.display!, "display"), ++num));
  p.push(paragraph(`${t("where ")}${await pic(r.inline1!, "inline")}${t(" is the gravitational parameter, ")}${await pic(r.inline2!, "inline")}${t(" the distance, and ")}${await pic(r.inline3!, "inline")}${t(" the kinetic energy per unit mass.")}`));
  p.push(numbered(await pic(r.display2!, "display"), ++num));
}
p.push(heading("Reference test", 2));
p.push(paragraph(`${t("Equation ")}${fld("REF _eqP1 \\h", "(1.1)")}${t(" should update with Ctrl+A, F9.")}`));

await browser.close();
writeFileSync(process.argv[2] ?? "picture-test.docx", buildDocx({ paragraphs: p, media, bodyFont: "Calibri" }));
console.log("written", process.argv[2], n, "pictures");
