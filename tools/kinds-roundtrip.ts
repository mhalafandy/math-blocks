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
import { NEW_KIND_STYLE, registerCustomKinds } from "@mathblocks/math-core";
import { fromEditorLatex, toEditorLatex } from "../app/src/lib/kinds";
import { multlineFromEditor, multlineToEditor } from "../app/src/lib/multiline";
import { exitKind } from "../app/src/lib/kindExit";

const norm = (l: string) => serializeLatex(parseLatex(l).root);

// A kind of the user's own (Notation settings → New kind) goes through every check too.
registerCustomKinds([{ id: "u_angvel", name: "Angular velocity", macro: "angvel", snippet: "av", style: { ...NEW_KIND_STYLE, accent: "harpoon", frames: { position: "sub", separator: "/" } } }]);

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

// Kinds at any nesting depth: inside a group ({\pvec{r}_2}), a double group, a fraction, brackets.
let nestedCases = 0;
{
  const profile: NotationProfile = { preset: "hughes", overrides: {} };
  for (const k of KINDS) {
    const src = k.id === "T" ? "\\cmat{c}^{\\T}" : k.id === "dcm" ? "\\dcm{b}{a}" : k.id === "frm" ? "\\frm{a}" : k.id === "diff" ? "\\diff{m}" : `\\${k.macro}[P/O]{r}`;
    for (const form of [`{${src}_{2}}`, `{{${src}}}`, `\\frac{${src}}{2}`, `\\left(${src}\\right)`, `a+{b+{${src}}}`]) {
      cases.push({ id: `nested ${form}`, profile, editor: toEditorLatex(form, profile), expected: form });
      nestedCases++;
    }
  }
  // The exact cases reported from Word (outer braces, plain subscript).
  for (const form of ["{\\pvec{r}_2}", "x={\\pvec{r}_2}+1", "{{\\pvec{r}_2}}"]) {
    cases.push({ id: `nested exact ${form}`, profile, editor: toEditorLatex(form, profile), expected: form });
    nestedCases++;
  }
}

