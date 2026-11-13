import { describe, expect, it } from "vitest";
import { documentForms, formsOf, suggestFor } from "./docSuggest";

describe("suggestions from the document", () => {
  it("collects the forms in use: kinds with frames and scripts, letters with subscripts", () => {
    const f = formsOf("\\pvec[B/N]{\\omega}=\\cmat{\\omega}^{\\T}+\\omega_1 x^2").map((x) => x.latex);
    expect(f).toContain("\\pvec[B/N]{\\omega}");
    expect(f).toContain("\\cmat{\\omega}^{\\T}");
    expect(f).toContain("\\omega_1");
    expect(f).toContain("x");
    // A power is not part of a form.
    expect(f).not.toContain("x^2");
  });

  it("typing w offers the ω forms, most used first; the Latin letter's own forms too", () => {
    const forms = documentForms(["\\pvec{\\omega}=\\pvec{\\omega}+\\cmat{\\omega}", "\\pvec{\\omega}\\times w_0", "\\omega_1"]);
    const s = suggestFor("w", forms).map((x) => `${x.latex}×${x.count}`);
    expect(s[0]).toBe("\\pvec{\\omega}×3");
    expect(s).toContain("\\cmat{\\omega}×1");
    expect(s).toContain("\\omega_1×1");
    expect(s).toContain("w_0×1");
    // q is θ on the Symbol keyboard.
    expect(suggestFor("q", documentForms(["\\dot{\\theta}+\\theta_0"])).map((x) => x.latex).sort()).toEqual(["\\dot{\\theta}", "\\theta", "\\theta_0"]);
    // The bare letter alone is not worth suggesting; non-letters nothing.
    expect(suggestFor("x", documentForms(["x+x"]))).toEqual([]);
    expect(suggestFor("+", forms)).toEqual([]);
  });
});
