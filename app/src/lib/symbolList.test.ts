import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE, withLetterRoles, type MathStyle } from "@mathblocks/math-core";
import { checkList, defineTag, definitionSymbol, DEFAULT_LIST_SETTINGS, findDefines, parseDefineTag, symbolsIn, tableEntries, type DefinitionIn, type EquationIn } from "./symbolList";

const ruled: MathStyle = { ...DEFAULT_STYLE, symbols: [{ symbol: "\\boldsymbol{\\omega}", text: "ω", when: { bold: true }, kind: "pvec" }] };
const def = (symbol: string, meaning: string, unit: string | undefined, start: number, equationsBefore: number): DefinitionIn => ({ symbol, meaning, ...(unit ? { unit } : {}), start, equationsBefore });

describe("list of symbols: the \\define tag", () => {
  it("finds tags in text, with and without a unit", () => {
    const t = "The body rotates with angular velocity ω. \\define{\\pvec{\\omega}}{angular velocity of the body}[rad/s] Its mass is m. \\define{m}{mass}";
    const r = findDefines(t);
    expect(r.errors).toEqual([]);
    expect(r.defines.map((d) => [d.symbol, d.meaning, d.unit])).toEqual([["\\pvec{\\omega}", "angular velocity of the body", "rad/s"], ["m", "mass", undefined]]);
    expect(t.slice(r.defines[0]!.start, r.defines[0]!.end)).toBe("\\define{\\pvec{\\omega}}{angular velocity of the body}[rad/s]");
  });
  it("meanings may hold inline math and braces; errors are reported", () => {
    expect(findDefines("\\define{v_0}{speed of $\\frm{B}$ at $t=0$}[m/s]").defines[0]!.meaning).toBe("speed of $\\frm{B}$ at $t=0$");
    expect(findDefines("\\define{x}").errors[0]!.what).toMatch(/meaning is missing/);
    expect(findDefines("\\define{x}{").errors[0]!.what).toMatch(/closing \}/);
  });
  it("tag round trip", () => {
    const d = { symbol: "{}_{max}", meaning: "maximum value" };
    expect(parseDefineTag(defineTag(d))).toEqual(d);
    expect(parseDefineTag(defineTag({ symbol: "a", meaning: "acceleration", unit: "m/s^2" }))?.unit).toBe("m/s^2");
  });
});

describe("list of symbols: identity on the kinds model", () => {
  it("a bold ω under the vector rule and \\pvec{\\omega} are the same symbol", () => {
    expect(definitionSymbol("\\pvec{\\omega}", ruled)!.key).toBe(definitionSymbol("\\boldsymbol{\\omega}", ruled)!.key);
    expect(symbolsIn("\\boldsymbol{\\omega}=\\omega t", ruled).map((o) => o.key)).toEqual(expect.arrayContaining([definitionSymbol("\\pvec{\\omega}", ruled)!.key, "\\omega", "t"]));
  });
  it("v_0 is one symbol; a power is not part of it; looks are not identity", () => {
    expect(symbolsIn("v_0^2+v", DEFAULT_STYLE).map((o) => o.key)).toEqual(["v_0", "v"]);
    expect(definitionSymbol("\\mathrm{x}", DEFAULT_STYLE)!.key).toBe("x");
  });
  it("index words and labels on an empty base; counters are never symbols", () => {
    const s = withLetterRoles(DEFAULT_STYLE, { i: "counter" });
    expect(symbolsIn("\\sigma_{max}+x_i+\\sum_{k=1}^{N}a_k", s).map((o) => o.key)).toEqual(["\\sigma", "{}_{max}", "x", "N", "a_k"]);
    expect(symbolsIn("\\sigma_{max}", s)[0]!.alsoKey).toBe("\\sigma_{max}");
    expect(definitionSymbol("{}_{max}", s)!.group).toBe("subscripts");
    expect(definitionSymbol("\\text{RMS}", s)!.group).toBe("abbreviations");
  });
  it("frame labels: the same symbol, unless the definition has them", () => {
    const keys = symbolsIn("\\pvec[B/N]{\\omega}", DEFAULT_STYLE)[0]!;
    expect(keys.key).toBe(definitionSymbol("\\pvec{\\omega}", DEFAULT_STYLE)!.key);
    expect(keys.alsoKey).toBe(definitionSymbol("\\pvec[B/N]{\\omega}", DEFAULT_STYLE)!.key);
  });
});

describe("list of symbols: table and checks", () => {
  const eqs: EquationIn[] = [
    { latex: "E=\\frac{1}{2}m v^2", index: 0, number: "(1.1)" },
    { latex: "\\boldsymbol{\\omega}\\times\\pvec{r}+\\alpha", index: 1, number: "(1.2)" },
    { latex: "F=m a", index: 2 },
  ];
  const defs = [def("m", "mass", "kg", 10, 0), def("v", "speed", "m/s", 20, 0), def("\\pvec{\\omega}", "angular velocity", "rad/s", 30, 1), def("\\alpha", "angle", "rad", 40, 2), def("E", "energy", "J", 50, 0), def("\\beta", "unused angle", undefined, 60, 3), def("m", "a different mass", undefined, 70, 3)];
  it("sorted Latin a A b B…, then Greek in Greek order, grouped with headings", () => {
    const rows = tableEntries(defs, eqs, ruled, { ...DEFAULT_LIST_SETTINGS, columns: ["symbol", "meaning", "unit", "first"] });
    const flat = rows.map((r) => ("heading" in r ? `# ${r.heading}` : `${r.occ.key}${r.first ? ` ${r.first}` : ""}`));
    expect(flat).toEqual(["# Latin symbols", "E (1.1)", "m (1.1)", "v (1.1)", "# Greek symbols", "\\alpha", "\\beta", `${definitionSymbol("\\pvec{\\omega}", ruled)!.key} (1.2)`]);
  });
  it("checks: used but not defined, defined but not used, two meanings, defined after use", () => {
    const c = checkList(defs, eqs, ruled, DEFAULT_LIST_SETTINGS);
    const by = (k: string) => c.filter((x) => x.kind === k).map((x) => x.key);
    expect(by("undefined")).toEqual(expect.arrayContaining(["F", "a", "\\pvec{r}"]));
    expect(by("unused")).toEqual(["\\beta"]);
    expect(by("two-meanings")).toEqual(["m"]);
    expect(by("late")).toEqual(["\\alpha"]);
  });
  it("one meaning, two symbols", () => {
    const c = checkList([def("a", "the acceleration", undefined, 1, 0), def("b", "Acceleration.", undefined, 2, 0)], [], DEFAULT_STYLE, DEFAULT_LIST_SETTINGS);
    expect(c.some((x) => x.kind === "two-symbols")).toBe(true);
  });
});

describe("list of symbols: a definition of a whole indexed symbol", () => {
  it("\\define{\\sigma_{max}} is σ_max; its max label is not asked for", () => {
    const occ = definitionSymbol("\\sigma_{max}", DEFAULT_STYLE)!;
    expect(occ.key).toBe("\\sigma_{max}");
    const c = checkList([def("\\sigma_{max}", "maximum stress", "Pa", 0, 0)], [{ latex: "\\sigma_{max}=2", index: 0 }], DEFAULT_STYLE, DEFAULT_LIST_SETTINGS);
    expect(c).toEqual([]);
  });
});
