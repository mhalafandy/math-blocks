/// <reference lib="dom" />
/**
 * Contact sheets of the real app's palettes (not the review tool): screenshots of the running app UI in
 * Chromium, light and dark — the right-hand symbol panel, the top (MathType-style) palette with a group
 * open, search results, and the floating editor's palette.
 *
 * Start the app's dev server first (pnpm --filter app exec vite), then:
 *   pnpm tsx tools/app-screenshots.ts [outDir] [url]
 *
 * The browser has no Windows fonts: the tool serves Liberation Serif (metric-compatible with Times New
 * Roman) to the app's preview font hook. Symbol and MT Extra are not available here, so Greek and the
 * rarer symbols come from STIX, as they do on a PC without those fonts.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const out = process.argv[2] ?? "docs/images";
const url = process.argv[3] ?? "http://localhost:1420/";
mkdirSync(out, { recursive: true });

const L = "/usr/share/fonts/truetype/liberation/LiberationSerif-";
const FONT_FILES: Record<string, string> = { "times.ttf": "Regular", "timesi.ttf": "Italic", "timesbd.ttf": "Bold", "timesbi.ttf": "BoldItalic" };

const RECENTS = [
  "symbols:greek:omega", "templates:fractions:frac", "symbols:relations:approx", "templates:accents:vec",
  "symbols:operators:times", "templates:scripts:sub", "symbols:misc:nabla", "templates:fences:paren",
  "symbols:greek:theta", "templates:roots:sqrt",
];

async function prepare(page: Page, theme: "light" | "dark", prefs: Record<string, unknown>) {
  await page.route("**/__preview-fonts/*", async (route) => {
    const name = route.request().url().split("/").pop()!;
    const f = FONT_FILES[name];
    if (f && existsSync(`${L}${f}.ttf`)) await route.fulfill({ body: readFileSync(`${L}${f}.ttf`), contentType: "font/ttf" });
    else await route.fulfill({ status: 404, body: "" });
  });
  await page.addInitScript(
    ([p]) => {
      localStorage.setItem("mathblocks.previewFonts", "1");
      const key = "mathblocks.prefs.v3";
      const had = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
      localStorage.setItem(key, JSON.stringify({ ...had, ...p }));
    },
    [{ theme, recents: RECENTS, rightOpen: true, bottomOpen: false, paletteTab: "tab-spacecraft", ...prefs }] as const,
  );
}

/** Waits until the tiles are drawn (the fonts load once, then every tile has its SVG). */
async function tilesDrawn(page: Page, root: string) {
  await page.waitForFunction((sel) => {
    const tiles = Array.from(document.querySelectorAll(`${sel} .math-tile`));
    return tiles.length > 0 && tiles.every((t) => t.querySelector("svg"));
  }, root, { timeout: 30_000 });
}

async function shoot(theme: "light" | "dark") {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, colorScheme: theme });
  const files: string[] = [];

  // 1. Right-hand panel: Quick access, Recent, a collection, and a few symbol and template groups opened.
  let page = await ctx.newPage();
  await prepare(page, theme, { paletteLocation: "right" });
  await page.goto(url);
  await page.waitForSelector(".symbol-panel");
  await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll(".symbol-panel details.pal-section")) as HTMLDetailsElement[];
    for (const d of sections) if (/Greek|Relations|Arrows|Fractions|Accents|Calculus symbols/.test(d.querySelector("summary")?.textContent ?? "")) d.open = true;
    const scroll = document.querySelector(".symbol-panel .panel-scroll") as HTMLElement;
    const panel = document.querySelector(".symbol-panel") as HTMLElement;
    scroll.style.overflow = "visible";
    scroll.style.maxHeight = "none";
    panel.style.height = "auto";
    panel.style.maxHeight = "none";
  });
  await tilesDrawn(page, ".symbol-panel");
  await page.locator(".symbol-panel").screenshot({ path: join(out, `palette-right-${theme}.png`) });
  files.push(`palette-right-${theme}.png`);

  // 2. Search results in the right panel (ranked: exact, alias, meaning, category).
  await page.fill(".symbol-panel .pal-search", "arrow");
  await tilesDrawn(page, ".symbol-panel .result-list");
  await page.locator(".symbol-panel").screenshot({ path: join(out, `palette-search-${theme}.png`) });
  files.push(`palette-search-${theme}.png`);
  await page.close();

  // 3. Top palette with a group open and the spacecraft collection.
  page = await ctx.newPage();
  await prepare(page, theme, { paletteLocation: "top" });
  await page.goto(url);
  await page.waitForSelector(".palette-top");
  await page.locator(".palette-top .pal-group").nth(9).click();
  await tilesDrawn(page, ".palette-top");
  // The open group's popover hangs below the palette: take both.
  const top = (await page.locator(".palette-top").boundingBox())!;
  const pop = (await page.locator(".pal-popover").boundingBox()) ?? top;
  const bottom = Math.max(top.y + top.height, pop.y + pop.height);
  await page.screenshot({ path: join(out, `palette-top-${theme}.png`), clip: { x: top.x, y: top.y, width: top.width, height: bottom - top.y + 4 } });
  files.push(`palette-top-${theme}.png`);
  await page.close();

  // 4. The floating editor's palette (the window Word opens on right-click).
  page = await ctx.newPage();
  await page.setViewportSize({ width: 560, height: 760 });
  await prepare(page, theme, {});
  await page.goto(url + "?panel=1");
  await page.waitForTimeout(1000);
  for (const [label, name] of [["Favourites", "favourites"], ["Structures", "structures"]] as const) {
    await page.locator(`button[title^="${label}"]`).first().click();
    await tilesDrawn(page, ".panel-flyout-body");
    await page.screenshot({ path: join(out, `palette-floating-${name}-${theme}.png`) });
    files.push(`palette-floating-${name}-${theme}.png`);
  }
  await page.close();
  await browser.close();
  return files;
}

const all = [...(await shoot("light")), ...(await shoot("dark"))];
console.log(all.join("\n"));
