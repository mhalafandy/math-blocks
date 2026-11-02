import { describe, expect, it } from "vitest";
import { walk } from "@mathblocks/math-core";
import { parseLatex } from "@mathblocks/math-latex";
import { ALL_ITEMS, DEFAULT_FAVORITES, findItem, plainLatex, searchPalette } from "./palette";

describe("palette", () => {
  it("has unique keys", () => {
    expect(new Set(ALL_ITEMS.map((x) => x.key)).size).toBe(ALL_ITEMS.length);
  });

  it("every item converts cleanly (no warnings, no unparsed parts)", () => {
    for (const { key, item } of ALL_ITEMS) {
      for (const latex of [plainLatex(item.latex)]) {
        const { root, diagnostics } = parseLatex(latex);
        expect(diagnostics, `${key}: ${latex}`).toEqual([]);
        walk(root, (n) => expect(n.kind, `${key}: ${latex}`).not.toBe("raw"));
      }
    }
  });

  it("default favourites all exist", () => {
    for (const k of DEFAULT_FAVORITES) expect(findItem(k), k).toBeDefined();
  });

  it("finds symbols by meaning", () => {
    expect(searchPalette("gradient")[0]?.item.glyph ?? searchPalette("gradient")[0]?.item.latex).toMatch(/∇|nabla/);
    expect(searchPalette("partial derivative").some((x) => x.item.latex.includes("\\partial"))).toBe(true);
    expect(searchPalette("cross product").some((x) => x.item.latex.includes("\\times"))).toBe(true);
    expect(searchPalette("rotation matrix").some((x) => x.item.id === "rotz")).toBe(true);
    expect(searchPalette("angular velocity").length).toBeGreaterThan(0);
  });
});
