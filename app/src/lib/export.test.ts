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
    expect(tex).toMatch(/\\newcommand\{\\overrightharpoon\}/);
    expect(tex.trim().endsWith("\\end{document}")).toBe(true);
  });
});

describe("LaTeX export of notation kinds", () => {
  it("defines the kinds used with \\newcommand, never \\providecommand", () => {
    const tex = documentToLatex("t.docx", [{ latex: "\\pvec[P/O]{r}=\\dcm{b}{a}\\cmat{c}^{\\T}", display: true }]);
    expect(tex).not.toContain("\\providecommand");
    expect(tex).toContain("\\newcommand{\\pvec}[2][]");
    expect(tex).toContain("_{#1}");
    expect(tex).toContain("\\newcommand{\\dcm}[2]{\\mathbf{C}_{#1#2}}");
    expect(tex).toContain("\\newcommand{\\T}{\\mathrm{T}}");
    expect(tex).not.toContain("\\newcommand{\\quat}");
  });

  it("renames macros that clash with packages when asked", () => {
    const eq = [{ latex: "\\diff{m}=\\rho\\,\\diff{V}", display: true }];
    expect(documentToLatex("t.docx", eq)).toContain("% \\diff clashes with diffcoeff");
    const renamed = documentToLatex("t.docx", eq, { renameOnClash: true });
    expect(renamed).toContain("\\newcommand{\\mbdiff}[1]");
    expect(renamed).toContain("\\mbdiff{m}=\\rho\\,\\mbdiff{V}");
  });
});
