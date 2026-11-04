/**
 * Generates .tex exports that use every notation kind (with and without frame labels, Greek and
 * Latin bases) under every preset, for CI to compile:
 *   <preset>-plain.tex              definitions alone                       → must compile
 *   <preset>-rename-<pkg>.tex       renamed on clash, with physics / diffcoeff → must compile
 *   <preset>-keep-physics.tex       not renamed, with physics (no clash)     → must compile
 *   <preset>-clash-diffcoeff.tex    not renamed, with diffcoeff (\diff)      → must FAIL loudly
 * (physics and diffcoeff cannot be loaded together: both define \diffd.)
 * Run: pnpm tsx tools/tex-export-check.ts <outDir>   (then compile with tectonic; see ci.yml)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { KINDS, PRESETS, type PresetId } from "@mathblocks/math-core";
import { documentToLatex } from "../app/src/lib/texExport";

const out = process.argv[2] ?? "tex-check";
mkdirSync(out, { recursive: true });

const uses: string[] = [];
for (const k of KINDS) {
  if (k.id === "T") uses.push("\\cmat{c}^{\\T}");
  else if (k.id === "dcm") uses.push("\\dcm{b}{a}", "\\dcm{B}{N}");
  else if (k.id === "frm") uses.push("\\frm{a}");
  else if (k.id === "diff") uses.push("\\diff{m}");
  else uses.push(`\\${k.macro}{r}`, `\\${k.macro}[P/O]{r}`, `\\${k.macro}{\\omega}`, `\\${k.macro}[B/N]{\\omega}`);
}
const equations = [
  { latex: uses.join(",\\;"), display: true },
  { latex: "\\pvec[P/O]{r}=\\dcm{b}{a}\\,\\cmat{c}^{\\T}+\\crossmat{\\omega}\\,\\pvec{\\omega}_{2}", display: true, number: "(A.1)" },
  { latex: "\\diff{m}=\\sigma\\,\\diff{A}", display: false },
  // Multi-line: aligned and gathered inside \[ \] / equation; multline replaces them (numbered or not).
  { latex: "\\begin{aligned}\\pvec[P/O]{r}&=\\dcm{b}{a}\\,\\cmat{c}\\\\ &\\quad+\\crossmat{\\omega}\\,\\pvec{\\omega}\\end{aligned}", display: true, number: "(A.2)" },
  { latex: "\\begin{gathered}\\uvec{x}=\\pvec{r}\\\\ \\dyadic{I}\\cdot\\pvec{\\omega}\\end{gathered}", display: true },
  { latex: "\\begin{multline}T=\\frac{1}{2}m\\,\\pvec{v}\\cdot\\pvec{v}\\\\ +\\frac{1}{2}\\pvec{\\omega}\\cdot\\dyadic{I}\\cdot\\pvec{\\omega}\\end{multline}", display: true, number: "(A.3)" },
  { latex: "\\begin{multline}a+b\\\\ +c\\end{multline}", display: true },
];

const withPackage = (tex: string, pkg: string) => tex.replace("\\usepackage{amsmath,amssymb,bm}", `\\usepackage{amsmath,amssymb,bm}\n\\usepackage{${pkg}}`);

const files: string[] = [];
for (const preset of Object.keys(PRESETS) as PresetId[]) {
  const profile = { preset, overrides: {} };
  const plain = documentToLatex(`check-${preset}`, equations, { profile });
  const renamed = documentToLatex(`check-${preset}`, equations, { profile, renameOnClash: true });
  const clash = documentToLatex(`check-${preset}`, equations, { profile, renameOnClash: false });
  for (const [name, tex] of [
    [`${preset}-plain`, plain],
    [`${preset}-rename-physics`, withPackage(renamed, "physics")],
    [`${preset}-rename-diffcoeff`, withPackage(renamed, "diffcoeff")],
    [`${preset}-keep-physics`, withPackage(clash, "physics")],
    [`${preset}-clash-diffcoeff`, withPackage(clash, "diffcoeff")],
  ] as const) {
    writeFileSync(join(out, `${name}.tex`), tex);
    files.push(name);
  }
}
console.log(files.join("\n"));
