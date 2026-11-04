import { DEFAULT_PROFILE, kindNewcommand, KINDS, macroClashes, MBBOLD_DEFINITION, styleOf, type NotationProfile } from "@mathblocks/math-core";
import { serializeLatex } from "@mathblocks/math-latex";

/** LaTeX documents from equations (pure: used by the app's export and by the CI compile check). */

/** LaTeX as MathJax / standard LaTeX understands it (MathBlocks dialect → standard LaTeX). */
export function toStandardLatex(latex: string) {
  return standardDialect(latex);
}

export function standardDialect(latex: string) {
  return latex.replace(/\\placeholder(\[[^\]]*\])?\{\}/g, "\\square").replace(/\\differentialD/g, "\\mathrm{d}").replace(/\\exponentialE/g, "\\mathrm{e}").replace(/\\imaginaryI/g, "\\mathrm{i}").replace(/\\imaginaryJ/g, "\\mathrm{j}");
}

export interface ExportedEquation {
  latex: string;
  display: boolean;
  number?: string | null;
  page?: number;
}

export interface TexOptions {
  /** Notation profile for the kind macros' definitions. */
  profile?: NotationProfile;
  /** Rename kind macros that clash with a package (\\diff → \\mbdiff) instead of failing loudly. */
  renameOnClash?: boolean;
}

/**
 * A compilable LaTeX file with the equations in document order. Kind macros (\\pvec…) are
 * defined with \\newcommand (never \\providecommand: another package's definition must not
 * silently win), generated from the notation profile.
 */
export function documentToLatex(name: string, equations: ExportedEquation[], o: TexOptions = {}): string {
  const profile = o.profile ?? DEFAULT_PROFILE;
  const clashes = macroClashes();
  const rename = (macro: string) => (o.renameOnClash && clashes.has(macro) ? `mb${macro}` : macro);
  const used = KINDS.filter((k) => equations.some((e) => new RegExp(`\\\\${k.macro}(?![a-zA-Z])`).test(e.latex)));
  const defs = used.map((k) => kindNewcommand(k.id, styleOf(profile, k.id), serializeLatex, rename(k.macro)));
  const clashNotes = used.filter((k) => clashes.has(k.macro)).map((k) => `% \\${k.macro} clashes with ${clashes.get(k.macro)!.join(", ")}${o.renameOnClash ? `: renamed \\${rename(k.macro)}` : ": loading that package together with these definitions gives an error"}`);
  const lines = [
    `% Equations of “${name}”, exported by MathBlocks on ${new Date().toISOString().slice(0, 10)}`,
    "\\documentclass{article}",
    "\\usepackage{amsmath,amssymb,bm}",
    "\\newcommand{\\overrightharpoon}[1]{\\overset{\\rightharpoonup}{#1}}",
    "\\newcommand{\\overleftharpoon}[1]{\\overset{\\leftharpoonup}{#1}}",
    ...(used.length ? ["% Notation kinds (MathBlocks notation profile)", ...(defs.some((d) => d.includes("\\mbbold")) ? [MBBOLD_DEFINITION] : []), ...defs, ...clashNotes] : []),
    "\\begin{document}",
    "",
  ];
  const renamed = (latex: string) =>
    o.renameOnClash ? used.reduce((l, k) => (clashes.has(k.macro) ? l.replace(new RegExp(`\\\\${k.macro}(?![a-zA-Z])`, "g"), `\\${rename(k.macro)}`) : l), latex) : latex;
  for (const e of equations) {
    const body = renamed(toStandardLatex(e.latex));
    const where = e.page ? `% page ${e.page}` : "";
    // multline is an outer environment (not allowed inside equation or \[ \]): it replaces them.
    const ml = /^\s*\\begin\{multline\*?\}([\s\S]*)\\end\{multline\*?\}\s*$/.exec(body);
    if (ml && e.display) {
      const n = e.number?.replace(/^[([]|[)\]]$/g, "");
      const tag = n ? [`  \\tag{${n}}\\label{eq:${n.replace(/[^\w.:-]/g, "")}}`] : [];
      const env = n ? "multline" : "multline*";
      lines.push(where, `\\begin{${env}}`, `  ${ml[1]!.trim()}`, ...tag, `\\end{${env}}`, "");
    } else if (e.number) {
      const n = e.number.replace(/^[([]|[)\]]$/g, "");
      lines.push(where, "\\begin{equation}", `  ${body}`, `  \\tag{${n}}\\label{eq:${n.replace(/[^\w.:-]/g, "")}}`, "\\end{equation}", "");
    } else if (e.display) lines.push(where, "\\[", `  ${body}`, "\\]", "");
    else lines.push(`${where ? `${where}: ` : "% "}inline: $${body}$`, "");
  }
  lines.push("\\end{document}", "");
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

