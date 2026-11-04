import { describe, expect, it } from "vitest";
import { cleanLatex } from "./recognize";
import { DEFAULT_SNIPPETS, matchSnippet } from "./snippets";

describe("recognised LaTeX clean-up", () => {
  it("strips delimiters, fences, equation environments and tags", () => {
    expect(cleanLatex("```latex\n$$E=mc^2$$\n```")).toBe("E=mc^2");
    expect(cleanLatex("\\[ x^2 \\]")).toBe("x^2");
    expect(cleanLatex("\\begin{equation} a=b \\tag{2.1} \\end{equation}")).toBe("a=b");
    expect(cleanLatex("\\begin{align} a&=b\\\\c&=d \\end{align}")).toBe("\\begin{aligned} a&=b\\\\c&=d \\end{aligned}");
  });
});

describe("snippets", () => {
  const before = (text: string) => (n: number) => text.slice(Math.max(0, text.length - n));
  it("matches the longest trigger before the cursor", () => {
    expect(matchSnippet(before("x+ddt"), DEFAULT_SNIPPETS)?.trigger).toBe("ddt");
    expect(matchSnippet(before("pdvt"), DEFAULT_SNIPPETS)?.trigger).toBe("pdvt");
    expect(matchSnippet(before("y"), DEFAULT_SNIPPETS)).toBeNull();
  });
});
