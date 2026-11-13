/// <reference lib="dom" />
/**
 * The visual editor's Space and Backspace, in the real editor (MathLive, headless Chromium), with real key
 * presses and the app's exact functions (editorSlots.moveSlot / deleteStep, kindExit.exitKind / kindAt):
 *
 * - Space walks through every slot of each structure in reading order, then leaves it; Shift+Space goes
 *   back; Space in \text{} types a space; Space Space opens the palette only outside every structure.
 * - Backspace at every caret position of a set of equations removes at most one character, or selects a
 *   structure / kind (a second Backspace deletes exactly the selection); Ctrl+Z always restores.
 * - The old whole-kind rule is run at every position too, to show what used to erase whole equations.
 *
 * Run: pnpm tsx tools/editor-keys-check.ts   (exit code 1 on any failure)
 */
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, type Page } from "playwright";
import { deleteStep, moveSlot } from "../app/src/lib/editorSlots";
import { exitKind, kindAt } from "../app/src/lib/kindExit";

const mathlive = pathToFileURL(realpathSync(fileURLToPath(new URL("../app/node_modules/mathlive/mathlive.min.mjs", import.meta.url)))).href;
const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("page error:", e.message));
const html = join(mkdtempSync(join(tmpdir(), "mb-keys-")), "page.html");
writeFileSync(html, `<!doctype html><html><body><math-field id="mf" style="font-size:24px"></math-field><script type="module">import "${mathlive}"; window.__ready = true;</script></body></html>`);
await page.goto(pathToFileURL(html).href);
await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 30000 });
await page.evaluate("window.__name = (f) => f");
await page.evaluate(`window.moveSlot = ${moveSlot.toString()}; window.deleteStep = ${deleteStep.toString()}; window.exitKind = ${exitKind.toString()}; window.kindAt = ${kindAt.toString()};`);

// The app's key handler for Space / Backspace / Delete (editorKeys.handleEditorKey), on the same functions.
await page.evaluate(() => {
  const w = window as unknown as Record<string, (...a: unknown[]) => unknown> & { __palette: number; __lastSpace: number };
  const mf = document.getElementById("mf") as unknown as HTMLElement & { mode: string; position: number; selectionIsCollapsed: boolean; executeCommand: (c: unknown) => boolean };
  w.__palette = 0;
  w.__lastSpace = 0;
  mf.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      const mode = mf.mode;
      const stop = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if ((e.key === "Backspace" || e.key === "Delete") && !e.ctrlKey && !e.shiftKey && mode === "math") {
        if (w.deleteStep!(mf, e.key === "Backspace" ? -1 : 1)) stop();
        return;
      }
      if (e.key === " " && mode === "math" && !e.ctrlKey && !e.altKey) {
        if (w.moveSlot!(mf, e.shiftKey ? -1 : 1)) {
          w.__lastSpace = 0;
          return stop();
        }
        if (!e.shiftKey && mf.selectionIsCollapsed) {
          const k = w.kindAt!(mf) as { a: number; b: number } | null;
          const inside = !!k && k.a < mf.position && mf.position < k.b;
          if (w.exitKind!(mf, "Tab") || (inside && mf.executeCommand("moveToNextPlaceholder"))) {
            w.__lastSpace = 0;
            return stop();
          }
        }
        if (e.shiftKey) return stop();
        const now = performance.now();
        if (now - w.__lastSpace <= 300) {
          w.__lastSpace = 0;
          w.__palette++;
          return stop();
        }
        w.__lastSpace = now;
      }
    },
    true,
  );
});

await page.click("#mf");
for (const ch of ["a", "b"]) {
  await page.keyboard.type(ch, { delay: 30 });
  await page.keyboard.press("Backspace");
}

type MF = { value: string; position: number; lastOffset: number; selection: { ranges: [number, number][] }; selectionIsCollapsed: boolean; getValue: (a?: unknown, b?: unknown, c?: unknown) => string; executeCommand: (c: unknown) => boolean; focus: () => void };
const value = () => page.evaluate(() => (document.getElementById("mf") as unknown as MF).value);
const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
};

// ------------------------------------------------------------------ Space through slots

/** Starts with a template inserted (its first slot selected), then types: "␣" Space, "⇧" Shift+Space, others as typed. */
async function run(template: string, keys: string[]): Promise<string> {
  await page.evaluate((t) => {
    const mf = document.getElementById("mf") as unknown as MF;
    mf.value = "";
    mf.focus();
    mf.executeCommand(["insert", t]);
    mf.executeCommand("moveToMathfieldStart");
    mf.executeCommand("moveToNextPlaceholder");
  }, template);
  for (const k of keys) {
    if (k === "␣") await page.keyboard.press("Space");
    else if (k === "⇧") await page.keyboard.press("Shift+Space");
    else await page.keyboard.type(k, { delay: 15 });
    await page.waitForTimeout(340); // never two Spaces within the double-Space time
  }
  return (await value()).replace(/\s+/g, "");
}

