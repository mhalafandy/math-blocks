import { describe, expect, it } from "vitest";
import { documentToLatex, toStandardLatex } from "./export";

describe("export", () => {
  it("writes the MathBlocks dialect as standard LaTeX", () => {
    expect(toStandardLatex("\\differentialD x+\\placeholder{}")).toBe("\\mathrm{d} x+\\square");
  });

  it("exports document equations with their numbers as tags and labels", () => {
    const tex = documentToLatex("thesis.docx", [
      { latex: "E=mc^2", display: true, number: "(A.1)", page: 2 },
      { latex: "x", display: false },
      { latex: "\\overrightharpoon{\\mathbf{c}}=0", display: true },
    ]);
    expect(tex).toContain("\\begin{equation}\n  E=mc^2\n  \\tag{A.1}\\label{eq:A.1}\n\\end{equation}");
    expect(tex).toContain("% inline: $x$");
    expect(tex).toContain("\\[\n  \\overrightharpoon{\\mathbf{c}}=0\n\\]");
    expect(tex).toMatch(/\\providecommand\{\\overrightharpoon\}/);
    expect(tex.trim().endsWith("\\end{document}")).toBe(true);
  });
});
