/// <reference lib="dom" />
/**
 * Review sheets for Phase 1b (PNG): palette contact sheets (light, dark), STIX/MT Extra fallback
 * variants, and the accent/bold/transpose test cases before/after 1a+ at 12 pt and 10 pt, 1× and 3×.
 * Uses Times New Roman + Symbol (+ MT Extra) on Windows, Liberation Serif elsewhere.
 * Run: pnpm tsx tools/review-sheets.ts <outDir>
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { parseLatex } from "@mathblocks/math-latex";
import { CLASSIC, glyphSource, loadFont, renderSvg, type FontSet, type RenderStyle } from "@mathblocks/math-render";
import * as before from "../packages/math-render/before/index";
import { CATEGORIES, ENTRIES, STRUCTURES, type PaletteEntry } from "../app/src/lib/palette";
import { renderTile, STRUCTURE_CELL, SYMBOL_CELL, tileLatex } from "../app/src/lib/tiles";

const out = process.argv[2] ?? "review-sheets";
mkdirSync(join(out, "accents"), { recursive: true });

const require = createRequire(new URL("../app/package.json", import.meta.url));
const STIX = require.resolve("@fontsource/stix-two-math/files/stix-two-math-latin-400-normal.woff", { paths: [fileURLToPath(new URL("../packages/math-render/", import.meta.url))] });
const WIN = "C:/Windows/Fonts/";
const windows = existsSync(WIN + "times.ttf");
const L = "/usr/share/fonts/truetype/liberation/LiberationSerif-";
const text = windows ? ["times.ttf", "timesi.ttf", "timesbd.ttf", "timesbi.ttf"].map((f) => WIN + f) : ["Regular", "Italic", "Bold", "BoldItalic"].map((f) => `${L}${f}.ttf`);
const fonts: FontSet = {
  regular: loadFont(readFileSync(text[0]!)),
  italic: loadFont(readFileSync(text[1]!)),
  bold: loadFont(readFileSync(text[2]!)),
  boldItalic: loadFont(readFileSync(text[3]!)),
  math: loadFont(readFileSync(STIX)),
  ...(windows && existsSync(WIN + "symbol.ttf") ? { symbol: loadFont(readFileSync(WIN + "symbol.ttf")) } : {}),
};
const mtExtraPath = [WIN + "mtextra.ttf", WIN + "MTEXTRA.TTF"].find((p) => existsSync(p));
const extraFonts: FontSet | null = mtExtraPath ? { ...fonts, extra: loadFont(readFileSync(mtExtraPath)) } : null;
const fontNote = windows ? `Times New Roman + Symbol${mtExtraPath ? " + MT Extra" : ""} (Windows)` : "Liberation Serif standing in for Times New Roman; no Symbol font (Linux preview)";

const STYLE: RenderStyle = { ...CLASSIC, useExtraFont: false };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// ------------------------------------------------------------------ contact sheets

const isSymbolCell = (e: PaletteEntry) => (e.kind === "symbol" || e.kind === "operator-name") && !/#0|#\?/.test(e.item.latex) && e.item.latex.length < 40;

function sheet(dark: boolean): string {
  const fg = dark ? "#e6e6ea" : "#1d1d22";
  const bg = dark ? "#1b1c20" : "#ffffff";
  const line = dark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.07)";
  const axis = dark ? "rgba(120,160,255,.28)" : "rgba(40,90,220,.18)";
  const sections: string[] = [];
  for (const cat of [...CATEGORIES, ...STRUCTURES]) {
    const list = ENTRIES.filter((e) => e.categories.includes(cat.id as never));
    if (!list.length) continue;
    const symbols = list.filter(isSymbolCell);
    const structures = list.filter((e) => !isSymbolCell(e));
    const grid = (items: PaletteEntry[], cell: typeof SYMBOL_CELL) =>
      `<div class="grid">${items
        .map((e) => {
          const t = renderTile(e.item.latex, cell, { fonts, style: STYLE });
          return `<div class="cell${t.scale < 1 ? " shrunk" : ""}" style="width:${cell.w}px;height:${cell.h}px" title="${esc(e.name)} — ${esc(e.item.latex)}">${t.svg}</div>`;
        })
        .join("")}</div>`;
    sections.push(`<h2>${esc(cat.label)} <small>${list.length}</small></h2>${symbols.length ? grid(symbols, SYMBOL_CELL) : ""}${structures.length ? grid(structures, STRUCTURE_CELL) : ""}`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:24px;background:${bg};color:${fg};font:13px system-ui,sans-serif;width:1180px}
h1{font-size:18px;margin:0 0 4px} p{margin:0 0 14px;opacity:.7}
h2{font-size:13px;font-weight:600;margin:18px 0 6px;opacity:.85} h2 small{opacity:.5;font-weight:400}
.grid{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
.cell{position:relative;border:1px solid ${line};border-radius:4px;background:linear-gradient(to bottom,transparent calc(50% - .5px),${axis} calc(50% - .5px),${axis} calc(50% + .5px),transparent calc(50% + .5px))}
.cell.shrunk{outline:1px dashed rgba(220,120,0,.5)}
.cell svg{display:block}
</style></head><body><h1>Palette tiles — ${dark ? "dark" : "light"} theme</h1>
<p>${ENTRIES.length} entries drawn by math-render in the Classic Word style. ${esc(fontNote)}. The faint line in each cell is the math axis (tiles are centred on it); a dashed outline marks a tile scaled down to fit. Dotted squares are empty slots.</p>
${sections.join("")}</body></html>`;
}

// ------------------------------------------------------------------ STIX / MT Extra variants

type Ch = { ch: string; kind: "ident" | "number" | "operator" | "text" };
function stixChars(): { ch: string; entry: PaletteEntry }[] {
  const seen = new Map<string, PaletteEntry>();
  for (const e of ENTRIES) {
    const visit = (v: unknown) => {
      if (!v || typeof v !== "object") return;
      if (Array.isArray(v)) return v.forEach(visit);
      const n = v as { kind?: string; text?: string; op?: string; variant?: string };
      if ((n.kind === "operator" || n.kind === "ident") && n.text && !n.variant)
        for (const ch of n.text) if (glyphSource(ch, n.kind as Ch["kind"], fonts, CLASSIC) === "math" && !seen.has(ch)) seen.set(ch, e);
      for (const [k, x] of Object.entries(n)) if (k !== "meta" && typeof x === "object") visit(x);
    };
    visit(parseLatex(tileLatex(e.item.latex).replace(/\u2B1A/g, "x")).root);
  }
  return [...seen].map(([ch, entry]) => ({ ch, entry }));
}

function variantsSheet(dark: boolean): string {
  const fg = dark ? "#e6e6ea" : "#1d1d22";
  const bg = dark ? "#1b1c20" : "#ffffff";
  const line = dark ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.1)";
  const cols: { label: string; style: RenderStyle; fonts: FontSet | null }[] = [
    { label: "STIX 100 % (before)", style: { ...STYLE, fallbackScale: 1, fallbackThin: 0 }, fonts },
    { label: "1 · STIX 94 %", style: { ...STYLE, fallbackScale: 0.94, fallbackThin: 0 }, fonts },
    { label: "2 · STIX 94 % + thinned", style: { ...STYLE, fallbackScale: 0.94, fallbackThin: 0.01 }, fonts },
    { label: "3 · MT Extra", style: { ...STYLE, useExtraFont: true }, fonts: extraFonts },
  ];
  const ref = (ch: string) => `a${ch}b`;
  const rows = stixChars()
    .map(({ ch, entry }) => {
      const cells = cols
        .map((c) =>
          c.fonts
            ? `<td>${renderTile(`a${entry.item.glyph && [...entry.item.glyph].length === 1 ? ch : ch}b`, { w: 74, h: 40, fontPx: 22, pad: 3 }, { fonts: c.fonts, style: c.style }).svg}</td>`
            : `<td class="na">not installed</td>`,
        )
        .join("");
      void ref;
      return `<tr><th>${esc(ch)} <small>U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}</small></th>${cells}<td class="name">${esc(entry.name)}</td></tr>`;
    })
    .join("");
  const timesRef = renderTile("a+b-c=d<e\\pm f\\times g\\leq h", { w: 300, h: 40, fontPx: 22, pad: 3 }, { fonts, style: STYLE }).svg;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:24px;background:${bg};color:${fg};font:13px system-ui,sans-serif}
h1{font-size:18px;margin:0 0 4px} p{margin:0 0 12px;opacity:.7;max-width:900px}
table{border-collapse:collapse} td,th{border:1px solid ${line};padding:2px 8px;text-align:left} th{font-weight:500;white-space:nowrap}
th small{opacity:.55} td.na{opacity:.5;font-style:italic} td.name{opacity:.6;font-size:12px} thead th{font-size:12px;opacity:.8}
</style></head><body><h1>Symbols Times/Symbol lack — ${dark ? "dark" : "light"}</h1>
<p>Each symbol between a and b (Times letters), drawn four ways. ${esc(fontNote)}. Times/Symbol reference weight: ${timesRef}</p>
<table><thead><tr><th>Symbol</th>${cols.map((c) => `<th>${esc(c.label)}</th>`).join("")}<th>Entry</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

// ------------------------------------------------------------------ accent / bold / transpose cases

interface Case {
  id: string;
  label: string;
  before: string;
  after: string;
  mathtype?: string;
}
const BASES: [string, string][] = [["a", "a"], ["r", "r"], ["v", "v"], ["x", "x"], ["\\omega", "omega"], ["b", "b"], ["h", "h"], ["\\ell", "ell"], ["F", "F"], ["H", "H"], ["I", "I"], ["\\alpha", "alpha"], ["\\sigma", "sigma"], ["\\tau", "tau"]];
const bold = (b: string) => (b.startsWith("\\") ? `\\boldsymbol{${b}}` : `\\mathbf{${b}}`);
const cases: Case[] = [];
for (const [b, name] of BASES) {
  const row = (B: string) => [`\\overrightharpoon{${B}}`, `\\vec{${B}}`, `\\hat{${B}}`, `\\dot{${B}}`, `\\ddot{${B}}`, `\\bar{${B}}`, `\\tilde{${B}}`, `\\check{${B}}`].join("\\quad ");
  cases.push({ id: `base-${name}`, label: `${b}: harpoon, arrow, hat, dot, ddot, bar, tilde, check`, before: row(b), after: row(b) });
  cases.push({ id: `bold-${name}`, label: `bold ${b}`, before: row(bold(b)), after: row(bold(b)) });
}
cases.push(
  { id: "scripts", label: "with scripts: r_{P/O}, ω^{B/N}, H_c, c_1 (accent covers the base only)", before: "\\overrightharpoon{\\mathbf{r}}_{P/O}\\quad\\overrightharpoon{\\boldsymbol{\\omega}}^{B/N}\\quad\\overrightharpoon{\\mathbf{H}}_{c}\\quad\\overrightharpoon{\\mathbf{c}}_{1}", after: "\\overrightharpoon{\\mathbf{r}}_{P/O}\\quad\\overrightharpoon{\\boldsymbol{\\omega}}^{B/N}\\quad\\overrightharpoon{\\mathbf{H}}_{c}\\quad\\overrightharpoon{\\mathbf{c}}_{1}" },
  { id: "transpose", label: "transposes: A^T, C^T_ba, x^T y (before: bold T, after: upright T)", before: "\\mathbf{A}^{\\mathbf{T}}\\quad\\mathbf{C}^{\\mathbf{T}}_{ba}\\quad\\mathbf{x}^{\\mathbf{T}}\\mathbf{y}", after: "\\mathbf{A}^{\\mathrm{T}}\\quad\\mathbf{C}^{\\mathrm{T}}_{ba}\\quad\\mathbf{x}^{\\mathrm{T}}\\mathbf{y}" },
  { id: "A1", label: "Appendix A (A.1)", before: "\\overrightharpoon{\\mathbf{c}}_{i}=\\int\\limits_{\\mathbf{B}_{i}}\\overrightharpoon{\\mathbf{r}}_{i}\\,\\mathrm{d}m", after: "\\overrightharpoon{\\mathbf{c}}_{i}=\\int\\limits_{\\mathbf{B}_{i}}\\overrightharpoon{\\mathbf{r}}_{i}\\,\\mathrm{d}m", mathtype: "A1" },
  { id: "A2", label: "Appendix A (A.2)", before: "\\overrightharpoon{\\mathbf{c}}_{1}=\\vec{\\mathbf{S}}^{\\mathbf{T}}\\mathbf{c}_{1}=\\vec{\\mathbf{S}}^{\\mathbf{T}}\\int_{\\mathbf{B}_{1}}\\mathbf{r}\\,\\mathrm{d}m", after: "\\overrightharpoon{\\mathbf{c}}_{1}=\\vec{\\mathbf{S}}^{\\mathrm{T}}\\mathbf{c}_{1}=\\vec{\\mathbf{S}}^{\\mathrm{T}}\\int_{\\mathbf{B}_{1}}\\mathbf{r}\\,\\mathrm{d}m", mathtype: "A2" },
);

function casesPage(): string {
  const items: string[] = [];
  for (const c of cases) {
    for (const [ver, latex] of [["before", c.before], ["after", c.after]] as const) {
      for (const [mode, pt] of [["display", 12], ["inline", 10]] as const) {
        const r = (ver === "before" ? before.renderSvg : renderSvg)(parseLatex(latex).root, { fonts, style: ver === "before" ? before.CLASSIC : STYLE, display: mode === "display", sizePt: pt } as never);
        const svg = r.svg.replace(/width="([\d.]+)pt" height="([\d.]+)pt"/, (_, w: string, h: string) => `width="${((+w * 96) / 72).toFixed(2)}px" height="${((+h * 96) / 72).toFixed(2)}px"`);
        const html =
          mode === "inline"
            ? `<p style="font:${pt}pt 'Times New Roman','Liberation Serif',serif;margin:0">where&nbsp;<span style="display:inline-block;vertical-align:-${((r.depthPt * 96) / 72).toFixed(2)}px">${svg}</span>&nbsp;is the</p>`
            : svg;
        items.push(`<div class="case" id="${c.id}-${ver}-${pt}">${html}</div>`);
      }
    }
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:8px;background:#fff;color:#000}.case{display:inline-block;padding:6px 10px;margin:4px;background:#fff}</style></head><body>${items.join("")}</body></html>`;
}

// ------------------------------------------------------------------ screenshots

const browser = await chromium.launch();
const dir = mkdtempSync(join(tmpdir(), "mb-sheets-"));
async function shoot(html: string, file: string, scale = 2) {
  const page = await browser.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: scale });
  const f = join(dir, `${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(f, html);
  await page.goto(pathToFileURL(f).href);
  await page.screenshot({ path: join(out, file), fullPage: true });
  await page.close();
}
await shoot(sheet(false), "palette-light.png");
await shoot(sheet(true), "palette-dark.png");
await shoot(variantsSheet(false), "fallback-variants-light.png");
await shoot(variantsSheet(true), "fallback-variants-dark.png");
for (const scale of [1, 3]) {
  const page = await browser.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: scale });
  const f = join(dir, `cases-${scale}.html`);
  writeFileSync(f, casesPage());
  await page.goto(pathToFileURL(f).href);
  for (const c of cases) for (const ver of ["before", "after"]) for (const pt of [12, 10]) await page.locator(`#${c.id}-${ver}-${pt}`).screenshot({ path: join(out, "accents", `${c.id}-${ver}-${pt}pt-${scale}x.png`) });
  await page.close();
}
writeFileSync(join(out, "cases.json"), JSON.stringify({ fonts: fontNote, cases: cases.map(({ id, label, mathtype }) => ({ id, label, mathtype })) }, null, 1));
await browser.close();
console.log(`review sheets → ${out} (${fontNote})`);
