/// <reference lib="dom" />
/**
 * Snippets in the real visual editor (MathLive, headless Chromium): for every kind snippet under
 * every prefix option (and the script snippets trans / inv), type "x+" + trigger with real key
 * presses, press Tab the app's way (findTrigger + applySnippet, the same functions), and check
 * that the whole trigger — prefix included — became the kind. Run: pnpm tsx tools/snippet-check.ts
 */
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { fromEditorLatex, toEditorLatex } from "../app/src/lib/kinds";
import { BASE_SNIPPETS, findTrigger, kindSnippets, PREFIX_CHARS } from "../app/src/lib/snippets";
import { applySnippet } from "../app/src/lib/snippetApply";

const norm = (l: string) => serializeLatex(parseLatex(l).root);
const mathlive = pathToFileURL(realpathSync(fileURLToPath(new URL("../app/node_modules/mathlive/mathlive.min.mjs", import.meta.url)))).href;
const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
const page = await browser.newPage();
const html = join(mkdtempSync(join(tmpdir(), "mb-snip-")), "page.html");
writeFileSync(html, `<!doctype html><html><body><math-field id="mf"></math-field><script type="module">import "${mathlive}"; window.__ready = true;</script></body></html>`);
await page.goto(pathToFileURL(html).href);
await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 30000 });
await page.evaluate("window.__name = (f) => f");
await page.evaluate(`window.applySnippet = ${applySnippet.toString()}`);
await page.click("#mf");
// The first keys after the page gets focus can be dropped: warm up.
for (const ch of ["a", ...PREFIX_CHARS]) {
  await page.keyboard.type(ch, { delay: 30 });
  await page.keyboard.press("Backspace");
}

/** Editor form of a snippet, as the app inserts it (slots as #?). */
const editorForm = (latex: string) => toEditorLatex(latex.replace(/#\?/g, "Ⓟ")).replaceAll("ⓅⓅ", "Ⓟ\\,Ⓟ").replaceAll("Ⓟ", "#?");

const failures: string[] = [];
let count = 0;
for (const prefix of [...PREFIX_CHARS, ""]) {
  const list = [...kindSnippets(prefix), ...BASE_SNIPPETS];
  const cases = [...kindSnippets(prefix), ...BASE_SNIPPETS.filter((s) => s.trigger === "trans" || s.trigger === "inv")];
  for (const sn of cases) {
    count++;
    await page.evaluate(() => {
      const mf = document.getElementById("mf") as unknown as { value: string; focus: () => void; executeCommand: (c: string) => void };
      mf.value = "x+y";
      mf.focus();
      mf.executeCommand("moveToMathfieldEnd");
    });
    await page.keyboard.type(sn.trigger, { delay: 15 });
    const ranges: string[] = await page.evaluate(() => {
      const mf = document.getElementById("mf") as unknown as { position: number; getValue: (a: number, b: number, f: string) => string };
      const pos = mf.position;
      return Array.from({ length: 16 }, (_, i) => (pos >= i + 1 ? mf.getValue(pos - i - 1, pos, "latex") : ""));
    });
    if (process.env.DEBUG_SNIP) console.log(sn.trigger, JSON.stringify(ranges.slice(0, 6)));
    const found = findTrigger((k) => ranges[k - 1] ?? "", list);
    const id = `prefix ${JSON.stringify(prefix)} ${sn.trigger}`;
    if (!found || found.snippet.trigger !== sn.trigger) {
      failures.push(`${id}: trigger not found (editor: ${ranges[5]})`);
      continue;
    }
    const value: string = await page.evaluate(
      ([positions, latex]) => {
        const mf = document.getElementById("mf") as unknown as { value: string };
        (window as unknown as { applySnippet: (m: unknown, p: number, l: string) => void }).applySnippet(mf, positions as number, latex as string);
        return mf.value;
      },
      [found.positions, editorForm(sn.latex)] as const,
    );
    if (sn.latex.startsWith("\\dcm")) {
      // Fill both frames: b, Tab, a — each slot on its own.
      await page.keyboard.type("b");
      await page.keyboard.press("Tab");
      await page.keyboard.type("a");
      const filled: string = await page.evaluate(() => (document.getElementById("mf") as unknown as { value: string }).value);
      const back = fromEditorLatex(filled).latex;
      if (norm(back) !== norm("x+y\\dcm{b}{a}")) failures.push(`${id} filling b, Tab, a: got ${back} (editor ${filled})`);
    }
    const got = fromEditorLatex(value).latex;
    const want = norm(`x+y${sn.latex.replace(/#\?/g, "")}`);
    if (norm(got) !== want) failures.push(`${id}: got ${got} (editor ${value}), want ${want}`);
  }
}
await browser.close();
console.log(`${count} snippet cases: ${failures.length} failed`);
if (failures.length) {
  console.log(failures.slice(0, 40).join("\n"));
  process.exit(1);
}
