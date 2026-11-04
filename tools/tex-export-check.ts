/**
 * Generates .tex exports that use every notation kind (with and without frame labels, Greek and
 * Latin bases) under every preset, for CI to compile:
 *   <preset>-plain.tex        definitions alone                      → must compile
 *   <preset>-rename.tex       renamed on clash, with physics+diffcoeff → must compile
 *   <preset>-clash.tex        not renamed, with physics+diffcoeff     → must FAIL (loud clash)
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
];

const withPackages = (tex: string) => tex.replace("\\usepackage{amsmath,amssymb,bm}", "\\usepackage{amsmath,amssymb,bm}\n\\usepackage{physics}\n\\usepackage{diffcoeff}");

const files: string[] = [];
for (const preset of Object.keys(PRESETS) as PresetId[]) {
  const profile = { preset, overrides: {} };
  const plain = documentToLatex(`check-${preset}`, equations, { profile });
  const renamed = documentToLatex(`check-${preset}`, equations, { profile, renameOnClash: true });
  const clash = documentToLatex(`check-${preset}`, equations, { profile, renameOnClash: false });
  for (const [name, tex] of [[`${preset}-plain`, plain], [`${preset}-rename`, withPackages(renamed)], [`${preset}-clash`, withPackages(clash)]] as const) {
    writeFileSync(join(out, `${name}.tex`), tex);
    files.push(name);
  }
}
console.log(files.join("\n"));
