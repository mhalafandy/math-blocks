import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyPreset, normalizeStyle, STYLE_PRESETS, styleHash } from "@mathblocks/math-core";
import { loadFont, type FontSet } from "@mathblocks/math-render";
import { drawCorpus } from "../../../tools/style-golden";

/**
 * The kinds model draws every v1 style exactly as before (docs/KINDS-MODEL.md §9): the golden file was written
 * by the code before the kinds model; here the same v1 styles go through the migration to v2 (and through a
 * stored v2 copy) and must give the same drawn LaTeX, Word output, SVG and style hash.
 */
const golden = JSON.parse(readFileSync(new URL("../../../fixtures/style-golden.json", import.meta.url), "utf8")) as {
  svg: boolean;
  styles: { name: string; v1: Record<string, unknown>; hash: string; drawings: { drawn: string; omml: string; svg: string | null }[] }[];
};

const L = "/usr/share/fonts/truetype/liberation/LiberationSerif-";
const STIX = new URL("../../math-render/node_modules/@fontsource/stix-two-math/files/stix-two-math-latin-400-normal.woff", import.meta.url);
const fonts: FontSet | null = golden.svg && existsSync(L + "Regular.ttf") && existsSync(STIX) ? { regular: loadFont(readFileSync(L + "Regular.ttf")), italic: loadFont(readFileSync(L + "Italic.ttf")), bold: loadFont(readFileSync(L + "Bold.ttf")), boldItalic: loadFont(readFileSync(L + "BoldItalic.ttf")), math: loadFont(readFileSync(STIX)) } : null;

describe("kinds model: v1 styles draw exactly as before", () => {
  for (const g of golden.styles)
    it(g.name, () => {
      const p = STYLE_PRESETS.find((x) => x.id === g.v1.preset);
      const migrated = normalizeStyle(g.v1);
      const st = p ? applyPreset(migrated, p) : migrated;
      // Stored as v2 and read back: the same style.
      const stored = normalizeStyle(JSON.parse(JSON.stringify(st)));
      expect(stored).toEqual(st);
      expect(styleHash(st)).toBe(g.hash);
      const now = drawCorpus(st, fonts);
      now.forEach((d, i) => {
        expect(d.drawn, `${g.name} #${i}`).toBe(g.drawings[i]!.drawn);
        expect(d.omml, `${g.name} #${i} omml`).toBe(g.drawings[i]!.omml);
        if (fonts) expect(d.svg, `${g.name} #${i} svg`).toBe(g.drawings[i]!.svg);
      });
    });
});
