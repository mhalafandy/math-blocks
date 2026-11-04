import { describe, expect, it } from "vitest";
import { addDerivationLine } from "./derivation";

describe("derivation lines", () => {
  it("turns an equation into a two-line derivation", () => {
    expect(addDerivationLine("T=\\frac{1}{2}m v^{2}")).toBe("\\begin{aligned} T & =\\frac{1}{2}mv^2 \\\\  & =\\frac{1}{2}mv^2 \\end{aligned}");
  });

  it("adds a line copying the last right-hand side", () => {
    const edited = "\\begin{aligned} a & =b+c \\\\  & =d \\end{aligned}";
    expect(addDerivationLine(edited)).toBe("\\begin{aligned} a & =b+c \\\\  & =d \\\\  & =d \\end{aligned}");
  });

  it("needs a relation", () => {
    expect(addDerivationLine("x+y")).toBeNull();
  });
});
