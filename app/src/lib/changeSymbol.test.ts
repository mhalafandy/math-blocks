import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE, type MathStyle } from "@mathblocks/math-core";
import { applyChoices, changeInLatex, changeRules, findClashes, planChange, symbolTarget, type ChangeChoices, type DocDefinition, type DocEquation } from "./changeSymbol";

const S = DEFAULT_STYLE;
const ruled: MathStyle = { ...DEFAULT_STYLE, symbols: [{ symbol: "\\boldsymbol{\\omega}", text: "ω", when: { bold: true }, kind: "pvec" }] };
const T = (latex: string, style: MathStyle = S) => symbolTarget(latex, style)!;
const change = (eq: string, from: string, to: string, style: MathStyle = S, related = false) => changeInLatex(eq, T(from, style), T(to, style), style, (o) => related || o.cls !== "related");

describe("Change symbol: matching by the list's identity", () => {
  it("changes the symbol itself, kinds included", () => {
    expect(change("\\pvec{\\omega}\\times\\pvec{r}", "\\pvec{\\omega}", "\\pvec{\\Omega}").latex).toBe("\\pvec{\\Omega}\\times\\pvec{r}");
    expect(change("u=v_0+at", "v_0", "u_0").latex).toBe("u=u_0+at");
  });
  it("treats a bold ω made a vector by a rule as the same symbol", () => {
    const r = change("\\boldsymbol{\\omega}=\\pvec{\\omega}", "\\pvec{\\omega}", "\\pvec{\\Omega}", ruled);
    expect(r.latex).toBe("\\pvec{\\Omega}=\\pvec{\\Omega}");
    expect(r.occurrences.map((o) => o.cls)).toEqual(["exact", "exact"]);
  });
  it("v_0 is not v, and v is not v_0", () => {
    expect(change("v_0+v", "v", "w").latex).toBe("v_0+w");
    expect(change("v_0+v", "v_0", "u_0").latex).toBe("u_0+v");
  });
  it("keeps indices, powers, primes, dots and frame labels (decorated forms)", () => {
    const r = change("\\pvec{\\omega}_{ba}+\\pvec[B/N]{\\omega}+\\dot{\\pvec{\\omega}}", "\\pvec{\\omega}", "\\pvec{\\Omega}");
    expect(r.latex).toBe("\\pvec{\\Omega}_{ba}+\\pvec[B/N]{\\Omega}+\\dot{\\pvec{\\Omega}}");
    expect(r.occurrences.map((o) => `${o.cls}:${o.decoration}`)).toEqual(["decorated:index", "decorated:frame", "decorated:dot"]);
    expect(change("\\omega^2+\\omega'", "\\omega", "\\Omega").latex).toBe("\\Omega^2+\\Omega'");
    expect(change("v_0^2", "v_0", "u_0").latex).toBe("u_0^2");
  });
  it("a decorated form can be left out", () => {
    const r = changeInLatex("\\pvec{\\omega}+\\pvec{\\omega}_{ba}", T("\\pvec{\\omega}"), T("\\pvec{\\Omega}"), S, (o) => o.cls === "exact");
    expect(r.latex).toBe("\\pvec{\\Omega}+\\pvec{\\omega}_{ba}");
  });
  it("related forms (same letter, other kinds) change only when asked", () => {
    const eq = "\\pvec{\\omega}=\\cmat{\\omega}+\\omega";
    expect(change(eq, "\\pvec{\\omega}", "\\pvec{\\Omega}").latex).toBe("\\pvec{\\Omega}=\\cmat{\\omega}+\\omega");
    const r = change(eq, "\\pvec{\\omega}", "\\pvec{\\Omega}", S, true);
    expect(r.latex).toBe("\\pvec{\\Omega}=\\cmat{\\Omega}+\\Omega");
    expect(r.occurrences.filter((o) => o.cls === "related").map((o) => o.relatedKey)).toEqual(["\\cmat{\\omega}", "\\omega"]);
  });
  it("an accented letter is its own symbol, a related form of the letter", () => {
    const r = change("\\hat{\\omega}+\\omega", "\\omega", "\\Omega");
    expect(r.latex).toBe("\\hat{\\omega}+\\Omega");
    expect(r.occurrences.find((o) => o.before === "\\hat{\\omega}")?.cls).toBe("related");
  });
  it("leaves an equation without the symbol exactly as written", () => {
    const eq = "x_{max} =   y";
    expect(change(eq, "\\pvec{\\omega}", "\\pvec{\\Omega}")).toMatchObject({ latex: eq, changed: false, occurrences: [] });
  });
});

