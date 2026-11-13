/// <reference lib="dom" />
/**
 * Checks the print check's PDF side without Word: a PDF laid out like Word's test document ("E12: ab
 * ⟨equation⟩ cd", then "D12" and the display equation) is made in Chromium from MathBlocks' own drawings,
 * with planted defects — one equation left out, one enlarged, one lowered off the baseline, one cut in
 * half — and the app's analysePrint (through the dev server) must flag exactly those.
 *
 * Start the app's dev server first, then: pnpm tsx tools/print-check-harness.ts [url]
 */
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { parseLatex } from "@mathblocks/math-latex";
import { CLASSIC, loadFont, renderSvg, type FontSet } from "@mathblocks/math-render";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { printEntries } from "../app/src/lib/printCheck";

const url = process.argv[2] ?? "http://localhost:1420/";
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
const all = printEntries();
// One of each kind of thing: a relation, a letter, a fraction, a root, a script, an accent, big operators,
// a kind, a matrix (the first palette entry starting with each).
const starts = ["\\leq", "\\alpha", "\\frac{", "\\sqrt{", "x^{", "\\hat{", "\\sum", "\\int", "\\pvec", "\\begin{bmatrix}", "\\lim", "\\left("];
const entries = starts.map((p) => all.find((e) => e.latex.startsWith(p))).filter((e): e is (typeof all)[number] => !!e).map((e, k) => ({ ...e, i: k + 1 }));
// Planted defects: index → what is wrong.
const PLANT: Record<number, string> = { 2: "empty", 4: "different size", 6: "off the baseline", 8: "clipped" };

const svgOf = (latex: string, display: boolean, scale = 1) => {
  const r = renderSvg(parseLatex(latex).root, { fonts, style: { ...CLASSIC, color: "#000" }, display, sizePt: SIZE * scale, margin: 0 });
  return { svg: r.svg, depth: r.depthPt, h: r.heightPt, w: r.widthPt };
};
const lines = entries
  .map((e) => {
    const p = PLANT[e.i];
    const s = svgOf(e.latex, false, p === "different size" ? 1.25 : 1);
    const lower = p === "off the baseline" ? 3 : 0;
    let inline = `<span style="display:inline-block;vertical-align:${-s.depth - lower}pt;line-height:0">${s.svg}</span>`;
    if (p === "empty") inline = `<span style="display:inline-block;width:${s.w}pt"></span>`;
    if (p === "clipped") inline = `<span style="display:inline-block;vertical-align:${-s.depth}pt;line-height:0;height:${s.h / 2}pt;overflow:hidden">${s.svg}</span>`;
    const d = svgOf(e.latex, true, p === "different size" ? 1.25 : 1);
    const disp = p === "empty" ? "&nbsp;" : d.svg;
    return `<p style="margin:0 0 6pt">E${e.i}: ab ${inline} cd</p><p style="margin:0">D${e.i}</p><p style="margin:4pt 0 14pt;text-align:center;line-height:0">${disp}</p>`;
  })
  .join("");
const html = `<!doctype html><html><head><style>@page{size:A4;margin:72pt}body{font:${SIZE}pt "Liberation Serif",serif}svg{overflow:visible}</style></head><body>${lines}</body></html>`;

const browser = await chromium.launch();
const maker = await browser.newPage();
await maker.setContent(html);
const pdf = await maker.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });

const page = await browser.newPage();
const FONT_FILES: Record<string, string> = { "times.ttf": "Regular", "timesi.ttf": "Italic", "timesbd.ttf": "Bold", "timesbi.ttf": "BoldItalic" };
await page.route("**/__preview-fonts/*", async (route) => {
  const f = FONT_FILES[route.request().url().split("/").pop()!];
  if (f && existsSync(`${L}${f}.ttf`)) await route.fulfill({ body: readFileSync(`${L}${f}.ttf`), contentType: "font/ttf" });
  else await route.fulfill({ status: 404, body: "" });
});
await page.addInitScript(() => localStorage.setItem("mathblocks.previewFonts", "1"));
page.on("pageerror", (e) => console.log("page error:", e.message));
await page.goto(url);
await page.evaluate("window.__name = (f) => f");
await page.waitForSelector("math-field");
const result = await page.evaluate(
  async ([b64, list]) => {
    const bytes = Uint8Array.from(atob(b64 as string), (c) => c.charCodeAt(0));
    const { analysePrint } = await import("/src/lib/printCheckPdf.ts" as string);
    const { loadFonts, classicStyle } = await import("/src/lib/render.ts" as string);
    const { activeStyle } = await import("/src/lib/docStyle.ts" as string);
    const fonts = await loadFonts();
    const { rows, pages } = await analysePrint(bytes, list, { fonts, style: classicStyle(), mathStyle: activeStyle(), sizePt: 12, save: async () => undefined });
    return { pages, rows: (rows as { entry: { i: number; latex: string }; inline: { flags: string[]; pdf: unknown }; display: { flags: string[] } }[]).map((r) => ({ i: r.entry.i, latex: r.entry.latex, inline: r.inline.flags, display: r.display.flags, found: !!r.inline.pdf })) };
  },
  [Buffer.from(pdf).toString("base64"), entries] as const,
);
await browser.close();

let bad = 0;
for (const r of result.rows) {
  const want = PLANT[r.i];
  const got = [...r.inline, ...r.display];
  const ok = want ? got.includes(want as never) : got.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? "ok " : "BAD"} E${r.i} ${r.latex}: inline [${r.inline.join(", ")}] display [${r.display.join(", ")}]${want ? ` (planted: ${want})` : ""}`);
}
console.log(`${result.pages} page(s); ${bad ? `${bad} wrong` : "every planted defect flagged, nothing else"}`);
process.exit(bad ? 1 : 0);
