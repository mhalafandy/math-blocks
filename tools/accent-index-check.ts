/// <reference lib="dom" />
/**
 * Indices after accent-style vectors in the real visual editor (MathLive, headless Chromium). MathLive lays a
 * script after a stretchy accent (\overrightharpoon, \overrightarrow, \widehat, \overline…) out as a limit,
 * under the letter; the editor form (lib/kinds.ts toEditorLatex → lib/editorAccents.ts) groups the accent so the
 * script sits at the normal place. For each case, on the editor's atoms (getElementInfo):
 * - the index's left edge is right of the accented letter's right edge (not under it);
 * - the index is raised into the letter's height and sits lower (subscript) or higher (superscript);
 * - the harpoon's width does not depend on the index;
 * - in a run of vectors with long indices, no vector overlaps the previous index.
 * The stored LaTeX is unchanged (fromEditorLatex gives back the input).
 *
 * Run: pnpm tsx tools/accent-index-check.ts [screenshot folder]  (exit code 1 on any failure)
 */
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { fromEditorLatex, toEditorLatex } from "../app/src/lib/kinds";

const shots = process.argv[2];
const mathlive = pathToFileURL(realpathSync(fileURLToPath(new URL("../app/node_modules/mathlive/mathlive.min.mjs", import.meta.url)))).href;
const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 300 } });
page.on("pageerror", (e) => console.log("page error:", e.message));
const html = join(mkdtempSync(join(tmpdir(), "mb-accidx-")), "page.html");
writeFileSync(html, `<!doctype html><html><body style="margin:20px"><math-field id="mf" style="font-size:48px"></math-field><script type="module">import "${mathlive}"; window.__ready = true;</script></body></html>`);
await page.goto(pathToFileURL(html).href);
await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 30000 });
await page.evaluate("window.__name = (f) => f");

interface Atom {
  offset: number;
  latex: string;
  depth: number;
  l: number;
  r: number;
  t: number;
  b: number;
}

/** Every atom of the editor (in offset order) with its bounds. */
async function atoms(latex: string): Promise<Atom[]> {
  await page.evaluate((l) => {
    (document.getElementById("mf") as unknown as { value: string }).value = l;
  }, latex);
  await page.waitForTimeout(150);
  return page.evaluate(() => {
    const mf = document.getElementById("mf") as unknown as { lastOffset: number; getElementInfo: (o: number) => { latex?: string; depth?: number; bounds?: DOMRect } | undefined };
    const out: Atom[] = [];
    for (let i = 0; i <= mf.lastOffset; i++) {
      const e = mf.getElementInfo(i);
      if (e?.bounds && e.latex) out.push({ offset: i, latex: e.latex, depth: e.depth ?? 0, l: e.bounds.left, r: e.bounds.right, t: e.bounds.top, b: e.bounds.bottom });
    }
    return out;
  });
}

/** The one character an atom stands for (\mathbf{r} → r, \omega → ω), or null for a bigger atom. */
function char(latex: string): string | null {
  let s = latex;
  for (;;) {
    // Fonts, kind wrappers and one-glyph accents (MathLive gives \vec{x} as one atom).
    const m = /^(?:\\class\{[^{}]*\}|\{?\\(?:mathbf|boldsymbol|bm|mathsf|mathrm|mathit|mathbfit|mathsfit|vec|hat|bar|tilde|dot|ddot|check|overrightharpoon|overrightarrow|widehat|overline))\{(.*)\}\}?$/.exec(s);
    if (!m) break;
    s = m[1]!;
  }
  if (s.startsWith("{") && s.endsWith("}")) s = s.slice(1, -1);
  const greek: Record<string, string> = { "\\omega": "ω", "\\alpha": "α" };
  s = greek[s] ?? s;
  return [...s].length === 1 ? s : null;
}

