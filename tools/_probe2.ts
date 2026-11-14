/// <reference lib="dom" />
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
const mathlive = pathToFileURL(realpathSync(fileURLToPath(new URL("../app/node_modules/mathlive/mathlive.min.mjs", import.meta.url)))).href;
const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 900, height: 200 } });
const html = join(mkdtempSync(join(tmpdir(), "mb-p-")), "page.html");
writeFileSync(html, `<!doctype html><html><body><math-field id="mf" style="font-size:48px"></math-field><script type="module">import "${mathlive}"; window.__ready = true;</script></body></html>`);
await page.goto(pathToFileURL(html).href);
await page.waitForFunction(() => (window as any).__ready === true);
const css = process.argv[3] ?? "";
await page.evaluate((c) => { const st = document.createElement("style"); st.textContent = c; (document.getElementById("mf") as any).shadowRoot.appendChild(st); }, css);
await page.evaluate((l) => { (document.getElementById("mf") as any).value = l; }, process.argv[2]!);
await page.waitForTimeout(300);
await page.screenshot({ path: process.argv[4] ?? "/tmp/claude-0/-home-user-math-blocks/d39c3914-3271-51bb-b427-b70248749f68/scratchpad/probe/p.png" });
await browser.close();
