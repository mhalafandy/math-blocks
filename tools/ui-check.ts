/// <reference lib="dom" />
/**
 * The app in the browser (dev server), checked like a user would:
 * - Settings: Ctrl+, opens it; every page at 1366×768 and at 125 % / 150 % scaling (1093×614, 911×512 CSS px):
 *   no button outside the window, each page's action buttons in view without scrolling; screenshots.
 * - No old settings dialog: links and Ctrl+K commands that used to open the old dialogs open the right
 *   settings page and no pop-up; closing the settings leaves nothing open.
 * - Large equations: very wide, very tall (a big matrix, cases) and a multi-line derivation — in the editor the
 *   whole equation can be scrolled to (and Fit shows it all); in the docked preview nothing is drawn outside
 *   the white page; screenshots.
 *
 * Run (dev server first: pnpm --filter @mathblocks/app exec vite --port 1420):
 *   pnpm tsx tools/ui-check.ts <screenshot folder>
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { chromium, type Page } from "playwright";

const out = process.argv[2] ?? "ui-check";
const url = process.argv[3] ?? "http://localhost:1420/";
mkdirSync(out, { recursive: true });
const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}`);
};

/** The app's preview fonts (Times New Roman stands in as Liberation Serif, metric-compatible), as tools/app-screenshots.ts serves them. */
const L = "/usr/share/fonts/truetype/liberation/LiberationSerif-";
const FONT_FILES: Record<string, string> = { "times.ttf": "Regular", "timesi.ttf": "Italic", "timesbd.ttf": "Bold", "timesbi.ttf": "BoldItalic" };

async function open(page: Page) {
  await page.route("**/__preview-fonts/*", async (route) => {
    const f = FONT_FILES[route.request().url().split("/").pop()!];
    if (f && existsSync(`${L}${f}.ttf`)) await route.fulfill({ body: readFileSync(`${L}${f}.ttf`), contentType: "font/ttf" });
    else await route.fulfill({ status: 404, body: "" });
  });
  await page.goto(url);
  await page.evaluate(() => {
    localStorage.setItem("mathblocks.previewFonts", "1");
    localStorage.removeItem("mathblocks.settings.size");
  });
  await page.reload();
  await page.waitForSelector("math-field", { timeout: 30000 });
  await page.waitForTimeout(800);
}

const oldModal = (page: Page) => page.locator(".modal-backdrop .modal").count();

