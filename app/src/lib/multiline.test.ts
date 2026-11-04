import { describe, expect, it } from "vitest";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { breakLineAt, CARET as C, multlineFromEditor, multlineToEditor, setAlignmentAt } from "./multiline";

const n = (l: string) => serializeLatex(parseLatex(l).root);
const ok = (r: ReturnType<typeof breakLineAt>) => {
  if ("error" in r) throw new Error(r.error);
  return r.latex;
};

describe("breakLineAt (Enter)", () => {
  it("aligns a one-line equation at its relation and continues with \\quad", () => {
    expect(ok(breakLineAt(`x=a+b${C}+c`))).toBe(n(`\\begin{aligned}x&=a+b\\\\ &${C}\\quad+c\\end{aligned}`));
  });
  it("breaking right before the relation puts it on the next line", () => {
    expect(ok(breakLineAt(`a+b${C}=c`))).toBe(n(`\\begin{aligned}a+b\\\\ &${C}=c\\end{aligned}`));
  });
  it("without a relation the lines are gathered", () => {
    expect(ok(breakLineAt(`a+b${C}+c`))).toBe(n(`\\begin{gathered}a+b\\\\ ${C}+c\\end{gathered}`));
  });
  it("splits a line of an aligned equation, keeping the rest", () => {
    expect(ok(breakLineAt(`\\begin{aligned}x&=a${C}+b\\\\ &=c\\end{aligned}`))).toBe(n(`\\begin{aligned}x&=a\\\\ &${C}\\quad+b\\\\ &=c\\end{aligned}`));
  });
  it("Enter at the end of the last line adds an empty line", () => {
    expect(ok(breakLineAt(`\\begin{aligned}x&=a${C}\\end{aligned}`))).toBe(n(`\\begin{aligned}x&=a\\\\ &${C}\\end{aligned}`));
  });
  it("Enter after the end of a multi-line equation (MathLive's End leaves it) adds a line to it", () => {
    expect(ok(breakLineAt(`\\begin{aligned}x&=a\\\\ &=b\\end{aligned}${C}`))).toBe(n(`\\begin{aligned}x&=a\\\\ &=b\\\\ &${C}\\end{aligned}`));
    expect(ok(breakLineAt(`\\begin{aligned}x&=a\\end{aligned}+b${C}+c`))).toBe(n(`\\begin{aligned}x&=a+b\\\\ &${C}\\quad+c\\end{aligned}`));
  });
  it("keeps multline and gathered", () => {
    expect(ok(breakLineAt(`\\begin{multline}a+b${C}+c\\\\ +d\\end{multline}`))).toBe(n(`\\begin{multline}a+b\\\\ ${C}+c\\\\ +d\\end{multline}`));
  });
  it("refuses a caret inside a fraction", () => {
    expect(breakLineAt(`x=\\frac{a${C}}{b}`)).toHaveProperty("error");
  });
  it("kinds survive a line break", () => {
    expect(ok(breakLineAt(`\\pvec[P/O]{r}=\\dcm{b}{a}${C}+\\crossmat{\\omega}`))).toBe(n(`\\begin{aligned}\\pvec[P/O]{r}&=\\dcm{b}{a}\\\\ &${C}\\quad+\\crossmat{\\omega}\\end{aligned}`));
  });
});

describe("setAlignmentAt (Ctrl+;)", () => {
  it("moves the alignment point of the current line", () => {
    expect(ok(setAlignmentAt(`\\begin{aligned}x&=a+${C}b\\\\ &=c\\end{aligned}`))).toBe(n(`\\begin{aligned}x=a+&${C}b\\\\ &=c\\end{aligned}`));
  });
  it("makes a single line aligned", () => {
    expect(ok(setAlignmentAt(`x${C}=a`))).toBe(n(`\\begin{aligned}x&${C}=a\\end{aligned}`));
  });
  it("turns gathered into aligned, other lines at their relation", () => {
    expect(ok(setAlignmentAt(`\\begin{gathered}x${C}=a\\\\ y=b\\end{gathered}`))).toBe(n(`\\begin{aligned}x&${C}=a\\\\ y&=b\\end{aligned}`));
  });
  it("multline has no alignment point", () => {
    expect(setAlignmentAt(`\\begin{multline}a${C}\\\\ b\\end{multline}`)).toHaveProperty("error");
  });
});

describe("multline in the editor (marked gathered)", () => {
  it("round-trips, also with a gathered inside", () => {
    for (const l of ["\\begin{multline}a+b\\\\ +c\\end{multline}", "x\\begin{multline}a\\begin{gathered}p\\\\ q\\end{gathered}\\\\ +c\\end{multline}"]) {
      const ed = multlineToEditor(l);
      expect(ed).not.toMatch(/\\(begin|end)\{multline/);
      expect(multlineFromEditor(ed)).toBe(l);
    }
  });
});
