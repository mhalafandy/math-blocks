/// <reference lib="dom" />
/**
 * Round-trip property test for notation kinds in the real visual editor (MathLive, headless
 * Chromium): source → expanded \class form → MathLive getValue() → back to source, for every kind
 * × preset × vector style × base × with/without frame labels × common edits (subscript, prime,
 * dot, and changing the base by selecting it and typing). Fails on any mismatch; lists every case
 * that fell back to hand-styled. Run: pnpm tsx tools/kinds-roundtrip.ts (CI: Linux job).
 */
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { KINDS, PRESETS, type KindStyle, type NotationProfile, type PresetId } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { fromEditorLatex, toEditorLatex } from "../app/src/lib/kinds";

const norm = (l: string) => serializeLatex(parseLatex(l).root);

const VECTOR_STYLES: Record<string, Partial<KindStyle>> = {
  harpoon: { weight: "bold", shape: "upright", accent: "harpoon" },
  arrow: { weight: "bold", shape: "upright", accent: "arrow" },
  plainArrow: { weight: "regular", shape: "italic", accent: "arrow" },
  bold: { weight: "bold", shape: "upright", accent: "none" },
};
const BASES = ["a", "r", "\\omega", "F", "H", "\\Sigma", "b_1"];

interface Case {
  id: string;
  profile: NotationProfile;
  editor: string;
  expected: string;
  /** Interactive edit in MathLive: replace the base letter with q. */
  changeBase?: { from: string };
}

const profiles: { name: string; profile: NotationProfile }[] = [];
for (const preset of Object.keys(PRESETS) as PresetId[]) {
  for (const [vs, over] of Object.entries(VECTOR_STYLES)) profiles.push({ name: `${preset}/${vs}`, profile: { preset, overrides: { pvec: over } } });
}

const cases: Case[] = [];
for (const { name, profile } of profiles) {
  for (const k of KINDS) {
    // Vector styles only change the physical vector: other kinds once per preset.
    if (k.id !== "pvec" && !name.endsWith("/harpoon")) continue;
    const sources: { src: string; base?: string }[] = [];
    if (k.id === "T") sources.push({ src: "\\cmat{c}^{\\T}" });
    else if (k.id === "dcm") sources.push({ src: "\\dcm{b}{a}" }, { src: "\\dcm{B}{N}" });
    else if (k.id === "frm") sources.push({ src: "\\frm{a}" }, { src: "\\frm{B}" });
    else if (k.id === "diff") sources.push({ src: "\\diff{m}" }, { src: "\\diff{t}" });
    else
      for (const b of BASES) {
        sources.push({ src: `\\${k.macro}{${b}}`, base: b });
        sources.push({ src: `\\${k.macro}[P/O]{${b}}`, base: b });
      }
    for (const { src, base } of sources) {
      const ed = toEditorLatex(src, profile);
      const id = `${name} ${src}`;
      cases.push({ id, profile, editor: ed, expected: src });
      cases.push({ id: `${id} +sub`, profile, editor: `${ed}_{2}`, expected: `${src}_{2}` });
      cases.push({ id: `${id} +prime`, profile, editor: `${ed}'`, expected: `${src}'` });
      cases.push({ id: `${id} +dot`, profile, editor: `\\dot{${ed}}`, expected: `\\dot{${src}}` });
      if (base) cases.push({ id: `${id} change base`, profile, editor: ed, expected: src.replace(`{${base}}`, `{${base.replace(/^(\\[A-Za-z]+|[A-Za-z])/, "q")}}`), changeBase: { from: base } });
    }
  }
}

const mathlive = pathToFileURL(realpathSync(fileURLToPath(new URL("../app/node_modules/mathlive/mathlive.min.mjs", import.meta.url)))).href;
const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("page error:", e.message));
const html = join(mkdtempSync(join(tmpdir(), "mb-kinds-")), "page.html");
writeFileSync(html, `<!doctype html><html><body><math-field id="mf"></math-field><script type="module">import "${mathlive}"; window.__ready = true;</script></body></html>`);
await page.goto(pathToFileURL(html).href);
await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 30000 });