const SPACE_CASES: { name: string; template: string; keys: string[]; want: string }[] = [
  { name: "fraction: numerator → denominator → out", template: "\\frac{#?}{#?}", keys: ["a", "␣", "b", "␣", "+c"], want: "\\frac{a}{b}+c" },
  { name: "sum: lower → upper → body", template: "\\sum_{#?}^{#?}#?", keys: ["i=1", "␣", "n", "␣", "x"], want: "\\sum_{i=1}^{n}x" },
  { name: "integral with limits: lower → upper → body", template: "\\int_{#?}^{#?}#?", keys: ["0", "␣", "1", "␣", "f"], want: "\\int_0^1f" },
  { name: "product: lower → upper → body", template: "\\prod_{#?}^{#?}#?", keys: ["k", "␣", "m", "␣", "y"], want: "\\prod_{k}^{m}y" },
  { name: "limit: below → body", template: "\\lim_{#?}#?", keys: ["t", "␣", "g"], want: "\\lim_{t}g" },
  { name: "root with index: index → radicand → out", template: "\\sqrt[#?]{#?}", keys: ["3", "␣", "x", "␣", "+1"], want: "\\sqrt[3]{x}+1" },
  { name: "scripts: subscript → superscript → out", template: "x_{#?}^{#?}", keys: ["i", "␣", "2", "␣", "+y"], want: "x_{i}^2+y" },
  { name: "matrix cell by cell, then out", template: "\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}", keys: ["a", "␣", "b", "␣", "c", "␣", "d", "␣", "=0"], want: "\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}=0" },
  { name: "accent: body → out", template: "\\hat{#?}", keys: ["x", "␣", "+1"], want: "\\hat{x}+1" },
  { name: "fence: body → out", template: "\\left(#?\\right)", keys: ["a+b", "␣", "c"], want: "\\left(a+b\\right)c" },
  { name: "nested: fraction in a numerator", template: "\\frac{\\frac{#?}{#?}}{#?}", keys: ["a", "␣", "b", "␣", "␣", "c", "␣", "d"], want: "\\frac{\\frac{a}{b}}{c}d" },
  { name: "Shift+Space goes back one slot", template: "\\frac{#?}{#?}", keys: ["a", "␣", "b", "⇧", "2"], want: "\\frac{a2}{b}" },
];
for (const c of SPACE_CASES) {
  const got = await run(c.template, c.keys);
  check(got === c.want, `Space — ${c.name}: got ${got}, want ${c.want}`);
}

// Space inside \text{} types a space.
await page.evaluate(() => {
  const mf = document.getElementById("mf") as unknown as MF;
  mf.value = "";
  mf.focus();
  mf.executeCommand(["switchMode", "text"]);
});
await page.keyboard.type("if x", { delay: 30 });
check(/if x/.test((await value()).replace(/\\,|~/g, " ")) || /if\\ x|if\s+x/.test(await value()), `Space in \\text{} types a space: ${await value()}`);

// Space Space opens the palette outside every structure, never inside one.
const palette = () => page.evaluate(() => (window as unknown as { __palette: number }).__palette);
const p0 = await palette();
await page.evaluate(() => {
  const mf = document.getElementById("mf") as unknown as MF;
  mf.value = "\\frac{a}{b}";
  mf.focus();
  mf.position = 2; // in the numerator
});
await page.keyboard.press("Space");
await page.keyboard.press("Space");
check((await palette()) === p0, "Space Space inside a fraction moves through its slots, not the palette");
await page.waitForTimeout(400);
await page.evaluate(() => {
  const mf = document.getElementById("mf") as unknown as MF;
  mf.value = "a+b";
  mf.focus();
  mf.position = mf.lastOffset;
});
await page.keyboard.press("Space");
await page.keyboard.press("Space");
check((await palette()) === p0 + 1, "Space Space outside every structure opens the palette");

// A kind: Space leaves it (caret right after it, the kind unchanged).
await page.waitForTimeout(400);
await page.evaluate(() => {
  const mf = document.getElementById("mf") as unknown as MF;
  mf.value = "\\class{nk-pvec}{\\overrightharpoon{\\mathbf{r}}}";
  mf.focus();
  mf.position = 2;
});
await page.keyboard.press("Space");
await page.keyboard.type("+1", { delay: 20 });
check((await value()).replace(/\s+/g, "").endsWith("}+1"), `Space leaves a kind: ${await value()}`);

// ------------------------------------------------------------------ Backspace at every caret position

const EQUATIONS = [
  "a+b=c",
  "\\frac{a}{b}+c",
  "x^2+y_{i}",
  "\\sqrt[3]{x}+1",
  "\\sum_{i=1}^{n}a_{i}",
  "\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}",
  "\\left(a+b\\right)\\cdot c",
  "\\hat{x}+\\dot{y}",
  "\\int_0^1f\\,dx",
  "\\class{nk-pvec}{\\overrightharpoon{\\mathbf{r}}}=\\class{nk-dcm}{\\mathbf{C}_{BN}}\\class{nk-cmat}{\\mathbf{c}}^{\\class{nk-T}{\\mathrm{T}}}",
  "\\frac{\\class{nk-pvec}{\\overrightharpoon{\\mathbf{r}}_{B/N}}}{2}+\\class{nk-bvec}{\\hat{\\mathbf{f}}}_1",
  "\\left(\\class{nk-pvec}{\\overrightharpoon{\\mathbf{h}}}\\right)",
  // A structure that is the whole equation: nothing may take the equation with it.
  "\\frac{a}{b}",
  "\\left(x\\right)",
  "\\sqrt{\\class{nk-pvec}{\\overrightharpoon{\\mathbf{r}}}}",
  "\\begin{bmatrix}\\class{nk-cmat}{\\mathbf{v}}\\end{bmatrix}",
];

