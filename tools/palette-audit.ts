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
import { fileURLToPath } from "node:url";
import type { MathNode, Row } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { toOmml } from "@mathblocks/math-omml";
import { SPACE_CHARS } from "../packages/math-omml/src/writer";
import { charGlyph, CLASSIC, glyphSource, loadFont, renderSvg, SYMBOL_CODES, type FontSet } from "@mathblocks/math-render";
import { ALL_ITEMS, plainLatex } from "../app/src/lib/palette";

const require = createRequire(new URL("../app/package.json", import.meta.url));
const { validateLatex } = (await import(new URL("../app/node_modules/mathlive/mathlive-ssr.min.mjs", import.meta.url).href)) as { validateLatex: (s: string) => { code: string; arg?: string }[] };

const STIX = require.resolve("@fontsource/stix-two-math/files/stix-two-math-latin-400-normal.woff", { paths: [fileURLToPath(new URL("../packages/math-render/", import.meta.url))] });

// Real Windows fonts when present (Windows CI job, the owner's PC); Liberation Serif otherwise.
const WIN = "C:/Windows/Fonts/";
const windows = existsSync(WIN + "times.ttf") && existsSync(WIN + "symbol.ttf");
const L = "/usr/share/fonts/truetype/liberation/LiberationSerif-";
const textFiles = windows ? ["times.ttf", "timesi.ttf", "timesbd.ttf", "timesbi.ttf"].map((f) => WIN + f) : ["Regular", "Italic", "Bold", "BoldItalic"].map((f) => `${L}${f}.ttf`);
if (!existsSync(textFiles[0]!)) throw new Error("Neither Times New Roman nor Liberation Serif is installed");
const fonts: FontSet = {
  regular: loadFont(readFileSync(textFiles[0]!)),
  italic: loadFont(readFileSync(textFiles[1]!)),
  bold: loadFont(readFileSync(textFiles[2]!)),
  boldItalic: loadFont(readFileSync(textFiles[3]!)),
  math: loadFont(readFileSync(STIX)),
  ...(windows ? { symbol: loadFont(readFileSync(WIN + "symbol.ttf")) } : {}),
};
const FONT_NOTE = windows
  ? "Fonts: the real Times New Roman and Symbol of a Windows machine (CI windows-latest)."
  : "Fonts: Liberation Serif stands in for Times New Roman (same metrics, similar but not identical coverage); the Symbol font's repertoire is taken from the renderer's Adobe Symbol table.";
const OUT = windows ? "PALETTE-AUDIT-windows" : "PALETTE-AUDIT";

const STIX_VARIANTS = /double-struck|script|fraktur|sans-serif|monospace|calligraphic/;

type Support = "full" | "converted" | "workaround" | "unsupported";
type CharKind = "ident" | "number" | "operator" | "text";
function chars(root: Row): { ch: string; variant?: string; kind: CharKind }[] {
  const out: { ch: string; variant?: string; kind: CharKind }[] = [];
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(visit);
    const n = v as MathNode & Record<string, unknown>;
    if ((n.kind === "ident" || n.kind === "number" || n.kind === "operator" || n.kind === "text") && typeof n.text === "string")
      for (const ch of n.text) out.push({ ch, variant: (n as { variant?: string }).variant, kind: n.kind as CharKind });
    if (n.kind === "nary" && typeof n.op === "string") for (const ch of n.op) out.push({ ch, kind: "operator" });
    for (const k of ["open", "close", "middle"]) if (typeof n[k] === "string") for (const ch of n[k] as string) out.push({ ch, kind: "operator" });
    for (const [k, x] of Object.entries(n)) if (k !== "meta" && typeof x === "object") visit(x);
  };
  visit(root);
  return out.filter((c) => c.ch.trim() && c.ch !== "□");
}

