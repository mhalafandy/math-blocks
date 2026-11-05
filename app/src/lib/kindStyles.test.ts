import { describe, expect, it } from "vitest";
import { makeKindLatex } from "./kindStyles";

describe("Make → kind", () => {
  it("drops styles and accents, keeps a subscript as the frame label", () => {
    expect(makeKindLatex("\\vec{\\mathbf{r}}_{P/O}", "pvec")).toBe("\\pvec[P/O]{r}");
    expect(makeKindLatex("\\boldsymbol{\\omega}", "pvec")).toBe("\\pvec{\\omega}");
    expect(makeKindLatex("\\hat{e}", "uvec")).toBe("\\uvec{e}");
    expect(makeKindLatex("\\mathbf{I}", "dyadic")).toBe("\\dyadic{I}");
    expect(makeKindLatex("", "pvec")).toBe("\\pvec{}");
  });
  it("only kinds with one argument", () => {
    expect(makeKindLatex("C", "dcm")).toBeNull();
  });
});
