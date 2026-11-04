import { describe, expect, it } from "vitest";
import { WORD_DEFAULT_PROFILE } from "@mathblocks/math-omml";
import { flatOpc } from "@mathblocks/ooxml";
import { indexEquations } from "./symbolIndex";
import { baseLetter, nativeSymbolRun, nomenclatureEntries, nomenclatureXml, parseNomenclature } from "./nomenclature";

const eq = (latex: string, page: number, number?: string) => ({ tag: `t${page}${latex.length}`, page, context: "", latex, display: true, blockId: null, number: number ?? null });

describe("nomenclature", () => {
  const equations = [eq("\\vec{r}=r\\hat{s}", 1, "(1.1)"), eq("\\theta_{0}=\\omega t+\\alpha", 2, "(1.2)"), eq("m\\ddot{\\vec{r}}=\\vec{F}+M", 3)];
  const entries = nomenclatureEntries({ symbols: indexEquations(equations) });

  it("finds base letters", () => {
    expect(baseLetter("\\vec{r}")).toBe("r");
    expect(baseLetter("\\theta_0")).toBe("θ");
    expect(baseLetter("\\mathbf{F}_{sf}")).toBe("F");
  });

  it("sorts Latin, then Greek, lower case before upper", () => {
    const keys = entries.map((e) => e.key);
    expect(keys.indexOf("m")).toBeLessThan(keys.indexOf("M"));
    expect(keys.indexOf("t")).toBeLessThan(keys.indexOf("\\alpha"));
    expect(keys.indexOf("\\alpha")).toBeLessThan(keys.indexOf("\\theta_0"));
    expect(keys.indexOf("\\theta_0")).toBeLessThan(keys.indexOf("\\omega"));
    expect(entries.find((e) => e.key === "\\theta_0")!.where).toBe("(1.2)");
    expect(entries.find((e) => e.key === "M")!.where).toBe("p. 3");
  });

  it("keeps descriptions typed in Word when regenerated", () => {
    const xml = nomenclatureXml(entries, { symbolRun: (k) => nativeSymbolRun(k, WORD_DEFAULT_PROFILE), descriptions: new Map([["m", { text: "mass" }]]), showWhere: true });
    const pkg = flatOpc([xml]);
    const kept = parseNomenclature(pkg);
    expect(kept.get("m")?.text).toBe("mass");
    expect(kept.has("\\theta_0")).toBe(true);
    expect(kept.get("\\theta_0")?.text).toBe("");
    // Group and header rows are not symbols.
    expect([...kept.keys()]).not.toContain("Symbol");
  });

  it("reads Classic pictures back by their alt text", () => {
    const row = `<w:tr><w:tc><w:p><w:r><w:pict><v:shape alt="MathBlocks inline: \\vec{r}"/></w:pict></w:r></w:p></w:tc><w:tc><w:p><w:r><w:rPr><w:i/></w:rPr><w:t>position</w:t></w:r></w:p></w:tc></w:tr>`;
    const kept = parseNomenclature(row);
    expect(kept.get("\\vec{r}")?.text).toBe("position");
    expect(kept.get("\\vec{r}")?.xml).toContain("<w:i/>");
  });
});

describe("definitions and dependencies", async () => {
  const { definitionStatus, dependencies } = await import("./symbolIndex");
  const equations = [eq("E=m c^{2}", 1, "(1)"), eq("m=\\rho V", 2, "(2)"), eq("p=m v", 3, "(3)"), eq("K=p v/2", 4, "(4)")];
  const index = { document: "d", name: "d", equations, symbols: indexEquations(equations) };
  const sym = (k: string) => index.symbols.find((s) => s.key === k)!;

  it("flags symbols used before their definition", () => {
    expect(definitionStatus(index, sym("m"))).toBe("usedBefore");
    expect(definitionStatus(index, sym("p"))).toBe("defined");
    expect(definitionStatus(index, sym("v"))).toBe("undefined");
  });

  it("lists what an equation depends on and what uses it", () => {
    const d = dependencies(index, equations[2]!.tag);
    expect(d.dependsOn.map((x) => `${x.symbol}${x.equation.number}`)).toEqual(["m(2)"]);
    expect(d.usedBy.map((e) => e.number)).toEqual(["(4)"]);
  });
});
