import { describe, expect, it } from "vitest";
import { largeOperatorFont } from "@mathblocks/math-core";
import { userDefaultStyle } from "./docStyle";
import { useApp } from "./store";

describe("the default style for new documents: large operators", () => {
  it("starts with STIX Two Math, contour integrals from XITS Math", () => {
    useApp.setState({ defaultStyle: undefined });
    const s = userDefaultStyle();
    expect(largeOperatorFont(s, "∫")).toBe("stix-two");
    expect(largeOperatorFont(s, "∑")).toBe("stix-two");
    expect(largeOperatorFont(s, "∮")).toBe("xits");
  });
  it("a document that already has pictures but no stored style keeps the current font (its equations are not made older)", () => {
    useApp.setState({ defaultStyle: undefined });
    const s = userDefaultStyle({ existing: true });
    expect(largeOperatorFont(s, "∫")).toBe("current");
  });
  it("a saved default with its own choice keeps it", () => {
    const own = userDefaultStyle();
    useApp.setState({ defaultStyle: { ...own, global: { ...own.global, largeOperators: "latin-modern", largeOperatorGroups: undefined } } as never });
    expect(largeOperatorFont(userDefaultStyle(), "∮")).toBe("latin-modern");
    useApp.setState({ defaultStyle: undefined });
  });
});
