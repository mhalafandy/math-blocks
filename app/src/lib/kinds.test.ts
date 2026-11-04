import { describe, expect, it } from "vitest";
import { PRESETS, type NotationProfile, type PresetId } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { fromEditorLatex, toEditorLatex } from "./kinds";

const norm = (l: string) => serializeLatex(parseLatex(l).root);

describe("notation kinds: source ⇄ editor form", () => {
  it("parses and writes kind macros with optional frame labels", () => {
    expect(norm("\\pvec[P/O]{r}")).toBe("\\pvec[P/O]{r}");
    expect(norm("\\dcm{b}{a}")).toBe("\\dcm{b}{a}");
    expect(norm("\\cmat{c}^{\\T}")).toBe("\\cmat{c}^{\\T}");
    expect(norm("\\pvec{r}_{2}'")).toBe(norm("\\pvec{r}_2'"));
  });

  it("wraps kinds for the editor in their style (Hughes)", () => {
    expect(toEditorLatex("\\pvec{r}")).toBe("\\class{nk-pvec}{\\overrightharpoon{\\mathbf{r}}}");
    expect(toEditorLatex("\\pvec[P/O]{r}")).toBe("\\class{nk-pvec}{\\overrightharpoon{\\mathbf{r}}_{P/O}}");
    expect(toEditorLatex("\\dcm{b}{a}")).toBe("\\class{nk-dcm}{\\mathbf{C}_{ba}}");
    expect(toEditorLatex("\\crossmat{\\omega}")).toBe("\\class{nk-crossmat}{\\boldsymbol{\\omega}^{\\times}}");
  });

  for (const preset of Object.keys(PRESETS) as PresetId[]) {
    const profile: NotationProfile = { preset, overrides: {} };
    it(`round-trips every kind (${preset})`, () => {
      const cases = ["\\pvec{r}", "\\pvec[P/O]{r}", "\\uvec{s}", "\\bvec{b}", "\\vectrix{S}", "\\cmat{c}", "\\mat{A}", "\\dcm{b}{a}", "\\crossmat{\\omega}", "\\dyadic{I}", "\\tens{T}", "\\quat{q}", "\\frm{a}", "\\body{B}", "\\cmat{c}^{\\T}", "\\diff{m}", "\\pvec{\\omega}_{2}", "\\dot{\\pvec{r}}", "\\pvec{r}'"];
      for (const src of cases) {
        const ed = toEditorLatex(src, profile);
        const back = fromEditorLatex(ed, profile);
        expect(back.handStyled, `${src} → ${ed}`).toEqual([]);
        expect(back.latex, `${src} → ${ed}`).toBe(norm(src));
      }
    });
  }

  it("keeps an object whose structure was edited out of its style, and reports it", () => {
    const r = fromEditorLatex("\\class{nk-pvec}{\\hat{\\mathbf{r}}}");
    expect(r.handStyled).toHaveLength(1);
    expect(r.latex).toBe("\\hat{\\mathbf{r}}");
  });

  it("accepts a changed base and scripts added inside", () => {
    expect(fromEditorLatex("\\class{nk-pvec}{\\overrightharpoon{q}}").latex).toBe("\\pvec{q}");
    expect(fromEditorLatex("\\class{nk-pvec}{\\overrightharpoon{\\mathbf{r}}'}").latex).toBe(norm("\\pvec{r}'"));
  });
});
