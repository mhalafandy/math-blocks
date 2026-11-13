/**
 * Golden drawings for the kinds-model migration (docs/KINDS-MODEL.md §9): a generic corpus drawn with every
 * letters-and-symbols preset, every notation preset and classification cases, written as the drawn LaTeX,
 * the Word (OMML) output, an SVG fingerprint and the style hash. Generated once by the code before the
 * kinds model (v1 styles); the test (packages/math-latex/test/styleGolden.test.ts) checks that the new model
 * reproduces every entry exactly from the same v1 styles.
 *
 * Run: pnpm tsx tools/style-golden.ts > fixtures/style-golden.json
 */
import { existsSync, readFileSync } from "node:fs";
import { applyPreset, expandNotation, normalizeStyle, STYLE_PRESETS, styleAst, styleHash, styleNotation, type MathStyle } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { toOmml } from "@mathblocks/math-omml";
import { loadFont, renderSvg, type FontSet } from "@mathblocks/math-render";

/** Every token kind, every wrapper kind, indices, bold, the transpose, d, e, π, Roman numerals. */
export const GOLDEN_CORPUS = [
  "\\sigma_{sf}=E\\varepsilon_{ij}+B_{max}",
  "\\frac{dx}{dt}+\\int_0^1 f(x)\\,dx",
  "e^{i\\pi}+1=0",
  "\\Omega_{n}+\\sin\\theta+\\cos(\\alpha t)",
  "\\alpha+\\Omega+x+X+\\Gamma_{k}",
  "\\mathbf{A}^T\\mathbf{r}_{sf}+\\mathbf{A}^{\\T}",
  "\\pvec[B/N]{r}+\\pvec{\\omega}+\\uvec{e}_1",
  "\\bvec{f}_1^{I}+\\vectrix{F}_{II}+\\cmat{c}^{\\T}",
  "\\dcm{b}{a}\\mat{J}+\\crossmat{\\omega}+\\dyadic{I}",
  "\\tens{T}+\\quat{q}+\\frm{N}+\\body{B}",
  "\\diff{t}+\\dcm{F_{I}}{F}",
  "d=2r+x_i+v_f+y_t+A_{ij}",
  "\\text{if }x>0,\\ \\mathrm{d}t+v_{\\mathit{max}}",
  "\\sum_{k=1}^{n}a_k b_k+\\prod_{j}c_j",
  "\\mathbf{x}_{i}+\\boldsymbol{\\omega}_{b}+\\hat{\\mathbf{n}}",
  "F_{I}+F_{II}+A_{IIV}+A_{ii}+I+V",
  "3.5+\\tfrac{1}{2}m v^2+\\det(\\mathbf{M})",
];

/** v1 styles: presets with classifications and the settings v1 had. */
export function goldenStyles(): { name: string; v1: Record<string, unknown> }[] {
  const out: { name: string; v1: Record<string, unknown> }[] = [];
  const letterSets: Record<string, Record<string, string>> = { none: {}, cls: { i: "counter", j: "counter", f: "label", e: "constant", d: "variable" }, roman: { I: "variable", k: "label" } };
  for (const p of STYLE_PRESETS)
    for (const [ln, letters] of Object.entries(letterSets))
      for (const notation of ["hughes", "schaub", "markley"]) out.push({ name: `${p.id}/${ln}/${notation}`, v1: { ...p.values, preset: p.id, letters, notation: { preset: notation, overrides: {} } } });
  out.push({ name: "bold-scripts", v1: { boldScope: "scripts", labels: "upright", transpose: "bold" } });
  out.push({ name: "romans-italic-size14", v1: { romans: "italic", sizePt: 14, numbers: "italic" } });
  out.push({ name: "dcm-own-frames", v1: { labels: "upright", notation: { preset: "hughes", overrides: { dcm: { frames: { position: "sub", separator: "", shape: "italic" } } } } } });
  return out;
}

const fontsAvailable = () => existsSync("/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf");
function fonts(): FontSet | null {
  if (!fontsAvailable()) return null;
  const L = "/usr/share/fonts/truetype/liberation/LiberationSerif-";
  const STIX = new URL("../packages/math-render/node_modules/@fontsource/stix-two-math/files/stix-two-math-latin-400-normal.woff", import.meta.url);
  if (!existsSync(STIX)) return null;
  return { regular: loadFont(readFileSync(L + "Regular.ttf")), italic: loadFont(readFileSync(L + "Italic.ttf")), bold: loadFont(readFileSync(L + "Bold.ttf")), boldItalic: loadFont(readFileSync(L + "BoldItalic.ttf")), math: loadFont(readFileSync(STIX)) };
}

export const fingerprint = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
};

/** One style's drawings of the corpus. */
export function drawCorpus(style: MathStyle, f: FontSet | null) {
  return GOLDEN_CORPUS.map((latex) => {
    const root = parseLatex(latex).root;
    return {
      drawn: serializeLatex(expandNotation(styleAst(root, style), styleNotation(style))),
      omml: fingerprint(toOmml(root, { mathStyle: style })),
      svg: f ? fingerprint(renderSvg(root, { fonts: f, mathStyle: style }).svg) : null,
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const f = fonts();
  const out = goldenStyles().map(({ name, v1 }) => {
    const style = normalizeStyle(v1);
    const p = STYLE_PRESETS.find((x) => x.id === v1.preset);
    const st = p ? applyPreset(style, p) : style;
    return { name, v1, hash: styleHash(st), drawings: drawCorpus(st, f) };
  });
  process.stdout.write(JSON.stringify({ corpus: GOLDEN_CORPUS, svg: !!f, styles: out }, null, 1) + "\n");
}