const ACCENT = /^\{?\\(overrightharpoon|overleftharpoon|overrightarrow|overleftarrow|overleftrightarrow|widehat|widetilde|overline|vec|hat|bar|tilde|dot|ddot|check)\b/;
const failures: string[] = [];
const fail = (what: string) => {
  failures.push(what);
  console.log(`FAIL  ${what}`);
};

interface Vec {
  base: string;
  script: string;
  sup?: boolean;
}

/** Checks each vector of an equation (in order) and returns the accent widths. */
async function checkCase(stored: string, vecs: Vec[]): Promise<number[]> {
  const editor = toEditorLatex(stored);
  const back = fromEditorLatex(editor).latex;
  if (process.env.DEBUG) console.log(stored, editor, JSON.stringify((await atoms(editor)).map((a) => [a.latex, Math.round(a.l), Math.round(a.r), Math.round(a.t), Math.round(a.b)])));
  if (back !== stored) fail(`${stored}: the stored LaTeX changes through the editor (${back})`);
  const as = await atoms(editor);
  let from = 0;
  const widths: number[] = [];
  let prevScriptRight = -Infinity;
  for (const v of vecs) {
    const bi = as.findIndex((a, i) => i >= from && char(a.latex) === v.base);
    if (bi < 0) {
      fail(`${stored}: letter ${v.base} not found in the editor`);
      return widths;
    }
    const base = as[bi]!;
    // The accented letter's box: the accent atom holding the letter (the letter's right edge if none).
    const acc = as.slice(Math.max(0, bi - 1), bi + 3).filter((a) => ACCENT.test(a.latex.replace(/^\\class\{[^{}]*\}\{/, "")) && !/[_^]/.test(a.latex) && a.latex.includes(base.latex));
    const right = Math.max(base.r, ...acc.map((a) => a.r));
    if (acc.length) widths.push(Math.max(...acc.map((a) => a.r - a.l)));
    if (base.l < prevScriptRight - 0.5) fail(`${stored}: ${v.base} overlaps the previous index (${base.l.toFixed(1)} < ${prevScriptRight.toFixed(1)})`);
    let j = bi + 1;
    const script: Atom[] = [];
    for (const ch of [...v.script]) {
      const k = as.findIndex((a, i) => i >= j && char(a.latex) === ch);
      if (k < 0) {
        fail(`${stored}: index character ${ch} not found`);
        return widths;
      }
      script.push(as[k]!);
      j = k + 1;
    }
    from = j;
    const sl = Math.min(...script.map((a) => a.l));
    const st = Math.min(...script.map((a) => a.t));
    const sb = Math.max(...script.map((a) => a.b));
    prevScriptRight = Math.max(...script.map((a) => a.r));
    const h = base.b - base.t;
    const what = `${stored}: ${v.base}${v.sup ? "^" : "_"}{${v.script}}`;
    if (sl < right - 0.5) fail(`${what}: the index starts under the letter (index left ${sl.toFixed(1)}, letter right ${right.toFixed(1)})`);
    if (v.sup) {
      if (!(st < base.t)) fail(`${what}: the superscript is not above the letter's top (${st.toFixed(1)} ≥ ${base.t.toFixed(1)})`);
      if (!(sb > base.t + 0.2 * h)) fail(`${what}: the superscript floats above the letter`);
    } else {
      if (!(sb > base.b)) fail(`${what}: the subscript's baseline is not below the letter's (${sb.toFixed(1)} ≤ ${base.b.toFixed(1)})`);
      if (!(st < base.b - 0.2 * h)) fail(`${what}: the subscript hangs under the letter (top ${st.toFixed(1)}, letter ${base.t.toFixed(1)}–${base.b.toFixed(1)})`);
    }
  }
  return widths;
}

const REPRO = "\\overrightharpoon{\\mathbf{r}}_{P/O}\\overrightharpoon{\\mathbf{v}}_{P/O}\\overrightharpoon{\\bm{\\omega}}_{ba}\\overrightharpoon{\\mathbf{h}}_{c}";
const CASES: [string, Vec[]][] = [
  [REPRO, [{ base: "r", script: "P/O" }, { base: "v", script: "P/O" }, { base: "ω", script: "ba" }, { base: "h", script: "c" }]],
  ["\\overrightharpoon{\\mathbf{r}}_{P/O}", [{ base: "r", script: "P/O" }]],
  ["\\overrightarrow{x}^{2}", [{ base: "x", script: "2", sup: true }]],
  ["\\widehat{x}_{i}", [{ base: "x", script: "i" }]],
  ["\\overline{x}_{max}", [{ base: "x", script: "max" }]],
  ["\\vec{x}_1", [{ base: "x", script: "1" }]],
  ["\\hat{x}_i", [{ base: "x", script: "i" }]],
  ["\\bar{x}_{max}", [{ base: "x", script: "max" }]],
  ["\\pvec[P/O]{r}", [{ base: "r", script: "P/O" }]],
  ["\\pvec{r}_{cp}", [{ base: "r", script: "cp" }]],
  ["\\bvec{f}_1", [{ base: "f", script: "1" }]],
  ["\\vectrix{F}^{\\T}", [{ base: "F", script: "T", sup: true }]],
  ["\\pvec[P/O]{r}\\pvec[P/O]{v}\\pvec[ba]{\\omega}\\pvec{h}_c", [{ base: "r", script: "P/O" }, { base: "v", script: "P/O" }, { base: "ω", script: "ba" }, { base: "h", script: "c" }]],
];
let n = 0;
for (const [latex, vecs] of CASES) {
  await checkCase(latex, vecs);
  n++;
}

// The harpoon's width depends on the letter only.
const [bare] = await checkCase("\\overrightharpoon{\\mathbf{r}}", []).then(async () => {
  const as = await atoms(toEditorLatex("\\overrightharpoon{\\mathbf{r}}"));
  return as.filter((a) => a.latex.startsWith("\\overrightharpoon")).map((a) => a.r - a.l);
});
for (const s of ["_{c}", "_{P/O}", "_{max}", "^{2}"]) {
  const as = await atoms(toEditorLatex(`\\overrightharpoon{\\mathbf{r}}${s}`));
  const w = as.filter((a) => a.latex.startsWith("\\overrightharpoon") && !/[_^]/.test(a.latex)).map((a) => a.r - a.l)[0];
  if (bare == null || w == null || Math.abs(w - bare) > 0.6) fail(`harpoon over r with ${s}: width ${w?.toFixed(1)} vs ${bare?.toFixed(1)} without an index`);
  n++;
}

if (shots) {
  mkdirSync(shots, { recursive: true });
  await page.evaluate((l) => {
    (document.getElementById("mf") as unknown as { value: string }).value = l;
  }, toEditorLatex(REPRO));
  await page.waitForTimeout(300);
  await page.locator("#mf").screenshot({ path: join(shots, "accent-index-editor.png") });
}

await browser.close();
if (failures.length) {
  console.log(`${failures.length} failure(s).`);
  process.exit(1);
}
console.log(`Indices after accents in the editor: ${n} cases — each index right of its letter at the script position, harpoon width independent of the index, no overlaps in a run, stored LaTeX unchanged.`);
