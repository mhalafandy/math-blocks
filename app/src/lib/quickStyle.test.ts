import { describe, expect, it } from "vitest";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { toggledAccent, toggledUpright } from "./quickStyle";

const norm = (l: string) => serializeLatex(parseLatex(l).root);

describe("quick-style bar actions", () => {
  it("accents go on, and come off when the same accent is pressed again", () => {
    expect(norm(toggledAccent("r", "overrightharpoon"))).toBe(norm("\\overrightharpoon{r}"));
    expect(norm(toggledAccent("\\overrightharpoon{r}", "overrightharpoon"))).toBe("r");
    expect(norm(toggledAccent("\\hat{x}", "dot"))).toBe(norm("\\dot{\\hat{x}}"));
    expect(norm(toggledAccent("\\vec{F}", "vec"))).toBe("F");
  });

  it("italic ↔ upright on the letters; bold stays bold", () => {
    expect(norm(toggledUpright("d"))).toBe(norm("\\mathrm{d}"));
    expect(norm(toggledUpright("\\mathrm{d}"))).toBe("d");
    expect(norm(toggledUpright("\\mathbf{r}+x"))).toBe(norm("\\mathbf{r}+\\mathrm{x}"));
  });
});