describe("Change symbol: the whole document", () => {
  const eqs: DocEquation[] = [
    { tag: "a", latex: "\\pvec{\\omega}=\\dot{\\theta}\\bvec{f}_3", display: false, numbered: false, section: "1 Kinematics" },
    { tag: "b", latex: "\\pvec{h}=\\mat{I}\\pvec{\\omega}_{ba}", display: true, numbered: true, number: "(1.1)", section: "1 Kinematics" },
    { tag: "c", latex: "\\cmat{\\omega}=\\mat{C}\\cmat{\\omega}", display: true, numbered: false, section: "2 Matrices" },
    { tag: "d", latex: "E=\\frac{1}{2}mv^2", display: true, numbered: true, number: "(2.1)", section: "2 Matrices" },
  ];
  const defs: DocDefinition[] = [
    { start: 10, symbol: "\\pvec{\\omega}", meaning: "angular velocity of the body", unit: "rad/s" },
    { start: 50, symbol: "\\cmat{\\omega}", meaning: "angular velocity in the body frame", unit: "rad/s" },
    { start: 90, symbol: "m", meaning: "mass", unit: "kg" },
  ];
  const plan = planChange("\\pvec{\\omega}", "\\pvec{\\Omega}", eqs, defs, S);
  if ("error" in plan) throw new Error(plan.error);
  const none: ChangeChoices = { skip: new Set(), related: new Set() };

  it("lists every occurrence, the definitions and the related forms with their own definition", () => {
    expect(plan.equations.map((e) => e.tag)).toEqual(["a", "b", "c"]);
    expect(plan.counts).toMatchObject({ equations: 3, inline: 1, numbered: 1, exact: 1, decorated: 1, related: 2, definitions: 2 });
    expect(plan.related).toEqual([expect.objectContaining({ key: "\\cmat{\\omega}", after: "\\cmat{\\Omega}", count: 2, definition: defs[1] })]);
  });
  it("keeps the definition's meaning and unit; related ones only when ticked", () => {
    const a = applyChoices(plan, none, S);
    expect(a.definitions).toEqual([{ start: 10, symbol: "\\pvec{\\Omega}", meaning: "angular velocity of the body", unit: "rad/s" }]);
    expect(a.equations.map((e) => e.latex)).toEqual(["\\pvec{\\Omega}=\\dot{\\theta}\\bvec{f}_3", "\\pvec{h}=\\mat{I}\\pvec{\\Omega}_{ba}"]);
    const b = applyChoices(plan, { skip: new Set(), related: new Set(["\\cmat{\\omega}"]) }, S);
    expect(b.definitions.map((d) => `${d.symbol}|${d.meaning}|${d.unit}`)).toEqual(["\\pvec{\\Omega}|angular velocity of the body|rad/s", "\\cmat{\\Omega}|angular velocity in the body frame|rad/s"]);
    expect(b.equations.find((e) => e.tag === "c")?.latex).toBe("\\cmat{\\Omega}=\\mat{C}\\cmat{\\Omega}");
  });
  it("an occurrence unticked in the preview is left as it is", () => {
    const a = applyChoices(plan, { skip: new Set(["b#0"]), related: new Set() }, S);
    expect(a.equations.map((e) => e.tag)).toEqual(["a"]);
  });
  it("warns when the new symbol already exists (used or defined)", () => {
    const withOmega = [...eqs, { tag: "e", latex: "\\pvec{\\Omega}=0", display: false, numbered: false }];
    const p = planChange("\\pvec{\\omega}", "\\pvec{\\Omega}", withOmega, defs, S);
    if ("error" in p) throw new Error(p.error);
    expect(findClashes(p, none, withOmega, defs, S)).toEqual([expect.objectContaining({ key: "\\pvec{\\Omega}", equations: [expect.objectContaining({ tag: "e" })] })]);
    expect(findClashes(plan, none, eqs, defs, S)).toEqual([]);
  });
  it("refuses a new symbol that is not a symbol, or the same one", () => {
    expect(planChange("\\pvec{\\omega}", "\\frac{1}{2}", eqs, defs, S)).toHaveProperty("error");
    expect(planChange("\\pvec{\\omega}", "\\pvec{\\omega}", eqs, defs, S)).toHaveProperty("error");
  });
  it("the document's rule for the letter follows it", () => {
    const p = planChange("\\pvec{\\omega}", "\\pvec{\\Omega}", eqs, defs, ruled);
    if ("error" in p) throw new Error(p.error);
    const r = changeRules(ruled.symbols, p, none);
    expect(r.changed).toBe(1);
    expect(r.rules[0]).toMatchObject({ text: "Ω", symbol: "\\boldsymbol{\\Omega}", kind: "pvec" });
  });
});
