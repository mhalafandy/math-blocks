/// <reference lib="dom" />
/**
 * Runs the print check's analysis on a PDF the self-test produced ("print check.pdf"), outside Word: the
 * app's analysePrint through the dev server, Liberation Serif standing in for Times New Roman. Writes the
 * contact sheet and prints the flag counts and the flagged entries.
 *
 * Start the app's dev server first, then:
 *   pnpm tsx tools/print-check-analyse.ts <print check.pdf> <out dir> [size pt] [url]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { printEntries } from "../app/src/lib/printCheck";

const [pdfPath, outDir, sizeArg, urlArg] = process.argv.slice(2);
if (!pdfPath || !outDir) throw new Error("usage: print-check-analyse.ts <pdf> <out dir> [size pt] [url]");
const sizePt = Number(sizeArg ?? 12);
const url = urlArg ?? "http://localhost:1420/";
mkdirSync(outDir, { recursive: true });
const L = "/usr/share/fonts/truetype/liberation/LiberationSerif-";
const FONT_FILES: Record<string, string> = { "times.ttf": "Regular", "timesi.ttf": "Italic", "timesbd.ttf": "Bold", "timesbi.ttf": "BoldItalic" };

const browser = await chromium.launch();
const page = await browser.newPage();
await page.route("**/__preview-fonts/*", async (route) => {
  const name = route.request().url().split("/").pop()!;
  const f = FONT_FILES[name];
  const sym = "/usr/share/fonts/opentype/urw-base35/StandardSymbolsPS.otf";
  if (f && existsSync(`${L}${f}.ttf`)) await route.fulfill({ body: readFileSync(`${L}${f}.ttf`), contentType: "font/ttf" });
  else if (name === "symbol.ttf" && existsSync(sym)) await route.fulfill({ body: readFileSync(sym), contentType: "font/otf" });
  else await route.fulfill({ status: 404, body: "" });
});
await page.addInitScript(() => localStorage.setItem("mathblocks.previewFonts", "1"));
page.on("pageerror", (e) => console.log("page error:", e.message));
await page.goto(url);
await page.evaluate("window.__name = (f) => f");
await page.waitForSelector("math-field");
const entries = printEntries();
const res = await page.evaluate(
  async ([b64, list, size]) => {
    const bytes = Uint8Array.from(atob(b64 as string), (c) => c.charCodeAt(0));
    const { analysePrint, contactSheet } = await import("/src/lib/printCheckPdf.ts" as string);
    const { loadFonts, classicStyle } = await import("/src/lib/render.ts" as string);
    const { activeStyle } = await import("/src/lib/docStyle.ts" as string);
    const { renderTile, SYMBOL_CELL, STRUCTURE_CELL } = await import("/src/lib/tiles.ts" as string);
    const fonts = await loadFonts();
    const { rows, pages } = await analysePrint(bytes, list, { fonts, style: classicStyle(), mathStyle: activeStyle(), sizePt: size, save: async () => undefined });
    for (const r of rows) {
      try {
        r.tile = renderTile(r.entry.latex, /\\begin|\\frac|\\sqrt|\\sum|\\int|[_^]/.test(r.entry.latex) ? STRUCTURE_CELL : SYMBOL_CELL, { fonts, style: classicStyle(), mathStyle: activeStyle() }).svg;
      } catch {
        r.tile = "";
      }
    }
    const brief = rows.map((r: { entry: { i: number; name: string; latex: string }; inline: { flags: string[]; pdf: unknown; expected: unknown }; display: { flags: string[]; pdf: unknown; expected: unknown } }) => ({
      i: r.entry.i,
      name: r.entry.name,
      latex: r.entry.latex,
      inline: r.inline.flags,
      display: r.display.flags,
      ip: r.inline.pdf,
      ie: r.inline.expected,
      dp: r.display.pdf,
      de: r.display.expected,
    }));
    return { pages, html: contactSheet(rows, "Print check (analysed outside Word)"), brief };
  },
  [readFileSync(pdfPath).toString("base64"), entries, sizePt] as const,
);
await browser.close();
writeFileSync(join(outDir, "contact-sheet.html"), res.html);
writeFileSync(join(outDir, "rows.json"), JSON.stringify(res.brief, null, 1));
type Brief = { i: number; latex: string; inline: string[]; display: string[] };
const brief = res.brief as Brief[];
const counts: Record<string, number> = {};
for (const r of brief) for (const f of new Set([...r.inline.map((x) => `inline ${x}`), ...r.display.map((x) => `display ${x}`)])) counts[f] = (counts[f] ?? 0) + 1;
console.log(`${res.pages} pages, ${brief.length} entries; flags:`, counts);
for (const r of brief.filter((x) => x.inline.length || x.display.length).slice(0, 60)) console.log(`E${r.i} ${r.latex}: inline [${r.inline.join(", ")}] display [${r.display.join(", ")}]`);
