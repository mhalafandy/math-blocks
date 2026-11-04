import { describe, expect, it } from "vitest";
import { walk } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { ALL_ITEMS, CATEGORIES, conventionLatex, DEFAULT_FAVORITES, ENTRIES, findEntry, findItem, plainLatex, searchPalette, STRUCTURES, VECTOR_STYLES, type Convention, type VectorStyle } from "./palette";
import { entryVariants } from "./paletteSupport";

/** LaTeX with sample letters in the slots, so styles stay visible when comparing entries. */
const sample = (latex: string) => serializeLatex(parseLatex(latex.replace(/#0/g, "x").replace(/#\?/g, "y")).root);

describe("palette registry", () => {
  it("has unique keys and unique entry ids", () => {
    expect(new Set(ALL_ITEMS.map((x) => x.key)).size).toBe(ALL_ITEMS.length);
    expect(new Set(ENTRIES.map((e) => e.id)).size).toBe(ENTRIES.length);
  });

  it("puts every entry in at least one known category", () => {
    const known = new Set<string>([...CATEGORIES.map((c) => c.id), ...STRUCTURES.map((s) => s.id)]);
    for (const e of ENTRIES) {
      expect(e.categories.length, e.id).toBeGreaterThan(0);
      for (const c of e.categories) expect(known.has(c), `${e.id}: ${c}`).toBe(true);
    }
  });

  it("every LaTeX an entry can insert parses cleanly (all conventions and vector styles)", () => {
    for (const e of ENTRIES) {
      for (const latex of entryVariants(e)) {
        const { root, diagnostics } = parseLatex(plainLatex(latex));
        expect(diagnostics, `${e.id}: ${latex}`).toEqual([]);
        walk(root, (n) => expect(n.kind, `${e.id}: ${latex}`).not.toBe("raw"));
      }
    }
  });

  it("has no two entries with the same normalised LaTeX", () => {
    const seen = new Map<string, string>();
    const dups: string[] = [];
    for (const e of ENTRIES) {
      if (e.item.conventions) continue;
      const k = sample(e.item.latex);
      if (seen.has(k)) dups.push(`${seen.get(k)} = ${e.id} (${k})`);
      else seen.set(k, e.id);
    }
    expect(dups).toEqual([]);
  });

  it("keeps \\bot and \\perp as two entries (ordinary vs relation)", () => {
    expect(findEntry("logic.bot")?.mathClass ?? "ord").toBeTruthy();
    expect(findEntry("relations.perp")).toBeDefined();
    expect(findEntry("logic.bot")).toBeDefined();
  });

  it("old keys of merged entries still resolve (saved favourites and recents)", () => {
    expect(findItem("symbols:logic:land")?.item.latex).toBe("\\wedge");
    expect(findItem("tabs:tab-spacecraft:vectrix")?.item.id).toBe("vecbold");
    expect(findItem("templates:scripts:tensor")?.item.id).toBe("subsup");
    for (const k of DEFAULT_FAVORITES) expect(findItem(k), k).toBeDefined();
  });

  it("knows the fastest way to type an entry", () => {
    expect(findEntry("fractions.frac")?.shortcut).toBe("Ctrl+F");
    expect(findEntry("tab-derivs.pdx")?.snippet).toBe("pdv");
  });

  it("lists an entry in every category it belongs to", () => {
    expect(findEntry("operators.wedge")?.categories).toEqual(expect.arrayContaining(["operators", "sets-logic"]));
    expect(findEntry("operators.times")?.categories).toContain("linalg");
  });
});

describe("spacecraft conventions", () => {
  const conv = (id: string, c: Convention, v: VectorStyle = "harpoon") => conventionLatex(findEntry(id)!.item, c, v);

  it("switches DCM, skew matrix and quaternion between Hughes, Schaub and Markley", () => {
    expect(conv("tab-spacecraft.dcm", "hughes")).toBe("\\mathbf{C}_{#?#?}");
    expect(conv("tab-spacecraft.dcm", "schaub")).toContain("\\left[");
    expect(conv("tab-spacecraft.dcm", "markley")).toBe("\\mathbf{A}");
    expect(conv("tab-spacecraft.skewop", "hughes")).toBe("#0^{\\times}");
    expect(conv("tab-spacecraft.skewop", "schaub")).toContain("\\tilde");
    expect(conv("tab-spacecraft.skewop", "markley")).toContain("\\times\\right]");
  });

  it("draws physical vectors in the chosen style", () => {
    const styles = Object.keys(VECTOR_STYLES) as VectorStyle[];
    const forms = styles.map((v) => conv("tab-spacecraft.torque", "hughes", v));
    expect(forms).toEqual(["\\overrightharpoon{\\mathbf{g}}", "\\vec{\\mathbf{g}}", "\\vec{g}", "\\mathbf{g}"]);
    expect(conv("tab-spacecraft.angvelframe", "schaub", "harpoon")).toBe("\\overrightharpoon{\\boldsymbol{\\omega}}_{B/N}");
  });
});

describe("palette search", () => {
  it("finds symbols by meaning", () => {
    expect(searchPalette("gradient")[0]?.item.glyph ?? searchPalette("gradient")[0]?.item.latex).toMatch(/∇|nabla/);
    expect(searchPalette("partial derivative").some((x) => x.item.latex.includes("\\partial"))).toBe(true);
    expect(searchPalette("cross product").some((x) => x.item.latex.includes("\\times"))).toBe(true);
    expect(searchPalette("rotation matrix").some((x) => x.item.id === "rotz")).toBe(true);
    expect(searchPalette("angular velocity").length).toBeGreaterThan(0);
    expect(searchPalette("dcm").some((x) => x.item.id === "dcm")).toBe(true);
  });
});
