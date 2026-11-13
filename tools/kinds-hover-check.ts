/// <reference lib="dom" />
/**
 * Kinds model in the editor (docs/KINDS-MODEL.md §7): hovering a letter in the real visual editor (MathLive,
 * headless Chromium) gives its kind and why — the app's exact code (lib/kindHover.ts symbolContextAt, then
 * math-core explainSymbol) on the editor's atoms, at every caret offset.
 *
 * Run: pnpm tsx tools/kinds-hover-check.ts  (exit code 1 on any failure)
 */
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { DEFAULT_STYLE, explainSymbol, withLetterRoles, type MathStyle, type SymbolContext } from "@mathblocks/math-core";
import { symbolContextAt } from "../app/src/lib/kindHover";
import { toEditorLatex } from "../app/src/lib/kinds";

const mathlive = pathToFileURL(realpathSync(fileURLToPath(new URL("../app/node_modules/mathlive/mathlive.min.mjs", import.meta.url)))).href;
const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("page error:", e.message));
const html = join(mkdtempSync(join(tmpdir(), "mb-hover-")), "page.html");
writeFileSync(html, `<!doctype html><html><body><math-field id="mf" style="font-size:24px"></math-field><script type="module">import "${mathlive}"; window.__ready = true;</script></body></html>`);
await page.goto(pathToFileURL(html).href);
await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 30000 });
await page.evaluate("window.__name = (f) => f");
await page.evaluate(`window.symbolContextAt = ${symbolContextAt.toString()};`);

/** Every letter's context in an equation, read from the rendered atoms (as the hover does). */
async function contexts(latex: string): Promise<(SymbolContext & { label: string })[]> {
  return page.evaluate((l) => {
    const mf = document.getElementById("mf") as unknown as HTMLElement & { value: string };
    mf.value = l;
    const last = (mf as unknown as { lastOffset: number }).lastOffset;
    const f = (window as unknown as { symbolContextAt: (m: unknown, o: number) => unknown }).symbolContextAt;
    return Array.from({ length: last }, (_, i) => f(mf, i + 1)).filter(Boolean) as (SymbolContext & { label: string })[];
  }, latex);
}

const failures: string[] = [];
const style: MathStyle = withLetterRoles({ ...DEFAULT_STYLE, symbols: [{ symbol: "\\omega", text: "ω", when: { bold: true }, kind: "pvec" }] }, { i: "counter" });
const expect = async (latex: string, want: Record<string, string>) => {
  const got = await contexts(toEditorLatex(latex));
  if (!got.length) failures.push(`${latex}: no letter found`);
  for (const [label, kind] of Object.entries(want)) {
    const c = got.find((x) => x.label === label || x.text === label);
    const k = c ? explainSymbol(c, style).kind : "(not found)";
    if (k !== kind) failures.push(`${latex}: ${label} is ${k}, expected ${kind} (${JSON.stringify(c)})`);
  }
};

await expect("\\boldsymbol{\\omega}+\\omega", { "ω": "pvec" });
await expect("\\omega", { "ω": "variable" });
await expect("\\sigma_{sf}+x_i", { s: "label", i: "counter" });
await expect("\\pvec{r}+e^{x}", { r: "pvec", e: "constant" });
await expect("\\frac{dx}{dt}", { d: "operator" });
await expect("\\mathrm{x}+y", { x: "variable", y: "variable" });

await browser.close();
if (failures.length) {
  console.log(`${failures.length} failure(s):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("Kinds in the editor: hovering a letter gives its kind (rule when bold, index label and counter, kind wrapper, constant e, differential d, forced font) — all passed.");
