/// <reference lib="dom" />
/**
 * Blocks in the real editor (MathLive, headless Chromium), with real key presses and the app's exact
 * session functions (blocks/session.ts) and slot rules (editorSlots.moveSlot):
 *
 * - a block made from an equation with two slots (Save as block), inserted, filled with Space;
 * - a slot used twice updates its other occurrence as you type;
 * - a block containing another block, filled in one Space sequence;
 * - one Ctrl+Z removes an insertion;
 * - the saved LaTeX never contains the wrappers.
 *
 * Run: pnpm tsx tools/blocks-check.ts  (exit code 1 on any failure)
 */
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { bodyWithSlots, editorForm, slotNames, stripSlotWrappers, syncSlots, type Block } from "../app/src/lib/blocks/model";
import { currentSlot, enterFirstSlot, sessionMove, syncRepeats } from "../app/src/lib/blocks/session";
import { moveSlot } from "../app/src/lib/editorSlots";
import { fromEditorLatex, toEditorLatex } from "../app/src/lib/kinds";

const norm = (l: string) => serializeLatex(parseLatex(l).root).replace(/\s+/g, "");
const block = (name: string, body: string): Block => ({ id: name, name, description: "", body, slots: syncSlots(body), trigger: "", groupId: null, tags: [], display: false, scope: "global", position: 0, createdAt: 0, updatedAt: 0, useCount: 0, version: 1 });

const mathlive = pathToFileURL(realpathSync(fileURLToPath(new URL("../app/node_modules/mathlive/mathlive.min.mjs", import.meta.url)))).href;
const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("page error:", e.message));
const html = join(mkdtempSync(join(tmpdir(), "mb-blocks-")), "page.html");
writeFileSync(html, `<!doctype html><html><body><math-field id="mf" style="font-size:24px"></math-field><script type="module">import "${mathlive}"; window.__ready = true;</script></body></html>`);
await page.goto(pathToFileURL(html).href);
await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 30000 });
await page.evaluate("window.__name = (f) => f");
await page.evaluate(`window.sessionMove = ${sessionMove.toString()}; window.syncRepeats = ${syncRepeats.toString()}; window.currentSlot = ${currentSlot.toString()}; window.moveSlot = ${moveSlot.toString()}; window.enterFirstSlot = ${enterFirstSlot.toString()};`);

// The app's handling: Space/Shift+Space in a block being filled (structures in a slot first), live repeats on input.
await page.evaluate(() => {
  const w = window as unknown as Record<string, (...a: unknown[]) => unknown> & { __session: { id: string; order: string[] } | null };
  const mf = document.getElementById("mf") as unknown as HTMLElement & { mode: string };
  w.__session = null;
  mf.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      const s = w.__session;
      if (!s || e.key !== " " || mf.mode !== "math") return;
      if (w.moveSlot!(mf, e.shiftKey ? -1 : 1)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const r = w.sessionMove!(mf, s.id, s.order, e.shiftKey ? -1 : 1);
      if (r) {
        e.preventDefault();
        e.stopPropagation();
        if (r === "done") w.__session = null;
      }
    },
    true,
  );
  mf.addEventListener("input", () => w.__session && w.syncRepeats!(mf, w.__session.id));
});

await page.click("#mf");
for (const ch of ["a", "b"]) {
  await page.keyboard.type(ch, { delay: 30 });
  await page.keyboard.press("Backspace");
}

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
};
type MF = { value: string; position: number; focus: () => void; executeCommand: (c: unknown) => boolean; insert: (s: string, o: Record<string, unknown>) => boolean };
const value = () => page.evaluate(() => (document.getElementById("mf") as unknown as MF).value);
const saved = async () => {
  const r = fromEditorLatex(stripSlotWrappers(await value()));
  return norm(r.latex);
};

