import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLatex } from "@mathblocks/math-latex";
import { boldDarkness, boldGreek, charGlyph, CLASSIC, glyphSource, glyphStem, layout, loadFont, offsetForDarkness, thinOutline, type Box, type FontSet, type OutlineCmd } from "../src";

const L = "/usr/share/fonts/truetype/liberation/LiberationSerif-";
const STIX = new URL("../node_modules/@fontsource/stix-two-math/files/stix-two-math-latin-400-normal.woff", import.meta.url);
const available = existsSync(L + "Regular.ttf") && existsSync(STIX);

describe.skipIf(!available)("bold Greek (emboldened outlines)", () => {
  const fonts: FontSet = {
    regular: loadFont(readFileSync(L + "Regular.ttf")),
    italic: loadFont(readFileSync(L + "Italic.ttf")),
    bold: loadFont(readFileSync(L + "Bold.ttf")),
    boldItalic: loadFont(readFileSync(L + "BoldItalic.ttf")),
    math: loadFont(readFileSync(STIX)),
  };
  const stemOf = (face: keyof FontSet, ch: string, offset = 0) => {
    const g = charGlyph(fonts[face]!, ch)!;
    let cmds = g.glyph.getPath(0, 0, 1).commands as OutlineCmd[];
    if (offset) cmds = thinOutline(cmds as never, -offset) as OutlineCmd[];
    return glyphStem(cmds, g.h)!;
  };

  it("the stem is measured halfway up the letter", () => {
    const reg = stemOf("regular", "I");
    const bold = stemOf("bold", "I");
    expect(reg).toBeGreaterThan(0.05);
    expect(reg).toBeLessThan(0.12);
    expect(bold).toBeGreaterThan(reg * 1.3);
  });

  it("an outward offset of half the difference gives a regular stroke the bold weight", () => {
    // Symbol's strokes are those of a regular face: the regular face stands in for it here.
    const reg = stemOf("regular", "I");
    const bold = stemOf("bold", "I");
    const thickened = stemOf("regular", "I", (bold - reg) / 2);
    expect(Math.abs(thickened - bold) / bold).toBeLessThan(0.06);
  });

  it("calibrated by darkness: the offset makes regular letters as much darker as the bold face is", () => {
    const k = boldDarkness(fonts.regular, fonts.bold)!;
    expect(k).toBeGreaterThan(1.25);
    expect(k).toBeLessThan(1.6);
    // Regular lowercase stands in for Symbol's Greek (same stroke weight).
    const glyphs = [..."aenos"].map((c) => charGlyph(fonts.regular, c)!);
    const d = offsetForDarkness(glyphs, k);
    // Much less than matching the capital I stem (about 0.03 em), which looked heavier than bold Latin.
    expect(d).toBeGreaterThan(0.008);
    expect(d).toBeLessThan(0.022);
  });

  it("without Symbol the offsets fall back to a default, and bold Greek comes from a real bold", () => {
    expect(boldGreek(fonts).measured).toBe(false);
    expect(boldGreek(fonts).upright).toBeGreaterThan(0);
    // Times (here Liberation) Bold has Greek: a real bold before STIX's math alphabet.
    expect(glyphSource("ω", "ident", fonts, CLASSIC, "bold")).toBe("text");
    const noGreek: FontSet = { ...fonts, bold: fonts.math, boldItalic: fonts.math };
    expect(glyphSource("ω", "ident", noGreek, CLASSIC, "bold")).toBe("math");
    expect(glyphSource("Ω", "ident", noGreek, CLASSIC, "bold-italic")).toBe("math");
  });

  it("the three meanings of one letter: \\pvec bold upright with a harpoon, \\cmat bold upright, plain italic", () => {
    const faces = (latex: string) => {
      const out: string[] = [];
      const walk = (b: Box) => {
        for (const it of b.items) {
          if (it.k === "g") out.push(it.g.font === fonts.bold ? "bold" : it.g.font === fonts.boldItalic ? "bold-italic" : it.g.font === fonts.italic ? "italic" : "other");
          if ("box" in it && it.box) walk(it.box as Box);
        }
      };
      walk(layout(parseLatex(latex).root, { fonts, style: CLASSIC, display: false }));
      return out;
    };
    for (const l of ["\\omega", "r"]) {
      expect(faces(`\\pvec{${l}}`)).toContain("bold");
      expect(faces(`\\cmat{${l}}`)).toContain("bold");
      expect(faces(l)).toEqual(["italic"]);
    }
  });
});
