import { describe, expect, it } from "vitest";
import { ALL_ITEMS, findItem, matchTier, searchPalette } from "./palette";
import { afterUse, fastWay, HINT_AFTER, MAX_RECENTS, nextRecents, recentItems, reorderFavorites } from "./paletteUse";

const byLatex = (latex: string) => ALL_ITEMS.find((x) => x.item.latex === latex)!;

describe("Recent", () => {
  it("newest first, at most 16, one per LaTeX", () => {
    const distinct = [...new Map(ALL_ITEMS.map((x) => [x.item.latex, x])).values()].slice(0, 30);
    let recents: string[] = [];
    for (const x of distinct) recents = nextRecents(recents, x);
    expect(recents.length).toBe(MAX_RECENTS);
    expect(recents[0]).toBe(distinct[29]!.key);
    // The same LaTeX reached from another group replaces the older entry instead of adding a second one.
    const twins = ALL_ITEMS.filter((x) => ALL_ITEMS.some((y) => y !== x && y.item.latex === x.item.latex && y.key !== x.key));
    expect(twins.length).toBeGreaterThan(1);
    const a = twins[0]!;
    const b = twins.find((y) => y.item.latex === a.item.latex && y.key !== a.key)!;
    const r = nextRecents(nextRecents([], a), b);
    expect(r).toEqual([b.key]);
    // Lists saved by older versions with duplicates show each symbol once.
    expect(recentItems([a.key, b.key]).length).toBe(1);
  });
});

describe("the one-time hint", () => {
  it("comes once, after a few clicks, only for an item with a shortcut or snippet", () => {
    let use: Record<string, number> = {};
    let shown: string[] = [];
    const hints: (string | null)[] = [];
    for (let i = 0; i < HINT_AFTER + 2; i++) {
      const r = afterUse("\\frac{#0}{#?}", use, shown, "press Ctrl+F");
      use = r.use;
      shown = r.shown;
      hints.push(r.hint);
    }
    expect(hints.filter(Boolean)).toEqual(["Faster: press Ctrl+F"]);
    expect(hints.indexOf("Faster: press Ctrl+F")).toBe(HINT_AFTER - 1);
    expect(use["\\frac{#0}{#?}"]).toBe(HINT_AFTER + 2);
    // Without a faster way: counted, never a hint.
    expect(afterUse("x", { x: 9 }, [], null).hint).toBeNull();
  });

  it("finds the editor shortcut or snippet of an item", () => {
    expect(fastWay("\\frac{#0}{#?}", [])).toMatch(/^press Ctrl\+F$/);
    expect(fastWay("\\frac{d}{dt}", [{ trigger: "ddt", latex: "\\frac{d}{dt}", name: "d/dt" }])).toBe("type ddt Tab");
    expect(fastWay("\\nothing", [])).toBeNull();
  });
});

describe("favourites", () => {
  it("drag to reorder: the dragged one takes the target's place", () => {
    const f = ["a", "b", "c", "d"];
    expect(reorderFavorites(f, "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(reorderFavorites(f, "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(reorderFavorites(f, "b", "b")).toEqual(f);
    expect(reorderFavorites(f, "x", "b")).toEqual(f);
  });
});

describe("search ranking", () => {
  it("exact LaTeX or name, then alias, then meaning, then category", () => {
    const alpha = byLatex("\\alpha");
    expect(matchTier(alpha, "\\alpha")).toBe(0);
    expect(matchTier(alpha, "alpha")).toBe(0);
    const nabla = byLatex("\\nabla");
    expect(matchTier(nabla, "gradient")).toBe(1);
    expect(matchTier(nabla, "gradi")).toBe(2);
    // "symbols" is only in the group's name (Calculus symbols).
    expect(matchTier(nabla, "symbols")).toBe(3);
    const tiers = searchPalette("calculus", 300).map((r) => matchTier(r, "calculus")!);
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
    // The exact match comes first even when others match the word too.
    expect(searchPalette("alpha")[0]?.item.latex).toBe("\\alpha");
    expect(searchPalette("\\leq")[0]?.item.latex).toBe("\\leq");
  });

  it("within a level: favourites first, then the most used", () => {
    const results = searchPalette("arrow", 200);
    expect(results.length).toBeGreaterThan(3);
    const tier = matchTier(results[0]!, "arrow");
    const same = results.filter((r) => matchTier(r, "arrow") === tier);
    const last = same[same.length - 1]!;
    const used = searchPalette("arrow", 200, { use: { [last.item.latex]: 5 } });
    expect(used[0]?.item.latex).toBe(last.item.latex);
    const second = same[same.length - 2]!;
    const fav = searchPalette("arrow", 200, { use: { [last.item.latex]: 5 }, favorites: [second.key] });
    expect(fav[0]?.item.latex).toBe(second.item.latex);
    expect(fav[1]?.item.latex).toBe(last.item.latex);
  });

  it("one result per LaTeX", () => {
    const r = searchPalette("vector", 500);
    expect(new Set(r.map((x) => x.item.latex)).size).toBe(r.length);
    expect(findItem(r[0]!.key)).toBeTruthy();
  });
});