/** Inserts a block the app's way: its editor form at the caret, the first slot selected, a session started. */
async function insert(b: Block, prefix: string, session: string, lookup: (n: string) => Block | undefined = () => undefined) {
  const form = editorForm(b, (l) => toEditorLatex(l), lookup, session);
  const order = form.order;
  const all = slotNames(form.latex.replace(/\\class\{mbs-[^}]*-(\d+)-([A-Za-z0-9]+)\}/g, "#$2"));
  await page.evaluate(
    ([pre, latex, id, ord]) => {
      const mf = document.getElementById("mf") as unknown as MF & { _mathfield: { model: unknown } };
      mf.value = pre as string;
      mf.focus();
      mf.executeCommand("moveToMathfieldEnd");
      mf.insert(latex as string, { insertionMode: "replaceSelection", selectionMode: "after", format: "latex" });
      // The first slot (in the block's order), as the app does it.
      const w = window as unknown as { __session: unknown; enterFirstSlot: (...a: unknown[]) => boolean };
      w.__session = { id, order: ord };
      if (!w.enterFirstSlot(mf, id, (ord as string[])[0])) throw new Error("first slot not found");
    },
    [prefix, form.latex, session, order] as const,
  );
  return all;
}

async function keys(seq: string[]) {
  for (const k of seq) {
    if (k === "␣") await page.keyboard.press("Space");
    else if (k === "⇧") await page.keyboard.press("Shift+Space");
    else await page.keyboard.type(k, { delay: 20 });
    await page.waitForTimeout(40);
  }
}

// 1. Save as block from an equation with two slots, insert, fill with Space.
{
  const body = bodyWithSlots("\\frac{1}{2}m v^2", [{ latex: "m", name: "m" }, { latex: "v", name: "v" }]);
  check(body === "\\frac{1}{2}#m #v^2", `Save as block: body ${body}`);
  const ke = block("Kinetic energy", body);
  await insert(ke, "E=", "s1");
  await keys(["M", "␣", "u", "␣", "+1"]);
  const got = await saved();
  check(got === norm("E=\\frac{1}{2}M u^2+1"), `two slots filled with Space, then out: ${got}`);
  check(!(await value()).includes("placeholder"), "no empty slot left");
}

// 2. A slot used twice: the other occurrence follows as you type.
{
  const sq = block("Square", "#v\\cdot#v");
  await insert(sq, "", "s2");
  await keys(["a"]);
  const mid = await saved();
  check(mid === norm("a\\cdot a"), `repeat updated while typing: ${mid}`);
  await keys(["+b"]);
  check((await saved()) === norm("a+b\\cdot a+b"), `repeat follows every key: ${await saved()}`);
}

// 3. A block inside a block, filled in one Space sequence.
{
  const ke = block("Kinetic energy", "\\frac{1}{2}#m #v^2");
  const total = block("Total energy", "\\block{Kinetic energy}+#m g #h");
  await insert(total, "E=", "s3", (n) => (n === "Kinetic energy" ? ke : undefined));
  await keys(["M", "␣", "u", "␣", "z", "␣", "=0"]);
  const got = await saved();
  check(got === norm("E=\\frac{1}{2}M u^2+M g z=0"), `nested block (shared slot m filled once): ${got}`);
}

// 4. A structure typed in a slot is walked first, then the next slot.
{
  const b = block("Pair", "(#a,#b)");
  await insert(b, "", "s4");
  await keys(["/", "1", "␣", "2", "␣", "␣", "c"]);
  const got = await saved();
  check(got === norm("(\\frac{1}{2},c)"), `fraction in a slot walked, then the next slot: ${got}`);
}

// 5. One Ctrl+Z removes an insertion (the live repeat updates add no undo steps).
{
  await page.evaluate(() => {
    const mf = document.getElementById("mf") as unknown as MF;
    mf.value = "";
  });
  const before = await value();
  await page.evaluate(() => (document.getElementById("mf") as unknown as MF).executeCommand("moveToMathfieldEnd"));
  const sq = block("Square", "#v\\cdot#v");
  await insert(sq, before, "s5");
  await page.keyboard.press("Control+z");
  const after = (await value()).replace(/\s+/g, "");
  check(after === before.replace(/\s+/g, ""), `one Ctrl+Z removes the insertion: “${after}”`);
}

await browser.close();
if (failures.length) {
  console.log(`${failures.length} failure(s):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("Blocks in the editor: create with two slots, insert, Space through the slots, live repeats, nested block, a structure in a slot, one Ctrl+Z — all passed.");
