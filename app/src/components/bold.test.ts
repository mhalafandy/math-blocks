import { describe, expect, it, vi } from "vitest";

vi.mock("mathlive", () => ({ MathfieldElement: class {} }));
const { toggledBold } = await import("./MathEditor");

describe("bold toggle (Ctrl+Shift+B)", () => {
  it("bolds vectors on the letter, like MathType", () => {
    expect(toggledBold("\\vec{r}")).toBe("\\vec{\\mathbf{r}}");
    expect(toggledBold("\\hat{s}")).toBe("\\hat{\\mathbf{s}}");
    expect(toggledBold("r")).toBe("\\mathbf{r}");
    expect(toggledBold("\\omega")).toBe("\\boldsymbol{\\omega}");
  });
  it("removes bold when everything is bold, otherwise makes everything bold", () => {
    expect(toggledBold("\\vec{\\mathbf{r}}")).toBe("\\vec{r}");
    expect(toggledBold("\\bm{\\vec{r}}")).toBe("\\vec{r}");
    expect(toggledBold("\\mathbf{c}_{sf}+x")).toBe("\\mathbf{c_{sf}+x}");
  });
});
