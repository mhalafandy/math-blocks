import { describe, expect, it } from "vitest";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { availableWidth, suggestBreak } from "./pageWidth";

const n = (l: string) => serializeLatex(parseLatex(l).root);
/** Toy measure: 10 pt per letter/operator of the widest line (\quad = 10 pt), so tests stay exact. */
function measure(latex: string): number {
  const root = parseLatex(latex).root;
  const only = root.children.length === 1 && root.children[0]!.kind === "aligned" ? root.children[0] : null;
  const count = (l: string) => l.replace(/\\quad/g, "Q").replace(/\\begin\{\w+\}|\\end\{\w+\}|[\s{}&]/g, "").length * 10;
  if (!only || only.kind !== "aligned") return count(latex);
  const lines = serializeLatex(root).replace(/\\begin\{\w+\}|\\end\{\w+\}/g, "").split("\\\\");
  if (only.env === "multline") return Math.max(...lines.map(count)) + 10;
  const heads = lines.map((l) => count(l.split("&")[0] ?? ""));
  const tails = lines.map((l) => count(l.split("&")[1] ?? ""));
  return Math.max(...heads) + Math.max(...tails);
}

describe("availableWidth", () => {
  it("numbered equations keep clear of the number on both sides", () => {
    expect(availableWidth(440, false)).toBe(440);
    expect(availableWidth(440, true, 30)).toBe(440 - 2 * 42);
  });
});

describe("suggestBreak", () => {
  it("returns null when the equation fits", () => {
    expect(suggestBreak("x=a+b", measure, 100)).toBeNull();
  });
  it("aligns at the relation and continues with \\quad +", () => {
    const s = suggestBreak("x=a+b+c+d+e+f", measure, 80)!;
    // Toy widths: "x" 10 + "=a+b+c" 60 = 70; "\\quad+d+e+f" 70 (+10 for x's column) = 80.
    expect(s.latex).toBe(n("\\begin{aligned}x&=a+b+c\\\\ &\\quad+d+e+f\\end{aligned}"));
    expect(s.fits).toBe(true);
    expect(s.lines).toBe(2);
  });
  it("without a relation it becomes multline", () => {
    const s = suggestBreak("a+b+c+d+e+f", measure, 60)!;
    expect(s.latex).toBe(n("\\begin{multline}a+b+c\\\\ +d+e\\\\ +f\\end{multline}"));
  });
  it("continues the too-wide lines of an aligned derivation", () => {
    const s = suggestBreak("\\begin{aligned}x&=a\\\\ &=b+c+d+e+f\\end{aligned}", measure, 70)!;
    expect(s.latex).toBe(n("\\begin{aligned}x&=a\\\\ &=b+c+d\\\\ &\\quad+e+f\\end{aligned}"));
  });
  it("never breaks inside a fraction; reports when a single term is too wide", () => {
    const s = suggestBreak("x=\\frac{a+b+c+d}{e}+f", measure, 60)!;
    expect(s.latex).toBe(n("\\begin{aligned}x&=\\frac{a+b+c+d}{e}\\\\ &\\quad+f\\end{aligned}"));
    expect(s.fits).toBe(false);
  });
  it("kinds stay whole", () => {
    const s = suggestBreak("\\pvec{r}=\\dcm{b}{a}+\\pvec{p}+\\pvec{q}", measure, 60)!;
    expect(s.latex).toContain("\\dcm{b}{a}");
    expect(s.lines).toBeGreaterThan(1);
  });
});