function classicSupport(root: Row): { s: Support; note: string } {
  const stix: string[] = [];
  const none: string[] = [];
  for (const { ch, variant, kind } of chars(root)) {
    // Symbol-font repertoire without the font file (Linux): the renderer's own table.
    if (!fonts.symbol && SYMBOL_CODES[ch] !== undefined && (/[\u0391-\u03c9ϑϕϖϰϱϵς]/.test(ch) || kind === "operator")) continue;
    const src = glyphSource(ch, kind, fonts, CLASSIC, variant as never);
    if (src === "math") stix.push(variant && STIX_VARIANTS.test(variant) ? `${ch}(${variant})` : ch);
    else if (src === "none") none.push(ch);
  }
  if (none.length) return { s: "unsupported", note: `missing glyph: ${[...new Set(none)].join(" ")}` };
  if (stix.length) return { s: "converted", note: `STIX fallback (not Times/Symbol): ${[...new Set(stix)].join(" ")}` };
  return { s: "full", note: "" };
}

/** Tree without positions, keys sorted (only the structure matters). */
const strip = (x: unknown): unknown =>
  JSON.parse(
    JSON.stringify(x, (k, v) =>
      k === "meta" ? undefined : v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
    ),
  );

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
    const r = renderSvg(root, { fonts, display: true, style: CLASSIC });
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
  new URL(`../docs/${OUT.toLowerCase()}.csv`, import.meta.url),
  ["key,group,name,latex,mathlive,classic,omml,roundtrip,notes", ...rows.map((r) => [r.key, r.group, r.name, r.latex, r.mathlive, r.classic, r.omml, r.roundtrip, r.notes.join(" | ")].map(csv).join(","))].join("\n") + "\n",
);

const count = (col: keyof Row_, v: Support) => rows.filter((r) => r[col] === v).length;
const failures = rows.filter((r) => r.mathlive !== "full" || r.classic !== "full" || r.omml !== "full" || r.roundtrip !== "full");
const md = [
  "# Palette audit",
  "",
  `Generated by \`pnpm tsx tools/palette-audit.ts\` over ${rows.length} palette entries (${new Set(rows.map((r) => r.latex)).size} distinct LaTeX). Full data: [${OUT.toLowerCase()}.csv](${OUT.toLowerCase()}.csv).`,
  "",
  `${FONT_NOTE} *converted* = drawn from the STIX Two Math fallback, so it looks different from Times/Symbol.`,
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
md.push(...metricsReport());
writeFileSync(new URL(`../docs/${OUT}.md`, import.meta.url), md.join("\n"));
console.log(`${rows.length} entries, ${failures.length} not fully supported, ${missing.reduce((n, [, l]) => n + l.length, 0)} required items missing`);

/** STIX Two Math next to the text font: size (x-height, cap height) and stroke weight (minus bar, vertical bar). */
function metricsReport(): string[] {
  const m = (f: FontSet["regular"]) => {
    const upm = f.unitsPerEm;
    const os2 = ((f as unknown as { tables: unknown }).tables as { os2?: { sxHeight?: number; sCapHeight?: number } }).os2 ?? {};
    const bbox = (ch: string) => charGlyph(f, ch);
    const minus = bbox("−") ?? bbox("-");
    const bar = bbox("|");
    const plus = bbox("+");
    return {
      xHeight: os2.sxHeight ? os2.sxHeight / upm : (bbox("x")?.h ?? NaN),
      capHeight: os2.sCapHeight ? os2.sCapHeight / upm : (bbox("H")?.h ?? NaN),
      minusThickness: minus ? minus.h + minus.d : NaN,
      barWidth: bar ? bar.xMax - bar.xMin : NaN,
      plusWidth: plus ? plus.w : NaN,
    };
  };
  const t = m(fonts.regular);
  const x = m(fonts.math);
  const row = (name: string, a: number, b: number) => `| ${name} | ${a.toFixed(3)} | ${b.toFixed(3)} | ${(b / a).toFixed(2)} |`;
  return [
    "",
    "## STIX Two Math next to the text font",
    "",
    `Text font: ${windows ? "Times New Roman" : "Liberation Serif"}. Values in em. Ratio > 1: STIX is bigger / heavier.`,
    "",
    "| Measure | Text font | STIX Two Math | Ratio |",
    "|---|---|---|---|",
    row("x-height", t.xHeight, x.xHeight),
    row("Cap height", t.capHeight, x.capHeight),
    row("Minus bar thickness (weight)", t.minusThickness, x.minusThickness),
    row("Vertical bar width (weight)", t.barWidth, x.barWidth),
    row("Plus advance", t.plusWidth, x.plusWidth),
    "",
  ];
}