let positions = 0;
let oldErasedAll = 0;
const oldExamples: string[] = [];
for (const eq of EQUATIONS) {
  const n = await page.evaluate((v) => {
    const mf = document.getElementById("mf") as unknown as MF;
    mf.value = v;
    return mf.lastOffset;
  }, eq);
  for (let p = 0; p <= n; p++) {
    positions++;
    const r = await page.evaluate(
      ([v, pos]) => {
        const mf = document.getElementById("mf") as unknown as MF & { _mathfield: { model: { atoms?: unknown[] } } };
        mf.value = v as string;
        mf.focus();
        mf.position = pos as number;
        // The old rule (kindRangeAt): the range it would have deleted at this position.
        let old: [number, number] | null = null;
        for (let k = 1; k <= 80; k++) {
          const a = (pos as number) - k;
          if (a < 0) break;
          const s = mf.getValue(a, pos, "latex");
          if (s.startsWith("\\class{nk-")) {
            const e = s.indexOf("}");
            let d = 0;
            let ok = false;
            for (let i = e + 1; i < s.length; i++) {
              if (s[i] === "\\") {
                i++;
                continue;
              }
              if (s[i] === "{") d++;
              else if (s[i] === "}" && --d === 0) {
                ok = i === s.length - 1;
                break;
              }
            }
            if (ok) {
              old = [a, pos as number];
              break;
            }
          }
        }
        let oldLeft = "";
        if (old) {
          mf.selection = { ranges: [old] };
          mf.executeCommand("deleteBackward");
          oldLeft = mf.value;
          mf.value = v as string;
          mf.position = pos as number;
        }
        return { before: mf.value, count: mf.lastOffset, oldLeft, oldHad: !!old };
      },
      [eq, p] as const,
    );
    if (r.oldHad && r.oldLeft.replace(/\s+/g, "").length < r.before.replace(/\s+/g, "").length / 3) {
      oldErasedAll++;
      if (oldExamples.length < 4) oldExamples.push(`${eq} at ${p} → “${r.oldLeft}”`);
    }
    await page.keyboard.press("Backspace");
    const a1 = await page.evaluate(() => {
      const mf = document.getElementById("mf") as unknown as MF;
      return { value: mf.value, count: mf.lastOffset, collapsed: mf.selectionIsCollapsed, sel: mf.selection.ranges[0] };
    });
    const where = `${eq} at ${p}`;
    if (!a1.collapsed && a1.value === r.before) {
      // Selected: the second Backspace deletes exactly the selection (the equation without the selected part).
      const expected = await page.evaluate(() => {
        const mf = document.getElementById("mf") as unknown as MF;
        const [s0, s1] = mf.selection.ranges[0]!;
        return { left: mf.getValue(0, Math.min(s0, s1), "latex"), right: mf.getValue(Math.max(s0, s1), mf.lastOffset, "latex"), part: mf.getValue(Math.min(s0, s1), Math.max(s0, s1), "latex") };
      });
      await page.keyboard.press("Backspace");
      const after = (await value()).replace(/\s+/g, "").replace(/[_^]\{\}/g, "");
      // The equation with the selected part taken out where it stands (inside its slot, if it is in one).
      const before = r.before.replace(/\s+/g, "");
      const part = expected.part.replace(/\s+/g, "");
      const want = (before.includes(part) ? before.replace(part, "") : (expected.left + expected.right).replace(/\s+/g, "")).replace(/[_^]\{\}/g, "");
      check(after === want, `${where}: the second Backspace should delete only “${expected.part}”: got “${after}”, want “${want}”`);
      if (after !== r.before.replace(/\s+/g, "")) await page.keyboard.press("Control+z");
    } else {
      check(r.count - a1.count <= 1, `${where}: one Backspace removed ${r.count - a1.count} positions (“${r.before}” → “${a1.value}”)`);
      if (a1.value !== r.before) await page.keyboard.press("Control+z");
    }
    const back = await value();
    check(back === r.before, `${where}: Ctrl+Z did not restore (“${back}”)`);
  }
}

await browser.close();
console.log(`Space: ${SPACE_CASES.length + 4} cases; Backspace: ${positions} caret positions in ${EQUATIONS.length} equations.`);
console.log(`The old whole-kind rule erased most of the equation at ${oldErasedAll} position(s)${oldExamples.length ? `, e.g. ${oldExamples.join("; ")}` : ""}.`);
if (failures.length) {
  console.log(`${failures.length} failure(s):\n  ${failures.slice(0, 40).join("\n  ")}`);
  process.exit(1);
}
console.log("All passed.");
void (null as unknown as Page);