// ------------------------------------------------------------------ settings at three sizes
const SIZES = [
  { name: "1366x768", width: 1366, height: 768, scale: 1 },
  { name: "125pct", width: 1093, height: 614, scale: 1.25 },
  { name: "150pct", width: 911, height: 512, scale: 1.5 },
  // The app window's minimum size (tauri.conf.json: 900 × 600).
  { name: "minimum-900x600", width: 900, height: 600, scale: 1 },
];
// Scroll bars shown as in the app (Playwright hides them by default in headless runs).
const browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
for (const size of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.name === "1366x768" ? 1 : size.scale });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("page error:", e.message));
  await open(page);
  await page.keyboard.press("Control+,");
  await page.waitForSelector(".settings-window", { timeout: 5000 }).catch(() => undefined);
  check((await page.locator(".settings-window").count()) === 1, `${size.name}: Ctrl+, opens the settings`);
  const pages = await page.locator(".settings-side button").allTextContents();
  for (let i = 0; i < pages.length; i++) {
    await page.locator(".settings-side button").nth(i).click();
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const win = document.querySelector(".settings-window")!.getBoundingClientRect();
      const body = document.querySelector(".settings-body")!;
      const bodyRect = body.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Any button beyond the window (cut off sideways), and the page's action row in view without scrolling.
      const buttons = Array.from(body.querySelectorAll("button")).filter((b) => (b as HTMLElement).offsetParent);
      const outside = buttons.filter((b) => {
        const br = b.getBoundingClientRect();
        return br.right > win.right + 1 || br.left < win.left - 1;
      }).map((b) => b.textContent?.trim());
      const actions = body.querySelector(".modal-actions");
      let actionsVisible = true;
      if (actions) {
        const ar = actions.getBoundingClientRect();
        actionsVisible = ar.bottom <= bodyRect.bottom + 1 && ar.top >= bodyRect.top - 1;
      }
      return { inViewport: win.right <= vw && win.bottom <= vh && win.left >= 0 && win.top >= 0, outside, actionsVisible, hasActions: !!actions };
    });
    const label = `${size.name}: Settings → ${pages[i]}`;
    check(r.inViewport, `${label}: the window fits the app window`);
    check(r.outside.length === 0, `${label}: no button cut off${r.outside.length ? ` (${r.outside.join(", ")})` : ""}`);
    if (r.hasActions) check(r.actionsVisible, `${label}: its action buttons are in view (fixed footer)`);
    check((await oldModal(page)) === 0, `${label}: no old dialog behind the settings`);
    if (size.name === "1366x768" || i === 0) await page.screenshot({ path: `${out}/settings-${size.name}-${String(i + 1).padStart(2, "0")}-${pages[i]!.replace(/[^A-Za-z]+/g, "-").toLowerCase()}.png` });
  }
  // Old entry points: links inside pages and Ctrl+K commands go to the right page, never an old pop-up.
  if (size.name === "1366x768") {
    const goTo = async (label: string) => page.locator(".settings-side button", { hasText: label }).first().click();
    await goTo("Document style");
    await page.waitForTimeout(400);
    for (const [link, heading] of [["Accents…", "Accents"], ["Each kind's look…", "Notation kinds"]] as const) {
      await goTo("Document style");
      await page.waitForTimeout(300);
      const l = page.locator(".settings-body button", { hasText: link }).first();
      if (await l.count()) {
        await l.click();
        await page.waitForTimeout(500);
        const on = await page.locator(".settings-side button.on").textContent();
        check(on?.trim() === heading && (await oldModal(page)) === 0, `link “${link}” opens Settings → ${heading}, no old dialog (now: ${on})`);
      } else check(false, `link “${link}” found on the Document style page`);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    check((await page.locator(".settings-window").count()) === 0 && (await oldModal(page)) === 0, "closing the settings leaves no old dialog open");
    for (const [cmd, heading] of [["Snippets (trigger", "Snippets and shortcuts"], ["Accents: how harpoons", "Accents"], ["Document style: how", "Document style"], ["Notation settings: kinds", "Notation kinds"]] as const) {
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(300);
      await page.keyboard.type(cmd, { delay: 15 });
      await page.waitForTimeout(300);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(600);
      const on = (await page.locator(".settings-side button.on").textContent().catch(() => null))?.trim();
      check(on === heading && (await oldModal(page)) === 0, `Ctrl+K “${cmd}” opens Settings → ${heading}, no old dialog (now: ${on ?? "no settings"})`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
    check((await oldModal(page)) === 0, "after every entry point: no old dialog anywhere");
  }
  await ctx.close();
}

/** The docked preview's white page is inside its canvas (with a margin) and nothing has to be scrolled. */
async function previewFits(page: Page, margin = 0) {
  return page.evaluate((m) => {
    const c = document.querySelector(".preview-canvas") as HTMLElement;
    const p = document.querySelector(".preview-page") as HTMLElement | null;
    const cr = c.getBoundingClientRect();
    const pr = p?.getBoundingClientRect();
    return {
      noScroll: c.scrollWidth <= c.clientWidth + 1 && c.scrollHeight <= c.clientHeight + 1,
      inside: !!pr && pr.left >= cr.left + m && pr.right <= cr.right - m && pr.top >= cr.top + m && pr.bottom <= cr.bottom - m,
      canvas: `${Math.round(cr.width)}×${Math.round(cr.height)}`,
      page: pr ? `${Math.round(pr.width)}×${Math.round(pr.height)}` : "none",
    };
  }, margin);
}

// ------------------------------------------------------------------ large equations: editor and docked preview
const BIG = {
  wide: "E=" + Array.from({ length: 30 }, (_, i) => `a_{${i}}x^{${i}}`).join("+"),
  tall: "\\mathbf{M}=\\begin{bmatrix}" + Array.from({ length: 12 }, (_, r) => Array.from({ length: 6 }, (_, c) => `m_{${r}${c}}`).join("&")).join("\\\\") + "\\end{bmatrix}+\\begin{cases}1&x>0\\\\0&x=0\\\\-1&x<0\\end{cases}",
  derivation: "\\begin{aligned}" + Array.from({ length: 8 }, (_, i) => `f_{${i}}(x)&=\\frac{\\mathrm{d}}{\\mathrm{d}x}\\left(\\sum_{k=0}^{${i + 3}}c_k x^k\\right)+\\int_0^x g_{${i}}(t)\\,\\mathrm{d}t`).join("\\\\") + "\\end{aligned}",
};
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("page error:", e.message));
  await open(page);
  for (const [name, latex] of Object.entries(BIG)) {
    await page.evaluate((l) => {
      const mf = document.querySelector("math-field") as unknown as HTMLElement & { value: string; focus: () => void; executeCommand: (c: string) => void };
      mf.value = l;
      mf.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
      mf.focus();
      mf.executeCommand("moveToMathfieldEnd");
    }, latex);
    await page.waitForTimeout(1500);
    // Editor: the whole equation reachable (scroll both ways; the start is not cut off), the caret in view.
    const ed = await page.evaluate(() => {
      const sc = document.querySelector(".canvas-scroll") as HTMLElement;
      const mf = document.querySelector("math-field") as HTMLElement;
      const scr = sc.getBoundingClientRect();
      const caret = (mf.shadowRoot?.querySelector(".ML__caret, .ML__text-caret") as HTMLElement | null)?.getBoundingClientRect();
      const caretInView = !caret || (caret.left >= scr.left - 2 && caret.right <= scr.right + 2 && caret.top >= scr.top - 2 && caret.bottom <= scr.bottom + 2);
      const fieldW = mf.scrollWidth;
      const fieldH = mf.scrollHeight;
      sc.scrollLeft = 0;
      sc.scrollTop = 0;
      const left = mf.getBoundingClientRect().left - sc.getBoundingClientRect().left;
      // A scroll bar takes room where the equation is larger than the area (it is there to drag).
      const barX = sc.offsetHeight - sc.clientHeight > 0;
      const barY = sc.offsetWidth - sc.clientWidth > 0;
      return { barX, barY, overflowX: sc.scrollWidth > sc.clientWidth + 1, overflowY: sc.scrollHeight > sc.clientHeight + 1, fitsW: fieldW <= sc.scrollWidth + 1, fitsH: fieldH <= sc.scrollHeight + 1, startVisible: left >= -1, caretInView };
    });
    check(ed.fitsW && ed.fitsH && ed.startVisible, `editor, ${name} equation: every part can be scrolled to (start visible at scroll 0; ${ed.overflowX ? "scrolls sideways" : "fits width"}, ${ed.overflowY ? "scrolls down" : "fits height"})`);
    check((!ed.overflowX || ed.barX) && (!ed.overflowY || ed.barY), `editor, ${name} equation: scroll bars shown where it is larger than the area`);
    check(ed.caretInView, `editor, ${name} equation: the caret is in view after typing at the end`);
    await page.screenshot({ path: `${out}/editor-${name}.png` });
    await page.locator(".canvas-tools button", { hasText: "Fit" }).click();
    await page.waitForTimeout(500);
    const fit = await page.evaluate(() => {
      const sc = document.querySelector(".canvas-scroll") as HTMLElement;
      return sc.scrollWidth <= sc.clientWidth + 2 && sc.scrollHeight <= sc.clientHeight + 2;
    });
    check(fit, `editor, ${name} equation: Fit shows the whole equation`);
    await page.screenshot({ path: `${out}/editor-${name}-fit.png` });
    await page.locator(".canvas-tools .zoom-label").first().click(); // back to 100 %
    // Docked preview: open the Preview tab; nothing drawn outside the white page.
    // The Preview tab (clicking it again would close the panel).
    if (!(await page.locator(".preview-view").count())) await page.locator(".panel-tabs button", { hasText: "Preview" }).click();
    await page.waitForTimeout(1200);
    const pv = await page.evaluate(() => {
      const pageEl = document.querySelector(".preview-page")?.getBoundingClientRect();
      const eq = document.querySelector(".preview-eq")?.getBoundingClientRect();
      if (!pageEl || !eq) return null;
      return { inside: eq.left >= pageEl.left - 1 && eq.right <= pageEl.right + 1 && eq.top >= pageEl.top - 1 && eq.bottom <= pageEl.bottom + 1 };
    });
    check(!!pv?.inside, `docked preview, ${name} equation: drawn inside the white page`);
    await page.screenshot({ path: `${out}/preview-docked-${name}.png` });
    await page.locator(".preview-bar button", { hasText: "Fit" }).click();
    await page.waitForTimeout(500);
    const pf = await previewFits(page);
    check(pf.noScroll && pf.inside, `docked preview, ${name} equation: Fit shows it all, width and height, without scrolling (canvas ${pf.canvas}, page ${pf.page})`);
    await page.screenshot({ path: `${out}/preview-docked-${name}-fit.png` });
    await page.locator(".preview-bar button", { hasText: "%" }).click(); // back to 100 %: Fit off
  }
  // Side panels collapsed: the docked preview widens with the editor.
  const before = await page.evaluate(() => document.querySelector(".preview-view")?.getBoundingClientRect().width ?? 0);
  await page.keyboard.press("Control+b");
  await page.keyboard.press("Control+Alt+b");
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => document.querySelector(".preview-view")?.getBoundingClientRect().width ?? 0);
  check(after > before + 100, `docked preview widens when the side panels are collapsed (${Math.round(before)} → ${Math.round(after)} px)`);
  await page.screenshot({ path: `${out}/preview-docked-wide-panels-collapsed.png` });
  await ctx.close();
}
// ------------------------------------------------------------------ docked preview: default height, splitter
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await open(page);
  await page.evaluate(() => {
    localStorage.setItem("mathblocks.preview.zoom", "2");
    localStorage.removeItem("mathblocks.prefs.v3");
  });
  await page.reload();
  await page.waitForSelector("math-field", { timeout: 30000 });
  await page.evaluate(() => {
    const mf = document.querySelector("math-field") as unknown as HTMLElement & { value: string };
    mf.value = "x_{i}^{2}+y_{j}^{n}=z_{k}^{2}";
    mf.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
  });
  if (!(await page.locator(".preview-view").count())) await page.locator(".panel-tabs button", { hasText: "Preview" }).click();
  await page.waitForTimeout(1200);
  // The line (text width) is wider than the panel at 200 %, so it may scroll sideways; the equation itself, centred
  // in view, and the page's height must be clear of the panel's edges, with nothing to scroll down.
  const at200 = await page.evaluate(() => {
    const c = document.querySelector(".preview-canvas") as HTMLElement;
    const cr = c.getBoundingClientRect();
    const pr = document.querySelector(".preview-page")!.getBoundingClientRect();
    const er = document.querySelector(".preview-eq")!.getBoundingClientRect();
    const right = cr.left + c.clientWidth;
    const bottom = cr.top + c.clientHeight;
    return {
      ok: c.scrollHeight <= c.clientHeight + 1 && pr.top >= cr.top + 4 && pr.bottom <= bottom - 4 && er.left >= cr.left + 8 && er.right <= right - 8 && er.top >= cr.top + 8 && er.bottom <= bottom - 8,
      what: `canvas ${Math.round(c.clientWidth)}×${Math.round(c.clientHeight)}, equation ${Math.round(er.width)}×${Math.round(er.height)} at ${Math.round(er.left - cr.left)},${Math.round(er.top - cr.top)}`,
    };
  });
  check(at200.ok, `docked preview at the default height, 200 %: a one-line equation with indices clear of the edges (${at200.what})`);
  await page.screenshot({ path: `${out}/preview-docked-default-200.png` });
  // Editor and Word preview of a run of accent-style vectors with indices (generic repro), at 200 %.
  await page.evaluate(() => {
    const mf = document.querySelector("math-field") as unknown as HTMLElement & { value: string };
    mf.value = "{\\overrightharpoon{\\mathbf{r}}}_{P/O}{\\overrightharpoon{\\mathbf{v}}}_{P/O}{\\overrightharpoon{\\boldsymbol{\\omega}}}_{ba}{\\overrightharpoon{\\mathbf{h}}}_{c}";
    mf.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
  });
  await page.waitForTimeout(1200);
  await page.locator(".canvas").screenshot({ path: `${out}/accent-index-app-editor.png` });
  await page.locator(".preview-canvas").screenshot({ path: `${out}/accent-index-word-preview.png` });
  // The splitter above the tabs: drag it up 150 px; the height is remembered after a reload.
  const sp = (await page.locator(".hsplitter").boundingBox())!;
  const h0 = await page.evaluate(() => document.querySelector(".bottom-panel")!.getBoundingClientRect().height);
  await page.mouse.move(sp.x + sp.width / 2, sp.y + sp.height / 2);
  await page.mouse.down();
  await page.mouse.move(sp.x + sp.width / 2, sp.y - 150, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const h1 = await page.evaluate(() => document.querySelector(".bottom-panel")!.getBoundingClientRect().height);
  check(Math.abs(h1 - h0 - 150) <= 4, `bottom panel: the splitter drags its height (${Math.round(h0)} → ${Math.round(h1)} px)`);
  await page.reload();
  await page.waitForSelector("math-field", { timeout: 30000 });
  await page.waitForTimeout(500);
  const h2 = await page.evaluate(() => document.querySelector(".bottom-panel")?.getBoundingClientRect().height ?? 0);
  check(Math.abs(h2 - h1) <= 2, `bottom panel: its height is remembered (${Math.round(h2)} px after a reload)`);
  // Fit stays on while the panel is resized.
  if (!(await page.locator(".preview-view").count())) await page.locator(".panel-tabs button", { hasText: "Preview" }).click();
  await page.evaluate((l) => {
    const mf = document.querySelector("math-field") as unknown as HTMLElement & { value: string };
    mf.value = l;
    mf.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
  }, BIG.derivation);
  await page.waitForTimeout(1200);
  await page.locator(".preview-bar button", { hasText: "Fit" }).click();
  const sp2 = (await page.locator(".hsplitter").boundingBox())!;
  await page.mouse.move(sp2.x + sp2.width / 2, sp2.y + 1);
  await page.mouse.down();
  await page.mouse.move(sp2.x + sp2.width / 2, sp2.y + 200, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const refit = await previewFits(page);
  check(refit.noScroll && refit.inside, `docked preview: Fit follows the panel when it is made lower (canvas ${refit.canvas}, page ${refit.page})`);
  await page.screenshot({ path: `${out}/preview-docked-derivation-lower-fit.png` });
  await ctx.close();
}
// ------------------------------------------------------------------ a block pinned to Quick access
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const blk = { id: "bpin1", name: "Square", description: "", body: "#v\\cdot#v", slots: [{ name: "v" }], trigger: "", groupId: null, tags: [], display: false, position: 0, createdAt: 0, updatedAt: 0, useCount: 0, version: 1 };
    localStorage.setItem("mathblocks.blocks.v1", JSON.stringify({ groups: [], blocks: [blk] }));
    const key = "mathblocks.prefs.v3";
    const had = JSON.parse(localStorage.getItem(key) ?? "{}") as { favorites?: string[] };
    localStorage.setItem(key, JSON.stringify({ ...had, rightOpen: true, favorites: ["block:bpin1", ...(had.favorites ?? ["symbols:greek:alpha"])] }));
  });
  await open(page);
  const pinned = page.locator(".pinned-block").first();
  check((await pinned.count()) === 1, "a block pinned to Quick access shows there (its tile)");
  if (await pinned.count()) {
    await page.locator("math-field").click();
    await pinned.click();
    await page.waitForTimeout(500);
    const v = await page.evaluate(() => (document.querySelector("math-field") as unknown as { value: string }).value);
    check(v.includes("mbb-") && v.includes("cdot"), "clicking it inserts the block with its slots to fill");
    await page.screenshot({ path: `${out}/quick-access-pinned-block.png` });
  }
  await ctx.close();
}
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} failure(s):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("\nUI check: all passed.");
