import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLatex } from "@mathblocks/math-latex";
import { CLASSIC, inkOf, layout, loadFont, type Box, type FontSet } from "../src";

const L = "/usr/share/fonts/truetype/liberation/LiberationSerif-";
const SYM = "/usr/share/fonts/opentype/urw-base35/StandardSymbolsPS.otf"; // metric-compatible with Symbol
const STIX = new URL("../node_modules/@fontsource/stix-two-math/files/stix-two-math-latin-400-normal.woff", import.meta.url);
const available = existsSync(L + "Regular.ttf") && existsSync(SYM) && existsSync(STIX);

describe.skipIf(!available)("radicals as MathType draws them (Symbol's √ and its extender bar)", () => {
  // Loaded when a test runs (the describe body runs even when the fonts are missing and it is skipped).
  let cached: FontSet | null = null;
  const load = (): FontSet =>
    (cached ??= {
      regular: loadFont(readFileSync(L + "Regular.ttf")),
      italic: loadFont(readFileSync(L + "Italic.ttf")),
      bold: loadFont(readFileSync(L + "Bold.ttf")),
      boldItalic: loadFont(readFileSync(L + "BoldItalic.ttf")),
      math: loadFont(readFileSync(STIX)),
      symbol: loadFont(readFileSync(SYM)),
    });
  const fonts = new Proxy({} as FontSet, { get: (_, k) => load()[k as keyof FontSet] });
  const box = (latex: string) => layout(parseLatex(latex).root, { fonts, style: CLASSIC, display: false });
  const parts = (b: Box) => {
    const sign = b.items.find((i) => i.k === "g" && i.g.font === fonts.symbol) as Extract<Box["items"][number], { k: "g" }>;
    const bar = b.items.find((i) => i.k === "r") as Extract<Box["items"][number], { k: "r" }>;
    return { sign, bar };
  };

  it("the bar joins the sign: same top, the extender's thickness, starting inside the sign's last stroke", () => {
    const { sign, bar } = parts(box("\\sqrt{x}"));
    expect(sign).toBeTruthy();
    const signTop = sign.y + sign.g.h * sign.s * (sign.sy ?? 1);
    expect(Math.abs(bar.y + bar.h - signTop)).toBeLessThan(1e-6);
    expect(bar.h).toBeCloseTo(0.056, 3); // Symbol's radical extender
    const signRight = sign.x + sign.g.xMax * sign.s;
    expect(bar.x).toBeLessThan(signRight);
    expect(bar.x).toBeGreaterThan(signRight - 0.05);
  });

  it("short contents share one height (√x, √2, √(a+b), √A), as in MathType; an exponent adds only a little", () => {
    const tops = ["\\sqrt{x}", "\\sqrt{2}", "\\sqrt{a+b}", "\\sqrt{A}"].map((l) => box(l).h);
    for (const t of tops) expect(t).toBeCloseTo(tops[0]!, 6);
    expect(box("\\sqrt{x^2}").h - tops[0]!).toBeLessThan(0.05);
  });

  it("the bar clears the contents' ink (accents included); tall contents stretch the sign", () => {
    for (const l of ["\\sqrt{\\pvec{r}}", "\\sqrt{\\hat{A}}", "\\sqrt{\\frac{a}{b}}"]) {
      const b = box(l);
      const { bar } = parts(b);
      const contents = { ...b, items: b.items.filter((i) => !(i.k === "r" && i === bar) && !(i.k === "g" && i.g.font === fonts.symbol)) };
      expect(bar.y - inkOf(contents).top).toBeGreaterThan(0.05);
    }
    expect(parts(box("\\sqrt{\\frac{a}{b}}")).sign.sy ?? 1).toBeGreaterThan(1);
  });

  it("an index sits over the short arm, left of the sign's middle and above it", () => {
    const b = box("\\sqrt[3]{x}");
    const { sign } = parts(b);
    const three = b.items.find((i) => i.k === "g" && i.g.font !== fonts.symbol && i.s < 0.9) as Extract<Box["items"][number], { k: "g" }>;
    expect(three).toBeTruthy();
    const signMid = sign.x + (sign.g.xMax * sign.s) / 2;
    expect(three.x + three.g.xMax * three.s).toBeLessThanOrEqual(signMid + 1e-6);
    expect(three.y).toBeGreaterThan(sign.y + 0.3);
  });
});
