/**
 * Palette audit (Phase 0): for every symbol-palette entry, checks
 *  (a) MathLive accepts it, (b) math-render Classic draws every character from Times/Symbol
 *  (full), only from the STIX fallback (converted: a different-looking font), or not at all,
 *  (c) it converts to OMML without dropped or unparsed parts, (d) LaTeX parse → serialize → parse
 *  gives the same tree. Also lists required catalog items that no entry provides.
 * Run: pnpm tsx tools/palette-audit.ts  → docs/palette-audit.csv, docs/PALETTE-AUDIT.md
 *
 * Fonts: Times New Roman is not available here; Liberation Serif (same metrics, similar but not
 * identical coverage) stands in. The Symbol font's repertoire is the fixed Adobe Symbol set, so
 * coverage is taken from the renderer's own SYMBOL_CODES table.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { MathNode, Row } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { toOmml } from "@mathblocks/math-omml";
import { SPACE_CHARS } from "../packages/math-omml/src/writer";
import { loadFont, renderSvg, type FontSet } from "@mathblocks/math-render";
import { charGlyph, SYMBOL_CODES } from "../packages/math-render/src/fonts";
import { ALL_ITEMS, plainLatex } from "../app/src/lib/palette";

const require = createRequire(new URL("../app/package.json", import.meta.url));
const { validateLatex } = (await import(new URL("../app/node_modules/mathlive/mathlive-ssr.min.mjs", import.meta.url).href)) as { validateLatex: (s: string) => { code: string; arg?: string }[] };

const L = "/usr/share/fonts/truetype/liberation/LiberationSerif-";
const STIX = require.resolve("@fontsource/stix-two-math/files/stix-two-math-latin-400-normal.woff", { paths: [new URL("../packages/math-render/", import.meta.url).pathname] });
if (!existsSync(L + "Regular.ttf")) throw new Error("Liberation Serif not installed");
const fonts: FontSet = {
  regular: loadFont(readFileSync(L + "Regular.ttf")),
  italic: loadFont(readFileSync(L + "Italic.ttf")),
  bold: loadFont(readFileSync(L + "Bold.ttf")),
  boldItalic: loadFont(readFileSync(L + "BoldItalic.ttf")),
  math: loadFont(readFileSync(STIX)),
};

// Same set as math-render's layout.ts: characters MathType takes from the Symbol font.
const SYMBOL_STYLE = new Set([..."+−=<>±×÷≤≥≠≈≡∼≅∝∂∞∇∈∉∋⊂⊃⊆⊇∩∪→←↔⇒⇔⇐↑↓⋅•…′″∀∃¬∧∨⊥∠∅⊗⊕"]);
const GREEK = /[\u0391-\u03a9\u03b1-\u03c9ϑϕϖϰϱϵς]/;
const STIX_VARIANTS = /double-struck|script|fraktur|sans-serif|monospace|calligraphic/;

type Support = "full" | "converted" | "workaround" | "unsupported";

function chars(root: Row): { ch: string; variant?: string }[] {
  const out: { ch: string; variant?: string }[] = [];
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(visit);
    const n = v as MathNode & Record<string, unknown>;
    if ((n.kind === "ident" || n.kind === "number" || n.kind === "operator" || n.kind === "text") && typeof n.text === "string")
      for (const ch of n.text) out.push({ ch, variant: (n as { variant?: string }).variant });
    if (n.kind === "nary" && typeof n.op === "string") for (const ch of n.op) out.push({ ch });
    for (const k of ["open", "close", "middle"]) if (typeof n[k] === "string") for (const ch of n[k] as string) out.push({ ch });
    for (const [k, x] of Object.entries(n)) if (k !== "meta" && typeof x === "object") visit(x);
  };
  visit(root);
  return out.filter((c) => c.ch.trim() && c.ch !== "□");
}

function classicSupport(root: Row): { s: Support; note: string } {
  const stix: string[] = [];
  const none: string[] = [];
  for (const { ch, variant } of chars(root)) {
    if (variant && STIX_VARIANTS.test(variant)) {
      stix.push(`${ch}(${variant})`);
      continue;
    }
    if ((GREEK.test(ch) || SYMBOL_STYLE.has(ch)) && SYMBOL_CODES[ch] !== undefined) continue;
    if (charGlyph(fonts.regular, ch)) continue;
    if (charGlyph(fonts.math, ch)) stix.push(ch);
    else none.push(ch);
  }
  if (none.length) return { s: "unsupported", note: `missing glyph: ${[...new Set(none)].join(" ")}` };
  if (stix.length) return { s: "converted", note: `STIX fallback (not Times/Symbol): ${[...new Set(stix)].join(" ")}` };
  return { s: "full", note: "" };
}

const strip = (x: unknown): unknown => JSON.parse(JSON.stringify(x, (k, v) => (k === "meta" ? undefined : v)));

function nodes(root: Row): MathNode[] {
  const out: MathNode[] = [];
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(visit);
    const n = v as MathNode;
    if (n.kind) out.push(n);
    for (const [k, x] of Object.entries(n)) if (k !== "meta" && typeof x === "object") visit(x);
  };
  visit(root);
  return out;
}

interface Row_ {
  key: string;
  group: string;
  name: string;
  latex: string;
  mathlive: Support;
  classic: Support;
  omml: Support;
  roundtrip: Support;
  notes: string[];
}

const rows: Row_[] = [];
for (const { key, group, item } of ALL_ITEMS) {
  const notes: string[] = [];
  const plain = plainLatex(item.latex);
  const ml = validateLatex(item.latex.replace(/#0/g, "x").replace(/#\?/g, "\\placeholder{}"));
  const mathlive: Support = ml.length ? "unsupported" : "full";
  if (ml.length) notes.push(`MathLive: ${ml.map((e) => `${e.code}${e.arg ? ` ${e.arg}` : ""}`).join(", ")}`);

  const { root, diagnostics } = parseLatex(plain);
  const all = nodes(root);
  let omml: Support = "full";
  if (diagnostics.length || all.some((n) => n.kind === "raw")) {
    omml = "unsupported";
    notes.push(`parse: ${diagnostics.map((d) => d.message).join("; ") || "raw node"}`);
  } else {
    try {
      toOmml(root, { display: true });
      const dropped = all.filter((n) => n.kind === "space" && !SPACE_CHARS[(n as { width: string }).width]);
      if (dropped.length) {
        omml = "workaround";
        notes.push(`OMML drops space: ${dropped.map((n) => (n as { width: string }).width).join(",")}`);
      }
    } catch (e) {
      omml = "unsupported";
      notes.push(`OMML: ${String(e)}`);
    }
  }

  let classic = classicSupport(root);
  try {
    const r = renderSvg(root, { fonts, display: true });
    if (!Number.isFinite(r.widthPt) || r.svg.includes("NaN")) classic = { s: "unsupported", note: "renderer produced NaN" };
    else if (all.length && r.widthPt <= 0) classic = { s: "unsupported", note: "renderer produced an empty picture" };
  } catch (e) {
    classic = { s: "unsupported", note: `renderer error: ${String(e)}` };
  }
  if (classic.note) notes.push(`Classic: ${classic.note}`);

  let roundtrip: Support = "full";
  const again = parseLatex(serializeLatex(root));
  if (JSON.stringify(strip(again.root)) !== JSON.stringify(strip(root))) {
    roundtrip = "unsupported";
    notes.push(`round trip changes it: ${serializeLatex(root)}`);
  }
  rows.push({ key, group: group.label, name: item.name, latex: item.latex, mathlive, classic: classic.s, omml, roundtrip, notes });
}

// ------------------------------------------------------------------ required catalog (Phase 1.4)
const REQUIRED: [string, string[]][] = [
  ["Greek variants", ["\\epsilon", "\\varepsilon", "\\vartheta", "\\varkappa", "\\varrho", "\\varsigma", "\\varpi", "\\phi", "\\varphi"]],
  ["Greek lowercase", ["\\alpha", "\\beta", "\\gamma", "\\delta", "\\zeta", "\\eta", "\\theta", "\\iota", "\\kappa", "\\lambda", "\\mu", "\\nu", "\\xi", "\\pi", "\\rho", "\\sigma", "\\tau", "\\upsilon", "\\chi", "\\psi", "\\omega"]],
  ["Greek uppercase", ["\\Gamma", "\\Delta", "\\Theta", "\\Lambda", "\\Xi", "\\Pi", "\\Sigma", "\\Upsilon", "\\Phi", "\\Psi", "\\Omega"]],
  ["Binary operators", ["\\pm", "\\mp", "\\times", "\\cdot", "\\circ", "\\oplus", "\\otimes", "\\odot", "\\dagger", "\\ddagger", "\\div", "\\ast", "\\star", "\\bullet", "\\wedge", "\\vee", "\\setminus", "\\ominus", "\\cap", "\\cup"]],
  ["Relations", ["\\leq", "\\geq", "\\neq", "\\approx", "\\equiv", "\\sim", "\\simeq", "\\cong", "\\propto", "\\triangleq", "\\coloneqq", "\\parallel", "\\perp", "\\mid", "\\nmid", "\\ll", "\\gg", "\\nless", "\\ngtr", "\\nleq", "\\ngeq", "\\nsim", "\\ncong", "\\nparallel", "\\prec", "\\succ", "\\preceq", "\\succeq", "\\doteq"]],
  ["Sets", ["\\in", "\\notin", "\\ni", "\\subset", "\\subseteq", "\\supset", "\\supseteq", "\\cup", "\\cap", "\\setminus", "\\emptyset", "\\varnothing", "\\mathbb{N}", "\\mathbb{Z}", "\\mathbb{Q}", "\\mathbb{R}", "\\mathbb{C}", "\\mathbb{H}", "\\subsetneq", "\\nsubseteq"]],
  ["Logic", ["\\forall", "\\exists", "\\nexists", "\\wedge", "\\vee", "\\neg", "\\Rightarrow", "\\Leftrightarrow", "\\therefore", "\\because", "\\vdash", "\\models", "\\top", "\\bot"]],
  ["Arrows", ["\\to", "\\leftarrow", "\\leftrightarrow", "\\Rightarrow", "\\Leftarrow", "\\Leftrightarrow", "\\longrightarrow", "\\longleftarrow", "\\longleftrightarrow", "\\Longrightarrow", "\\Longleftarrow", "\\Longleftrightarrow", "\\hookrightarrow", "\\hookleftarrow", "\\mapsto", "\\longmapsto", "\\rightharpoonup", "\\rightharpoondown", "\\leftharpoonup", "\\leftharpoondown", "\\rightleftharpoons", "\\uparrow", "\\downarrow", "\\updownarrow", "\\Uparrow", "\\Downarrow", "\\nearrow", "\\searrow", "\\nwarrow", "\\swarrow"]],
  ["Calculus", ["\\partial", "\\nabla", "\\int", "\\iint", "\\iiint", "\\oint", "\\oiint", "\\sum", "\\prod", "\\coprod", "\\infty", "\\lim", "\\limsup", "\\liminf", "\\dot", "\\ddot", "\\dddot", "\\ddddot", "\\prime", "\\nabla\\cdot", "\\nabla\\times", "\\nabla^{2}", "\\mathrm{d}", "\\mathrm{D}"]],
  ["Linear algebra", ["\\det", "\\operatorname{tr}", "\\operatorname{rank}", "\\operatorname{diag}", "\\ker", "\\operatorname{span}", "\\dim", "^{\\mathbf{T}}", "^{-1}", "^{\\mathsf{H}}", "\\left\\|", "\\langle"]],
  ["Delimiters", ["\\left(", "\\left[", "\\left\\{", "\\left|", "\\left\\|", "\\left\\langle", "\\left\\lfloor", "\\left\\lceil", "\\left.", "\\right.", "\\bigl(", "\\Bigl(", "\\biggl(", "\\Biggl("]],
  ["Accents", ["\\bar", "\\overline", "\\hat", "\\widehat", "\\tilde", "\\widetilde", "\\vec", "\\overrightarrow", "\\overleftarrow", "\\overrightharpoon", "\\acute", "\\grave", "\\breve", "\\check", "\\mathring", "\\underline"]],
  ["Letter styles", ["\\mathbf", "\\boldsymbol", "\\mathcal", "\\mathbb", "\\mathfrak", "\\mathrm", "\\mathsf", "\\mathit", "\\mathscr"]],
  ["Functions", ["\\sin", "\\cos", "\\tan", "\\cot", "\\sec", "\\csc", "\\sinh", "\\cosh", "\\tanh", "\\coth", "\\operatorname{sech}", "\\operatorname{csch}", "\\arcsin", "\\arccos", "\\arctan", "\\log", "\\ln", "\\exp", "\\max", "\\min", "\\sup", "\\inf", "\\Re", "\\Im", "\\arg", "\\Pr", "\\hbar", "\\mathrm{e}", "\\mathrm{i}"]],
];

const allLatex = ALL_ITEMS.map((x) => x.item.latex).join(" ");
const has = (cmd: string) => {
  const esc = cmd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(esc + (/[a-zA-Z]$/.test(cmd) ? "(?![a-zA-Z])" : "")).test(allLatex);
};
const missing = REQUIRED.map(([cat, list]) => [cat, list.filter((c) => !has(c))] as const).filter(([, l]) => l.length);

// ------------------------------------------------------------------ output
const csv = (s: string) => `"${s.replace(/"/g, '""')}"`;
writeFileSync(
  new URL("../docs/palette-audit.csv", import.meta.url),
  ["key,group,name,latex,mathlive,classic,omml,roundtrip,notes", ...rows.map((r) => [r.key, r.group, r.name, r.latex, r.mathlive, r.classic, r.omml, r.roundtrip, r.notes.join(" | ")].map(csv).join(","))].join("\n") + "\n",
);

const count = (col: keyof Row_, v: Support) => rows.filter((r) => r[col] === v).length;
const failures = rows.filter((r) => r.mathlive !== "full" || r.classic !== "full" || r.omml !== "full" || r.roundtrip !== "full");
const md = [
  "# Palette audit",
  "",
  `Generated by \`pnpm tsx tools/palette-audit.ts\` over ${rows.length} palette entries (${new Set(rows.map((r) => r.latex)).size} distinct LaTeX). Full data: [palette-audit.csv](palette-audit.csv).`,
  "",
  "Classic is checked with Liberation Serif standing in for Times New Roman (same metrics, similar coverage) and the Adobe Symbol repertoire; *converted* = drawn from the STIX Two Math fallback, so it looks different from Times/Symbol.",
  "",
  "| Check | full | converted | workaround | unsupported |",
  "|---|---|---|---|---|",
  ...(["mathlive", "classic", "omml", "roundtrip"] as const).map((c) => `| ${c} | ${count(c, "full")} | ${count(c, "converted")} | ${count(c, "workaround")} | ${count(c, "unsupported")} |`),
  "",
  `## Entries not fully supported (${failures.length})`,
  "",
  "| Entry | LaTeX | MathLive | Classic | OMML | Round trip | Notes |",
  "|---|---|---|---|---|---|---|",
  ...failures.map((r) => `| ${r.group} › ${r.name} | \`${r.latex.replace(/\|/g, "\\|")}\` | ${r.mathlive} | ${r.classic} | ${r.omml} | ${r.roundtrip} | ${r.notes.join("; ").replace(/\|/g, "\\|")} |`),
  "",
  "## Required catalog items with no palette entry",
  "",
  ...missing.map(([cat, l]) => `- **${cat}** (${l.length}): ${l.map((c) => `\`${c}\``).join(" ")}`),
  "",
];
writeFileSync(new URL("../docs/PALETTE-AUDIT.md", import.meta.url), md.join("\n"));
console.log(`${rows.length} entries, ${failures.length} not fully supported, ${missing.reduce((n, [, l]) => n + l.length, 0)} required items missing`);
