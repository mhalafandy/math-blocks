import { describe, expect, it } from "vitest";
import { applyPreset, DEFAULT_STYLE, expandNotation, letterRoles, normalizeStyle, STYLE_PRESET_BY_ID, styleAst, styleHash, styleNotation, withLetterRoles, type MathStyle, type SymbolRule } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "../src";

/** The drawing as explicit LaTeX: rules applied, kinds expanded in the style's notation. */
const drawn = (latex: string, style: MathStyle) => serializeLatex(expandNotation(styleAst(parseLatex(latex).root, style), styleNotation(style)));
const rules = (style: MathStyle, ...r: SymbolRule[]): MathStyle => ({ ...style, symbols: [...style.symbols, ...r] });
const iso = applyPreset(DEFAULT_STYLE, STYLE_PRESET_BY_ID.get("iso")!);

describe("kinds model: symbol rules (per document)", () => {
  it("a rule naming a token kind gives its shape: e is a constant (ISO upright)", () => {
    const s = rules(iso, { symbol: "e", text: "e", kind: "constant" });
    expect(drawn("e+x", s)).toBe("\\mathrm{e}+x");
    expect(drawn("e+x", iso)).toBe("e+x");
  });

  it("a rule naming a wrapper kind draws the symbol as that kind, the source unchanged: J is a matrix", () => {
    const s = rules(DEFAULT_STYLE, { symbol: "J", text: "J", kind: "mat" });
    expect(drawn("J\\omega", s)).toBe(drawn("\\mat{J}\\omega", DEFAULT_STYLE));
    expect(serializeLatex(parseLatex("J\\omega").root)).toBe("J\\omega");
  });

  it("when bold: a bold ω is a vector, a plain ω stays a scalar", () => {
    const s = rules(DEFAULT_STYLE, { symbol: "\\omega", text: "ω", when: { bold: true }, kind: "pvec" });
    expect(drawn("\\boldsymbol{\\omega}+\\omega", s)).toBe(drawn("\\pvec{\\omega}+\\omega", DEFAULT_STYLE));
  });

  it("a symbol with its subscript (v_0), and the place condition (index or base)", () => {
    const s = rules(iso, { symbol: "v_0", text: "v", sub: "0", kind: "constant" });
    expect(drawn("v_0+v_1+v", s)).toBe("\\mathrm{v}_0+v_1+v");
    const inIndex = rules(DEFAULT_STYLE, { symbol: "b", text: "b", when: { where: "index" }, kind: "pvec" });
    expect(drawn("b+x_b", inIndex)).toBe(drawn("b+x_{\\pvec{b}}", DEFAULT_STYLE));
  });

  it("explicitly styled letters are left as written", () => {
    const s = rules(iso, { symbol: "e", text: "e", kind: "constant" });
    expect(drawn("\\mathit{e}", s)).toBe("\\mathit{e}");
  });

  it("the classification is rules too, and new rules change the hash", () => {
    const s = withLetterRoles(DEFAULT_STYLE, { i: "counter", e: "constant" });
    expect(letterRoles(s)).toEqual({ i: "counter", e: "constant" });
    expect(s.symbols.find((r) => r.text === "i")?.when?.where).toBe("index");
    const r = rules(s, { symbol: "J", text: "J", kind: "mat" });
    expect(styleHash(r)).not.toBe(styleHash(s));
    expect(normalizeStyle(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });
});

describe("kinds model: explicit token forms and units", () => {
  it("\\unit draws upright with a thin space after a number; round trip", () => {
    expect(serializeLatex(parseLatex("3\\unit{m/s}").root)).toBe("3\\unit{m/s}");
    expect(drawn("3\\unit{m/s}", DEFAULT_STYLE)).toBe("3\\,\\mathrm{m}/\\mathrm{s}");
    expect(drawn("x\\unit{kg}", DEFAULT_STYLE)).toBe("x\\mathrm{kg}");
  });

  it("\\const, \\op, \\lbl follow their token kind's style", () => {
    expect(drawn("\\const{e}^{x}", iso)).toBe("\\mathrm{e}^x");
    expect(drawn("\\const{e}", DEFAULT_STYLE)).toBe("e");
    expect(drawn("\\op{d}x", iso)).toBe("\\mathrm{d}x");
    expect(drawn("v_{\\lbl{a}}", iso)).toBe("v_{\\mathrm{a}}");
  });
});

describe("kinds model: explaining a symbol (hover)", () => {
  it("follows the resolution order", async () => {
    const { explainSymbol, withLetterRoles: wl } = await import("@mathblocks/math-core");
    const s = wl(rules(DEFAULT_STYLE, { symbol: "\\omega", text: "ω", when: { bold: true }, kind: "pvec" }), { i: "counter", e: "constant" });
    const base = { bold: false, forced: false, where: "base" as const };
    expect(explainSymbol({ ...base, text: "r", inKind: "pvec" }, s)).toEqual({ kind: "pvec", reason: "written as \\pvec" });
    expect(explainSymbol({ ...base, text: "ω", bold: true }, s).kind).toBe("pvec");
    expect(explainSymbol({ ...base, text: "ω" }, s).kind).toBe("variable");
    expect(explainSymbol({ ...base, text: "e" }, s).kind).toBe("constant");
    expect(explainSymbol({ ...base, text: "d", differential: true }, s).kind).toBe("operator");
    expect(explainSymbol({ ...base, text: "i", where: "index" }, s).kind).toBe("counter");
    expect(explainSymbol({ ...base, text: "s", where: "index", indexRun: ["s", "f"] }, s)).toEqual({ kind: "label", reason: "part of the index word “sf”" });
    expect(explainSymbol({ ...base, text: "I", where: "index" }, s).kind).toBe("roman");
    expect(explainSymbol({ ...base, text: "x", forced: true }, s).reason).toMatch(/font is written/);
    expect(explainSymbol({ ...base, text: "Ω" }, s).reason).toBe("a capital Greek letter");
  });
});