// Multi-line equations (aligned / gathered / multline) holding every kind: the editor form is the
// app's (multline held as a marked gathered, see multiline.ts).
const ENVS = ["aligned", "gathered", "multline"] as const;
let multiLineCases = 0;
for (const preset of Object.keys(PRESETS) as PresetId[]) {
  const profile: NotationProfile = { preset, overrides: {} };
  for (const k of KINDS) {
    const src = k.id === "T" ? "\\cmat{c}^{\\T}" : k.id === "dcm" ? "\\dcm{b}{a}" : k.id === "frm" ? "\\frm{a}" : k.id === "diff" ? "\\diff{m}" : `\\${k.macro}[P/O]{r}`;
    for (const env of ENVS) {
      const amp = env === "aligned" ? "&" : "";
      const latex = `\\begin{${env}}x${amp}=${src}+y\\\\ ${amp}\\quad+\\pvec{\\omega}\\times${src}\\\\ ${amp}=0\\end{${env}}`;
      cases.push({ id: `${preset} ${env} ${src}`, profile, editor: multlineToEditor(toEditorLatex(latex, profile)), expected: latex });
      multiLineCases++;
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
// Space / Tab inside a kind: the caret leaves it, the kind unchanged, what is typed next goes after it.
await page.evaluate(`window.exitKind = ${exitKind.toString()}`);
const exitCases = [...new Set(cases.filter((c) => !c.changeBase && c.id.includes("/harpoon") && !/[_'^]\{?2?\}?$|^\\dot/.test(c.editor) && !c.id.includes(" aligned ") && !c.id.includes(" gathered ") && !c.id.includes(" multline ")).map((c) => JSON.stringify([c.editor, c.expected, c.profile]))) ].map((x) => JSON.parse(x) as [string, string, NotationProfile]);
const exits: { editor: string; key: string; pos: number; value: string }[] = await page.evaluate(async (list) => {
  const mf = document.getElementById("mf") as unknown as { value: string; position: number; lastOffset: number; getValue: (a: number, b: number, f: string) => string; executeCommand: (c: unknown) => boolean };
  const exit = (window as unknown as { exitKind: (m: unknown, k: string) => boolean }).exitKind;
  const out: { editor: string; key: string; pos: number; value: string }[] = [];
  for (const editor of list) {
    mf.value = `y+${editor}`;
    const last = mf.lastOffset;
    // The kind (with any scripts of its own) starts after "y+" and ends the field.
    if (!mf.getValue(2, last, "latex").startsWith("\\class{nk-")) continue;
    for (const key of ["Space", "Tab"]) {
      // Every caret position inside the kind's wrapper (it starts after "y+", at offset 2).
      let kindEnd = last;
      for (let k = 3; k <= last; k++) {
        const v = mf.getValue(2, k, "latex");
        let d = 0;
        for (let i = 0; i < v.length; i++) {
          if (v[i] === "\\") { i++; continue; }
          if (v[i] === "{") d++;
          else if (v[i] === "}") d--;
        }
        if (d === 0 && v.startsWith("\\class{nk-") && v.endsWith("}")) { kindEnd = k; break; }
      }
      for (let p = 3; p < kindEnd; p++) {
        mf.value = `y+${editor}`;
        mf.position = p;
        const moved = exit(mf, key);
        if (!moved) {
          if (key === "Tab") continue; // an empty slot is still ahead: Tab goes there
          out.push({ editor, key, pos: p, value: "!not moved" });
          continue;
        }
        mf.executeCommand(["insert", "+x"]);
        out.push({ editor, key, pos: p, value: mf.value });
      }
    }
  }
  return out;
}, exitCases.map((c) => c[0]));
await browser.close();
const exitFailures: string[] = [];
for (const e of exits) {
  const c = exitCases.find((x) => x[0] === e.editor)!;
  const back = e.value.startsWith("!") ? e.value : fromEditorLatex(e.value, c[2]).latex;
  if (back !== norm(`y+${c[1]}+x`)) exitFailures.push(`${e.key} at ${e.pos} in ${c[1]}: ${back}   [MathLive: ${e.value}]`);
}
const deletionFailures = deletion.filter((d) => d.backspace !== "y++x" || d.del !== "y++x").map((d) => `${d.form}: backspace → ${d.backspace}, delete → ${d.del}`);
const crossingBroken = deletion.filter((d) => (d.crossing.match(/\\class\{nk-/g) ?? []).length && !d.crossing.includes("}{")).map((d) => `${d.form}: ${d.crossing}`);

const failures: string[] = [];
const handStyled: string[] = [];
cases.forEach((c, i) => {
  const got = results[i]!;
  const back = fromEditorLatex(multlineFromEditor(got), c.profile);
  if (back.handStyled.length) handStyled.push(`${c.id}: ${back.handStyled.map((h) => `${h.kind} ${h.latex}`).join("; ")}   [MathLive: ${got}]`);
  if (back.latex !== norm(c.expected)) failures.push(`${c.id}\n    editor:   ${c.editor}\n    MathLive: ${got}\n    back:     ${back.latex}\n    expected: ${norm(c.expected)}`);
});

const report = [
  "# Notation kinds round trip (MathLive)",
  "",
  `Generated by \`pnpm tsx tools/kinds-roundtrip.ts\`: ${cases.length} cases (${KINDS.length} kinds × 3 presets × 4 vector styles for physical vectors × ${BASES.length} bases × with/without frame labels × edits: none, subscript, prime, dot, change base; plus ${multiLineCases} multi-line cases: every kind inside aligned, gathered and multline under each preset; plus ${nestedCases} nested cases: every kind in a group, a double group, a fraction, brackets).`,
  "",
  `- Passed: ${cases.length - failures.length}`,
  `- Failed: ${failures.length}`,
  `- Fell back to hand-styled: ${handStyled.length}`,
  "",
  `- Deletion (Backspace after / Delete before a kind, ${deletion.length} kinds): ${deletion.length - deletionFailures.length} removed whole${deletionFailures.length ? `, ${deletionFailures.length} not` : ""}`,
  `- Selection crossing a kind's edge then Delete: ${crossingBroken.length ? `${crossingBroken.length} left a broken wrapper` : "all well-formed"} (e.g. ${deletion[0] ? `y+${deletion[0].form}+x → ${deletion[0].crossing}` : "—"})`,
  `- Space / Tab inside a kind (${exits.length} caret positions): ${exits.length - exitFailures.length} left the kind unchanged${exitFailures.length ? `, ${exitFailures.length} not` : ""}`,
  "",
  ...(exitFailures.length ? ["## Space / Tab exit failures", "", ...exitFailures.slice(0, 40).map((d) => `- ${d}`), ""] : []),
  ...(deletionFailures.length ? ["## Deletion failures", "", ...deletionFailures.map((d) => `- ${d}`), ""] : []),
  ...(failures.length ? ["## Failures", "", "```", ...failures.slice(0, 80), "```", ""] : []),
  ...(handStyled.length ? ["## Hand-styled fallbacks", "", ...handStyled.slice(0, 80).map((h) => `- ${h}`), ""] : []),
];
writeFileSync(new URL("../docs/KINDS-ROUNDTRIP.md", import.meta.url), report.join("\n"));
console.log(`${cases.length} cases: ${failures.length} failed, ${handStyled.length} hand-styled`);
if (deletionFailures.length) console.log("deletion:", deletionFailures.slice(0, 10).join("\n"));
if (exitFailures.length) console.log("space/tab exit:", exitFailures.length, "failed\n" + exitFailures.slice(0, 10).join("\n"));
if (failures.length || deletionFailures.length || crossingBroken.length || exitFailures.length) {
  console.log(failures.slice(0, 15).join("\n"));
  process.exit(1);
}
