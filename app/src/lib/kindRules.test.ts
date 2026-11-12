import { describe, expect, it } from "vitest";
import { parseLatex } from "@mathblocks/math-latex";
import { AUTO_KIND_RULES, KIND_RULES, SUGGESTED_KIND_RULES, applyKindRules, reviewKinds } from "./kindRules";

const auto = (l: string) => applyKindRules(l, AUTO_KIND_RULES).latex;
const suggested = (l: string) => applyKindRules(l, SUGGESTED_KIND_RULES).latex;
const only = (id: string, l: string) => applyKindRules(l, new Set([id])).latex;

describe("notation kinds from older forms (generic examples)", () => {
  it("unambiguous forms become kinds on conversion", () => {
    expect(auto("\\overrightharpoon{\\mathbf{v}}=\\dot{\\overrightharpoon{\\mathbf{x}}}")).toBe("\\pvec{v}=\\dot{\\pvec{x}}");
    expect(auto("\\overrightharpoon{\\boldsymbol{\\omega}}_{\\mathbf{P}\\boldsymbol{/}\\mathbf{Q}}")).toBe("\\pvec[P/Q]{\\omega}");
    expect(auto("\\vec{a}+\\vec{b}")).toBe("\\pvec{a}+\\pvec{b}");
    expect(auto("\\vec{\\mathbf{F}}^{\\mathbf{T}}\\vec{\\mathbf{I}}\\vec{\\mathbf{J}}_{c}")).toBe("\\vectrix{F}^{\\T}\\dyadic{I}\\dyadic{J}_{c}");
    expect(auto("\\hat{\\mathbf{f}}_{\\mathbf{1}}+\\mathbf{\\hat{f}}_{2}")).toBe("\\bvec{f}_{1}+\\bvec{f}_{2}");
    expect(auto("\\vec{\\mathbf{G}}^{'}^{'}\\boldsymbol{=}x^{T}\\boldsymbol{(}y\\boldsymbol{)}")).toBe("\\vectrix{G}''=x^{\\T}(y)");
  });

  it("the rules that need a decision only run when chosen", () => {
    expect(auto("\\mathbf{q}_{\\mathbf{g}}=\\left[\\mathbf{G}\\mathbf{H}\\right]\\mathbf{q}_{\\mathbf{h}}")).toBe("\\mathbf{q}_{\\mathbf{g}}=\\left[\\mathbf{G}\\mathbf{H}\\right]\\mathbf{q}_{\\mathbf{h}}");
    expect(suggested("\\mathbf{q}_{\\mathbf{g}}=\\left[\\mathbf{G}\\mathbf{H}\\right]\\mathbf{q}_{\\mathbf{h}}")).toBe("\\cmat{q}_{\\mathrm{g}}=\\left[\\mat{G}\\mat{H}\\right]\\cmat{q}_{\\mathrm{h}}");
    expect(only("upright-labels", "x_{\\mathbf{G}/\\mathbf{H}}+y_{\\mathbf{G},\\mathbf{H}}+z_{\\mathbf{g}}+w_{1}")).toBe("x_{\\mathrm{G/H}}+y_{\\mathrm{G,H}}+z_{\\mathrm{g}}+w_{1}");
    expect(only("upright-labels", "\\bvec{f}_{1}^{\\mathbf{I}\\mathbf{I}}+x_{\\mathbf{G}'/\\mathbf{H}''}")).toBe("\\bvec{f}_{1}^{\\mathrm{II}}+x_{\\mathrm{G'/H''}}");
    expect(auto("\\overrightharpoon{\\boldsymbol{\\omega}}_{\\mathbf{G}'\\boldsymbol{/}\\mathbf{H}}")).toBe("\\pvec[G'/H]{\\omega}");
    expect(only("dcm", "\\left[\\mathbf{G}\\mathbf{H}\\right]^{-1}")).toBe("\\dcm{G}{H}^{-1}");
    expect(only("body-plain", "\\int_{\\mathbf{B}_{2}}x\\,\\mathrm{d}m+\\mathbf{B}")).toBe("\\int_{B_{2}}x\\,\\mathrm{d}m+\\mathbf{B}");
    expect(only("cmat-greek", "\\boldsymbol{\\Phi}_{\\mathbf{k}}=\\begin{bmatrix}a\\\\b\\end{bmatrix}")).toBe("\\cmat{\\Phi}_{\\mathbf{k}}=\\begin{bmatrix}a\\\\b\\end{bmatrix}");
    expect(only("bvec-no-hat", "\\mathbf{u}_{1}+\\mathbf{u}_{k}")).toBe("\\bvec{u}_{1}+\\mathbf{u}_{k}");
  });

  it("frame labels in indices are not turned into kinds", () => {
    expect(only("cmat", "\\mathbf{q}_{\\mathbf{g}}")).toBe("\\cmat{q}_{\\mathbf{g}}");
    expect(only("mat", "\\mathbf{A}_{\\mathbf{G}\\mathbf{H}}")).toBe("\\mat{A}_{\\mathbf{G}\\mathbf{H}}");
  });

  it("every result parses without errors or unknown commands", () => {
    const samples = [
      "\\overrightharpoon{\\boldsymbol{\\omega}}_{\\mathbf{P}\\boldsymbol{/}\\mathbf{Q}}=\\vec{\\mathbf{F}}^{\\mathbf{T}}\\boldsymbol{\\omega}_{\\mathbf{F}}",
      "\\mathbf{q}_{\\mathbf{g}}=\\left[\\mathbf{G}\\mathbf{H}\\right]\\mathbf{q}_{\\mathbf{h}}",
      "\\vec{\\mathbf{G}}^{'}^{'}=\\begin{bmatrix}\\hat{\\mathbf{g}}_{\\mathbf{1}}&\\hat{\\mathbf{g}}_{\\mathbf{2}}\\end{bmatrix}^{\\mathbf{T}}",
    ];
    const all = new Set(KIND_RULES.map((r) => r.id));
    for (const l of samples) {
      const out = applyKindRules(l, all).latex;
      expect(parseLatex(out).diagnostics.filter((d) => d.severity === "error" || /Unknown/.test(d.message)), out).toEqual([]);
    }
  });

  it("the review counts what each rule changes, with examples", () => {
    const items = reviewKinds(["\\vec{\\mathbf{F}}", "\\vec{\\mathbf{F}}^{T}", "\\mathbf{q}", "x"]);
    const by = Object.fromEntries(items.map((i) => [i.rule.id, i]));
    expect(by.vectrix!.count).toBe(2);
    expect(by.transpose!.count).toBe(1);
    expect(by.cmat!.count).toBe(1);
    expect(by.vectrix!.examples[0]).toEqual({ before: "\\vec{\\mathbf{F}}", after: "\\vectrix{F}" });
  });
});
