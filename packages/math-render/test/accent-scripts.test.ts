import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLatex } from "@mathblocks/math-latex";
import { loadFont, renderSvg, type FontSet, type Item } from "../src";

const L = "/usr/share/fonts/truetype/liberation/LiberationSerif-";
const STIX = new URL("../node_modules/@fontsource/stix-two-math/files/stix-two-math-latin-400-normal.woff", import.meta.url);
const available = existsSync(L + "Regular.ttf") && existsSync(STIX);

/**
 * The Word output (pictures and the preview) of accent-style vectors with an index: each index sits at the
 * subscript position after its letter (not under it), and the harpoon depends on the letter only.
 */
describe.skipIf(!available)("indices after accent-style vectors (Word output)", () => {
  const fonts: FontSet = available
    ? {
        regular: loadFont(readFileSync(L + "Regular.ttf")),
        italic: loadFont(readFileSync(L + "Italic.ttf")),
        bold: loadFont(readFileSync(L + "Bold.ttf")),
        boldItalic: loadFont(readFileSync(L + "BoldItalic.ttf")),
        math: loadFont(readFileSync(STIX)),
      }
    : (null as unknown as FontSet);
  type G = Extract<Item, { k: "g" }>;
  const glyphs = (latex: string) => (renderSvg(parseLatex(latex).root, { fonts }).box.items.filter((i) => i.k === "g") as G[]).sort((a, b) => a.x - b.x);
  const shapes = (latex: string) => renderSvg(parseLatex(latex).root, { fonts }).box.items.filter((i) => i.k === "p") as Extract<Item, { k: "p" }>[];
  const right = (g: G) => g.x + g.g.xMax * g.s;
  const left = (g: G) => g.x + g.g.xMin * g.s;

  it("puts the index after the letter, lower and smaller, for every accent", () => {
    const sub = glyphs("x_{i}");
    const down = Math.sign(sub[1]!.y - sub[0]!.y); // the direction of "lower" in item coordinates
    for (const latex of ["\\overrightharpoon{\\mathbf{r}}_{P}", "\\overrightarrow{x}_{P}", "\\vec{x}_{P}", "\\hat{x}_{P}", "\\bar{x}_{P}", "\\widehat{x}_{P}", "\\pvec{r}_{P}", "\\bvec{f}_{P}"]) {
      const gs = glyphs(latex);
      // The letter (not the accent's own glyph, which sits above it) and the index.
      const idx = gs.find((g) => g.s < 1);
      const base = gs.find((g) => g.s === 1 && "xrf".includes(String.fromCodePoint(g.g.glyph.unicode ?? 0)));
      expect(left(idx!), latex).toBeGreaterThanOrEqual(right(base!) - 0.02);
      expect(Math.sign(idx!.y - base!.y), latex).toBe(down);
      expect(idx!.s, latex).toBeLessThan(base!.s);
    }
  });

  it("draws a run of vectors with long indices without overlaps (generic repro)", () => {
    const latex = "\\overrightharpoon{\\mathbf{r}}_{P/O}\\overrightharpoon{\\mathbf{v}}_{P/O}\\overrightharpoon{\\bm{\\omega}}_{ba}\\overrightharpoon{\\mathbf{h}}_{c}";
    const gs = glyphs(latex);
    const big = gs.filter((g) => g.s === 1);
    expect(big.length).toBe(4);
    for (let i = 0; i < 4; i++) {
      const scripts = gs.filter((g) => g.s < 1 && g.x > big[i]!.x && (i === 3 || g.x < big[i + 1]!.x));
      expect(scripts.length, `vector ${i + 1}`).toBe([3, 3, 2, 1][i]);
      for (const s of scripts) expect(left(s)).toBeGreaterThanOrEqual(right(big[i]!) - 0.02);
      if (i < 3) expect(right(scripts[scripts.length - 1]!)).toBeLessThanOrEqual(left(big[i + 1]!) + 0.02);
    }
    // The harpoons do not overlap each other or the next letter.
    const hs = shapes(latex).map((p) => ({ l: p.x + Math.min(...p.pts.map((q) => q[0])), r: p.x + Math.max(...p.pts.map((q) => q[0])) })).sort((a, b) => a.l - b.l);
    expect(hs.length).toBe(4);
    for (let i = 0; i < 3; i++) expect(hs[i]!.r).toBeLessThanOrEqual(hs[i + 1]!.l);
  });

  it("keeps the harpoon's length independent of the index", () => {
    const width = (latex: string) => {
      const p = shapes(latex)[0]!;
      const xs = p.pts.map((q) => q[0]);
      return Math.max(...xs) - Math.min(...xs);
    };
    const bare = width("\\overrightharpoon{\\mathbf{r}}");
    for (const s of ["_{c}", "_{P/O}", "_{max}", "^{2}"]) expect(width(`\\overrightharpoon{\\mathbf{r}}${s}`)).toBeCloseTo(bare, 6);
  });
});
