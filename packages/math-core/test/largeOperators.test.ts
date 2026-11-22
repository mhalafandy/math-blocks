import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE, largeOperatorFont, largeOperatorGroup, NEW_STYLE_LARGE_OPERATORS, normalizeStyle, styleHash, type MathStyle } from "../src";

const withOps = (g: Partial<MathStyle["global"]>): MathStyle => ({ ...DEFAULT_STYLE, global: { ...DEFAULT_STYLE.global, ...g } });

describe("large operators: the font per group (document style)", () => {
  it("groups the operators", () => {
    expect(["∫", "∬", "∮", "∯", "∑", "∏", "⋃"].map(largeOperatorGroup)).toEqual(["integrals", "integrals", "contour", "contour", "sums", "sums", "others"]);
  });
  it("a group's choice wins over the style's, which wins over the current font", () => {
    const s = withOps(NEW_STYLE_LARGE_OPERATORS);
    expect(largeOperatorFont(s, "∫")).toBe("stix-two");
    expect(largeOperatorFont(s, "∮")).toBe("xits");
    expect(largeOperatorFont(s, "∑")).toBe("stix-two");
    expect(largeOperatorFont(DEFAULT_STYLE, "∫")).toBe("current");
  });
  it("a stored style keeps its choice, and one stored without it stays on the current font (never the fallback's)", () => {
    const stored = JSON.parse(JSON.stringify(withOps({ largeOperators: "latin-modern", largeOperatorGroups: { contour: "xits" } })));
    const read = normalizeStyle(stored, withOps(NEW_STYLE_LARGE_OPERATORS));
    expect(read.global.largeOperators).toBe("latin-modern");
    expect(read.global.largeOperatorGroups).toEqual({ contour: "xits" });
    const readOld = normalizeStyle(JSON.parse(JSON.stringify(DEFAULT_STYLE)), withOps(NEW_STYLE_LARGE_OPERATORS));
    expect(largeOperatorFont(readOld, "∫")).toBe("current");
    expect(largeOperatorFont(readOld, "∮")).toBe("current");
  });
  it("unknown fonts and groups are dropped", () => {
    const raw = JSON.parse(JSON.stringify(DEFAULT_STYLE));
    raw.global.largeOperators = "comic";
    raw.global.largeOperatorGroups = { contour: "xits", weird: "xits", sums: "nope" };
    const read = normalizeStyle(raw);
    expect(read.global.largeOperators).toBeUndefined();
    expect(read.global.largeOperatorGroups).toEqual({ contour: "xits" });
  });
  it("the fingerprint is unchanged for the current font, and changes with a group's font", () => {
    expect(styleHash(withOps({ largeOperators: "current" }))).toBe(styleHash(DEFAULT_STYLE));
    expect(styleHash(withOps({ largeOperators: "stix-two" }))).not.toBe(styleHash(DEFAULT_STYLE));
    expect(styleHash(withOps(NEW_STYLE_LARGE_OPERATORS))).not.toBe(styleHash(withOps({ largeOperators: "stix-two" })));
  });
});
