import { describe, expect, it } from "vitest";
import { BENCH_SET, sameEquation } from "./benchmark";
import { parseLatex } from "@mathblocks/math-latex";

describe("speed benchmark", () => {
  it("ten generic equations, all valid", () => {
    expect(BENCH_SET).toHaveLength(10);
    for (const e of BENCH_SET) expect(parseLatex(e.latex).diagnostics.filter((d) => d.severity === "error"), e.name).toEqual([]);
  });
  it("an equation counts as done when it looks the same, whatever keys produced it", () => {
    expect(sameEquation("\\frac{a+b}{c-d}", BENCH_SET[0]!.latex)).toBe(true);
    expect(sameEquation("\\int_0^\\infty e^{-x^2}\\,dx", BENCH_SET[1]!.latex)).toBe(true);
    expect(sameEquation("\\pvec{\\omega}\\times(\\pvec{\\omega}\\times\\pvec{r})", BENCH_SET[9]!.latex)).toBe(true);
    expect(sameEquation("\\frac{a+b}{c}", BENCH_SET[0]!.latex)).toBe(false);
  });
});
