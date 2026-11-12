import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { checkStyle, classifyIndices } from "./styleCheck";

const norm = (l: string) => serializeLatex(parseLatex(l).root);

describe("classification of indices", () => {
  // A planted mix: counters (summation index, range), a variable used as an index, a frame label,
  // and one letter with nothing to go by.
  const eqs = [
    "S=\\sum_{i=1}^{N}x_i",
    "y_k=a_k+b,\\quad k=1,\\dots,K",
    "u_t=\\frac{du}{dt},\\quad t\\ge 0",
    "\\pvec[B]{r}+v_B",
    "w_q=2",
  ];
  const by = (l: string) => classifyIndices(eqs).find((p) => p.letter === l);

  it("proposes counters, variables and labels with a reason", () => {
    expect(by("i")?.proposed).toBe("counter");
    expect(by("i")?.reasons.join(" ")).toMatch(/summation/);
    expect(by("k")?.proposed).toBe("counter");
    expect(by("k")?.reasons.join(" ")).toMatch(/range/);
    expect(by("t")?.proposed).toBe("variable");
    expect(by("B")?.proposed).toBe("label");
  });

  it("marks a letter with nothing to go by as undecided", () => {
    expect(by("q")?.proposed).toBeNull();
    expect(by("q")?.reasons.join(" ")).toMatch(/nothing shows/);
  });

  it("marks conflicting evidence as undecided", () => {
    const p = classifyIndices(["\\sum_{n=1}^{N}a_n", "x_n+n=3"]).find((x) => x.letter === "n");
    expect(p?.proposed).toBeNull();
    expect(p?.reasons.join(" ")).toMatch(/conflicting/);
  });

  it("an equals sign without a range does not make a counter", () => {
    expect(classifyIndices(["x=y_z", "y_z=2"]).find((x) => x.letter === "z")?.proposed).toBeNull();
    // Roman numerals in indices are not letters to classify, even when I is also a variable elsewhere.
    expect(classifyIndices(["\\vectrix{F}_{I}=\\dcm{F_I}{F}\\vectrix{F}", "\\bvec{f}_1^{I}+\\bvec{f}_2^{V}", "I=mr^2"]).map((x) => x.letter)).toEqual(["F"]); // F: a frame label of the DCM
  });
});

describe("Check style", () => {
  const eqs = [
    { id: "a", latex: "\\sigma_{\\mathrm{sf}}=E" },
    { id: "b", latex: "\\sigma_{sf}+\\tau_{sf}" },
    { id: "c", latex: "\\mathrm{x}+v_{\\mathbf{n}}+\\mathrm{kg}" },
    { id: "d", latex: "\\pvec{r}+\\vec{r}" },
  ];

  it("lists forced styles, mixed index styles and letters in several forms", () => {
    const issues = checkStyle(eqs, DEFAULT_STYLE);
    const kinds = issues.map((i) => `${i.kind}:${i.key.split(":").slice(1, 3).join(":")}`);
    expect(kinds).toContain("forced:index:sf");
    expect(kinds).toContain("forced:symbol:x");
    expect(kinds).toContain("forced:index:n");
    expect(issues.some((i) => i.kind === "mixed" && i.message.includes("“sf”") && i.equations.length === 2)).toBe(true);
    expect(issues.some((i) => i.kind === "forms" && i.message.includes("“r”"))).toBe(true);
    // Units and words outside indices are text, not flagged.
    expect(issues.some((i) => i.message.includes("“kg”"))).toBe(false);
  });

  it("conforming removes the forced look only", () => {
    const issue = checkStyle(eqs, DEFAULT_STYLE).find((i) => i.key === "forced:index:sf:normal:a")!;
    expect(issue.fix!("\\sigma_{\\mathrm{sf}}=E")).toBe("\\sigma_{sf}=E");
    const bold = checkStyle(eqs, DEFAULT_STYLE).find((i) => i.key.startsWith("forced:index:n:"))!;
    expect(norm(bold.fix!(eqs[2]!.latex))).toBe(norm("\\mathrm{x}+v_n+\\mathrm{kg}"));
  });

  it("an exception is not listed again", () => {
    const all = checkStyle(eqs, DEFAULT_STYLE);
    const kept = all.find((i) => i.kind === "mixed")!;
    const after = checkStyle(eqs, { ...DEFAULT_STYLE, exceptions: [kept.key] });
    expect(after.some((i) => i.key === kept.key)).toBe(false);
    expect(after.length).toBe(all.length - 1);
  });

  it("pictures drawn in an older style are listed for a redraw", () => {
    const issues = checkStyle([{ id: "p", latex: "x", styleHash: "old" }], DEFAULT_STYLE, "new");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.redraw).toBe(true);
  });
});