const results: string[] = await page.evaluate(async (list) => {
  await customElements.whenDefined("math-field");
  const mf = document.getElementById("mf") as unknown as {
    value: string;
    lastOffset: number;
    selection: unknown;
    getValue: (a?: unknown, b?: unknown, c?: unknown) => string;
    executeCommand: (c: unknown) => boolean;
    focus: () => void;
  };
  mf.focus();
  const out: string[] = [];
  for (const c of list) {
    mf.value = c.editor;
    if (c.changeBase) {
      // Select the base letter inside the kind (the first atom whose LaTeX ends with it) and type q.
      const letter = c.changeBase.from.replace(/_.*$/, "");
      let done = false;
      for (let p = 0; p < mf.lastOffset && !done; p++) {
        const atom = mf.getValue(p, p + 1, "latex");
        if (atom.endsWith(letter) || atom.endsWith(`{${letter}}`)) {
          mf.selection = { ranges: [[p, p + 1]], direction: "forward" };
          mf.executeCommand(["insert", "q"]);
          done = true;
        }
      }
      if (!done) {
        out.push("!no base atom found");
        continue;
      }
    }
    out.push(mf.getValue("latex"));
  }
  return out;
}, cases.map((c) => ({ editor: c.editor, changeBase: c.changeBase })));
// Deletion: Backspace after a kind / Delete before it removes the whole kind (the app's
// kindRangeAt logic, same algorithm), and a selection crossing a kind's edge stays well-formed.
// tsx names inner functions with a __name helper that the page does not have.
await page.evaluate("window.__name = (f) => f");
const deletion = await page.evaluate(async (forms) => {
  const mf = document.getElementById("mf") as unknown as {
    value: string; lastOffset: number; position: number; selection: unknown;
    getValue: (a?: unknown, b?: unknown, c?: unknown) => string; executeCommand: (c: unknown) => boolean;
  };
  const complete = (v: string) => {
    const e = v.indexOf("}");
    if (e < 0 || v[e + 1] !== "{") return false;
    let d = 0;
    for (let i = e + 1; i < v.length; i++) {
      if (v[i] === "\\") { i++; continue; }
      if (v[i] === "{") d++;
      else if (v[i] === "}" && --d === 0) return i === v.length - 1;
    }
    return false;
  };
  const range = (pos: number, dir: number): [number, number] | null => {
    for (let n = 1; n <= 80; n++) {
      const [a, b] = dir < 0 ? [pos - n, pos] : [pos, pos + n];
      if (a < 0 || b > mf.lastOffset) return null;
      const v = mf.getValue(a, b, "latex");
      if (v.startsWith("\\class{nk-") && complete(v)) return [a, b];
    }
    return null;
  };
  const out: { form: string; backspace: string; del: string; crossing: string }[] = [];
  for (const f of forms) {
    mf.value = `y+${f}+x`;
    // Caret right after the kind: find the offset where the text before ends with the kind.
    const after = mf.lastOffset - 2; // before the final "+x"
    let backspace = "!caret";
    if (after >= 0) {
      const r = range(after, -1);
      if (r) { mf.selection = { ranges: [r], direction: "forward" }; mf.executeCommand("deleteBackward"); backspace = mf.getValue("latex"); } else backspace = "!no range";
    }
    mf.value = `y+${f}+x`;
    let del = "!caret";
    for (const p of [2]) {
      const r = range(p, 1);
      if (r) { mf.selection = { ranges: [r], direction: "forward" }; mf.executeCommand("deleteBackward"); del = mf.getValue("latex"); } else del = "!no range";
      break;
    }
    // Crossing selection: from the middle of the kind to the end.
    mf.value = `y+${f}+x`;
    mf.selection = { ranges: [[Math.max(3, after - 1), mf.lastOffset]], direction: "forward" };
    mf.executeCommand("deleteBackward");
    out.push({ form: f, backspace, del, crossing: mf.getValue("latex") });
  }
  return out;
}, [...new Set(cases.filter((c) => !c.changeBase && !/[_'^]\{?2?\}?$|^\\dot/.test(c.editor) && c.id.includes("hughes/harpoon") && !/\}_1$/.test(c.editor)).map((c) => c.editor))].slice(0, 40));
await browser.close();
const deletionFailures = deletion.filter((d) => d.backspace !== "y++x" || d.del !== "y++x").map((d) => `${d.form}: backspace → ${d.backspace}, delete → ${d.del}`);
const crossingBroken = deletion.filter((d) => (d.crossing.match(/\\class\{nk-/g) ?? []).length && !d.crossing.includes("}{")).map((d) => `${d.form}: ${d.crossing}`);

const failures: string[] = [];
const handStyled: string[] = [];
cases.forEach((c, i) => {
  const got = results[i]!;
  const back = fromEditorLatex(got, c.profile);
  if (back.handStyled.length) handStyled.push(`${c.id}: ${back.handStyled.map((h) => `${h.kind} ${h.latex}`).join("; ")}   [MathLive: ${got}]`);
  if (back.latex !== norm(c.expected)) failures.push(`${c.id}\n    editor:   ${c.editor}\n    MathLive: ${got}\n    back:     ${back.latex}\n    expected: ${norm(c.expected)}`);
});

const report = [
  "# Notation kinds round trip (MathLive)",
  "",
  `Generated by \`pnpm tsx tools/kinds-roundtrip.ts\`: ${cases.length} cases (${KINDS.length} kinds × 3 presets × 4 vector styles for physical vectors × ${BASES.length} bases × with/without frame labels × edits: none, subscript, prime, dot, change base).`,
  "",
  `- Passed: ${cases.length - failures.length}`,
  `- Failed: ${failures.length}`,
  `- Fell back to hand-styled: ${handStyled.length}`,
  "",
  `- Deletion (Backspace after / Delete before a kind, ${deletion.length} kinds): ${deletion.length - deletionFailures.length} removed whole${deletionFailures.length ? `, ${deletionFailures.length} not` : ""}`,
  `- Selection crossing a kind's edge then Delete: ${crossingBroken.length ? `${crossingBroken.length} left a broken wrapper` : "all well-formed"} (e.g. ${deletion[0] ? `y+${deletion[0].form}+x → ${deletion[0].crossing}` : "—"})`,
  "",
  ...(deletionFailures.length ? ["## Deletion failures", "", ...deletionFailures.map((d) => `- ${d}`), ""] : []),
  ...(failures.length ? ["## Failures", "", "```", ...failures.slice(0, 80), "```", ""] : []),
  ...(handStyled.length ? ["## Hand-styled fallbacks", "", ...handStyled.slice(0, 80).map((h) => `- ${h}`), ""] : []),
];
writeFileSync(new URL("../docs/KINDS-ROUNDTRIP.md", import.meta.url), report.join("\n"));
console.log(`${cases.length} cases: ${failures.length} failed, ${handStyled.length} hand-styled`);
if (deletionFailures.length) console.log("deletion:", deletionFailures.slice(0, 10).join("\n"));
if (failures.length || deletionFailures.length || crossingBroken.length) {
  console.log(failures.slice(0, 15).join("\n"));
  process.exit(1);
}
