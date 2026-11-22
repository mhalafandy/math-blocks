import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLatex } from "@mathblocks/math-latex";
import { DEFAULT_STYLE, type LargeOperatorFont } from "@mathblocks/math-core";
import { CLASSIC, layout, loadFont, type Box, type FontSet } from "../src";

const STIX = new URL("../node_modules/@fontsource/stix-two-math/files/stix-two-math-latin-400-normal.woff", import.meta.url);
const A = new URL("../../../app/src/assets/math-fonts/", import.meta.url);
const files = { "latin-modern": "latin-modern-math/latinmodern-math.otf", "stix-two": "stix-two-math/STIXTwoMath-Regular.ttf", xits: "xits-math/xits-math.otf" } as const;
const available = existsSync(STIX) && Object.values(files).every((f) => existsSync(new URL(f, A)));

/** Every glyph item of a box, with its font. */
function glyphs(b: Box): { font: unknown; name?: string }[] {
  const out: { font: unknown; name?: string }[] = [];
  const walk = (items: unknown[]) => {
    for (const it of items as { g?: { font: unknown; glyph: { name?: string } }; box?: Box; items?: unknown[] }[]) {
      if (it.g) out.push({ font: it.g.font, name: it.g.glyph.name });
      if (it.items) walk(it.items);
      if (it.box) walk(it.box.items as unknown[]);
    }
  };
  walk(b.items as unknown[]);
  return out;
}

describe.skipIf(!available)("large operators in a TeX math font (document style)", () => {
  const stix = loadFont(readFileSync(STIX));
  const bigOps = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, loadFont(readFileSync(new URL(f, A)))])) as NonNullable<FontSet["bigOps"]>;
  const fonts: FontSet = { regular: stix, italic: stix, bold: stix, boldItalic: stix, math: stix, bigOps };
  const lay = (latex: string, display: boolean, which: LargeOperatorFont) => layout(parseLatex(latex).root, { fonts, style: CLASSIC, display, mathStyle: { ...DEFAULT_STYLE, global: { ...DEFAULT_STYLE.global, largeOperators: which } } });

  for (const which of ["latin-modern", "stix-two", "xits"] as const) {
    it(`${which}: the display integral is the font's own display glyph, about TeX's height (over 2 em), never an upright form`, () => {
      const b = lay("\\int_0^1 x\\,dx", true, which);
      const ops = glyphs(b).filter((g) => g.font === bigOps[which]);
      expect(ops.length).toBeGreaterThan(0);
      expect(ops[0]!.name).toMatch(/\.(display|dsp|v1)$/);
      expect(ops[0]!.name).not.toMatch(/\.up/);
      expect(b.h + b.d).toBeGreaterThan(2);
    });
    it(`${which}: inline, the normal glyph (not the display one), from the same font`, () => {
      const ops = glyphs(lay("\\int_0^1 x\\,dx", false, which)).filter((g) => g.font === bigOps[which]);
      expect(ops.length).toBeGreaterThan(0);
      expect(ops[0]!.name ?? "").not.toMatch(/\.(display|dsp|v1|s1)$/);
    });
    it(`${which}: sums and products too`, () => {
      for (const l of ["\\sum_{k=1}^{n} k", "\\prod_{i=1}^{n} a_i", "\\oint_C f", "\\iint_D f"]) expect(glyphs(lay(l, true, which)).some((g) => g.font === bigOps[which]), l).toBe(true);
    });
  }
  it("the current setting leaves them as they were (no TeX font used)", () => {
    expect(glyphs(lay("\\int_0^1 x\\,dx+\\sum_k k", true, "current")).some((g) => Object.values(bigOps).includes(g.font as never))).toBe(false);
  });
});
