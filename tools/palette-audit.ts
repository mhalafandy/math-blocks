/**
 * Palette audit: for every palette entry, how it works in MathLive, MathBlocks Classic (Times /
 * Symbol, or the STIX fallback), Word (OMML) and the LaTeX round trip — the same checks as
 * app/src/lib/palette.support.test.ts — plus required catalog items with no entry, and STIX Two
 * Math compared with Times (size, weight).
 * Run: pnpm tsx tools/palette-audit.ts → docs/PALETTE-AUDIT.md + .csv (Linux: Liberation Serif
 * stands in for Times) or docs/PALETTE-AUDIT-windows.md + .csv (real Times New Roman and Symbol).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { charGlyph, loadFont, type FontSet } from "@mathblocks/math-render";
import { ENTRIES, type Support } from "../app/src/lib/palette";
import { entrySupport, entryVariants } from "../app/src/lib/paletteSupport";

const require = createRequire(new URL("../app/package.json", import.meta.url));
const { validateLatex } = (await import(new URL("../app/node_modules/mathlive/mathlive-ssr.min.mjs", import.meta.url).href)) as { validateLatex: (s: string) => { code: string; arg?: string }[] };
const STIX = require.resolve("@fontsource/stix-two-math/files/stix-two-math-latin-400-normal.woff", { paths: [fileURLToPath(new URL("../packages/math-render/", import.meta.url))] });

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
  ? "Fonts: the real Times New Roman and Symbol of a Windows machine (GitHub windows-latest)."
  : "Fonts: Liberation Serif stands in for Times New Roman (same metrics, similar but not identical coverage); the Symbol font's repertoire is the renderer's Adobe Symbol table.";
const OUT = windows ? "PALETTE-AUDIT-windows" : "PALETTE-AUDIT";

const rows = ENTRIES.map((e) => ({ e, r: entrySupport(e, { fonts, validate: validateLatex }) }));

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
  ["Calculus", ["\\partial", "\\nabla", "\\int", "\\iint", "\\iiint", "\\oint", "\\oiint", "\\sum", "\\prod", "\\coprod", "\\infty", "\\lim", "\\limsup", "\\liminf", "\\dot", "\\ddot", "\\dddot", "\\ddddot", "\\prime", "\\nabla\\cdot", "\\nabla\\times", "\\nabla^2", "\\mathrm{d}", "\\mathrm{D}"]],
  ["Linear algebra", ["\\det", "\\operatorname{tr}", "\\operatorname{rank}", "\\operatorname{diag}", "\\ker", "\\operatorname{span}", "\\dim", "^{\\mathbf{T}}", "^{-1}", "^{\\mathsf{H}}", "\\left\\|", "\\langle"]],
  ["Delimiters", ["\\left(", "\\left[", "\\left\\{", "\\left|", "\\left\\|", "\\left\\langle", "\\left\\lfloor", "\\left\\lceil", "\\left.", "\\right.", "\\bigl(", "\\Bigl(", "\\biggl(", "\\Biggl("]],
  ["Accents", ["\\bar", "\\overline", "\\hat", "\\widehat", "\\tilde", "\\widetilde", "\\vec", "\\overrightarrow", "\\overleftarrow", "\\overrightharpoon", "\\acute", "\\grave", "\\breve", "\\check", "\\mathring", "\\underline"]],
  ["Letter styles", ["\\mathbf", "\\boldsymbol", "\\mathcal", "\\mathbb", "\\mathfrak", "\\mathrm", "\\mathsf", "\\mathit", "\\mathscr"]],
  ["Functions", ["\\sin", "\\cos", "\\tan", "\\cot", "\\sec", "\\csc", "\\sinh", "\\cosh", "\\tanh", "\\coth", "\\operatorname{sech}", "\\operatorname{csch}", "\\arcsin", "\\arccos", "\\arctan", "\\log", "\\ln", "\\exp", "\\max", "\\min", "\\sup", "\\inf", "\\Re", "\\Im", "\\arg", "\\Pr", "\\hbar", "\\mathrm{e}", "\\mathrm{i}"]],
];


const allLatex = ENTRIES.flatMap((e) => [...entryVariants(e), ...e.aliases.map((a) => `\\${a}`)]).join(" ");
const has = (cmd: string) => {
  const esc = cmd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(esc + (/[a-zA-Z]$/.test(cmd) ? "(?![a-zA-Z])" : "")).test(allLatex);
};
const missing = REQUIRED.map(([cat, list]) => [cat, list.filter((c) => !has(c))] as const).filter(([, l]) => l.length);

const csv = (s: string) => `"${s.replace(/"/g, '""')}"`;
writeFileSync(
  new URL(`../docs/${OUT.toLowerCase()}.csv`, import.meta.url),
  ["id,name,latex,mathlive,classic,omml,roundtrip,notes", ...rows.map(({ e, r }) => [e.id, e.name, e.item.latex, r.mathlive, r.classic, r.omml, r.roundtrip, r.notes.join(" | ")].map(csv).join(","))].join("\n") + "\n",
);
const count = (k: "mathlive" | "classic" | "omml" | "roundtrip", v: Support) => rows.filter(({ r }) => r[k] === v).length;
const notFull = rows.filter(({ r }) => r.mathlive !== "full" || r.classic !== "full" || r.omml !== "full" || r.roundtrip !== "full");
// Characters that need the STIX fallback, with the entries using them.
const fallback = new Map<string, string[]>();
for (const { e, r } of rows) for (const n of r.notes) {
  const m = /^Classic: from STIX Two \(not Times\/Symbol\): (.*)$/.exec(n);
  if (m) for (const ch of m[1]!.split(" ").filter(Boolean)) fallback.set(ch, [...(fallback.get(ch) ?? []), e.id]);
}
const md = [
  `# Palette audit${windows ? " (Windows fonts)" : ""}`,
  "",
  `Generated by \`pnpm tsx tools/palette-audit.ts\` over ${rows.length} palette entries. Full data: [${OUT.toLowerCase()}.csv](${OUT.toLowerCase()}.csv).`,
  "",
  `${FONT_NOTE} *converted* = drawn from the STIX Two Math fallback, so it looks different from Times/Symbol.`,
  "",
  "| Check | full | converted | workaround | unsupported |",
  "|---|---|---|---|---|",
  ...(["mathlive", "classic", "omml", "roundtrip"] as const).map((c) => `| ${c} | ${count(c, "full")} | ${count(c, "converted")} | ${count(c, "workaround")} | ${count(c, "unsupported")} |`),
  "",
  `## Characters drawn from the STIX fallback (${fallback.size})`,
  "",
  "| Character | Used by |",
  "|---|---|",
  ...[...fallback].sort(([a], [b]) => a.localeCompare(b)).map(([ch, ids]) => `| ${ch} | ${ids.slice(0, 6).join(", ")}${ids.length > 6 ? ` +${ids.length - 6}` : ""} |`),
  "",
  `## Entries not fully supported (${notFull.length})`,
  "",
  "| Entry | LaTeX | MathLive | Classic | OMML | Round trip | Notes |",
  "|---|---|---|---|---|---|---|",
  ...notFull.map(({ e, r }) => `| ${e.id} | \`${e.item.latex.replace(/\|/g, "\\|")}\` | ${r.mathlive} | ${r.classic} | ${r.omml} | ${r.roundtrip} | ${r.notes.join("; ").replace(/\|/g, "\\|")} |`),
  "",
  "## Required catalog items with no palette entry",
  "",
  ...(missing.length ? missing.map(([cat, l]) => `- **${cat}** (${l.length}): ${l.map((c) => `\`${c}\``).join(" ")}`) : ["None."]),
  "",
  ...metricsReport(),
];
writeFileSync(new URL(`../docs/${OUT}.md`, import.meta.url), md.join("\n"));
console.log(`${rows.length} entries, ${notFull.length} not fully supported, ${fallback.size} characters from STIX, ${missing.reduce((n, [, l]) => n + l.length, 0)} required items missing`);

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
