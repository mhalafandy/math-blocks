import { describe, expect, it } from "vitest";
import { parseLatex } from "@mathblocks/math-latex";
import { toOmml } from "../src";

describe("indices after accent-style vectors (native Word equations)", () => {
  it("writes the accented letter as the subscript's base, not a limit under it", () => {
    const latex = "\\overrightharpoon{\\mathbf{r}}_{P/O}\\overrightharpoon{\\mathbf{v}}_{P/O}\\overrightharpoon{\\bm{\\omega}}_{ba}\\overrightharpoon{\\mathbf{h}}_{c}";
    const x = toOmml(parseLatex(latex).root);
    expect(x.match(/<m:sSub>/g)?.length).toBe(4);
    expect(x.match(/<m:sSub><m:sSubPr>.*?<\/m:sSubPr><m:e><m:acc>/g)?.length).toBe(4);
    expect(x).not.toMatch(/<m:limLow>|<m:limUpp>/);
    for (const l of ["\\vec{x}_1", "\\hat{x}_i", "\\bar{x}_{max}"]) expect(toOmml(parseLatex(l).root), l).toMatch(/<m:sSub><m:sSubPr>.*?<\/m:sSubPr><m:e><m:acc>/);
  });
});
