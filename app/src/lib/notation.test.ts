import { describe, expect, it } from "vitest";
import { CATALOG, changeForm, findForms, findInconsistencies, formLabel } from "./notation";

const key = (label: string) => CATALOG.find((f) => f.label.startsWith(label))!.key;

describe("notation forms", () => {
  it("recognises the catalogue's forms", () => {
    expect(new Set(CATALOG.map((f) => f.key)).size).toBeGreaterThanOrEqual(CATALOG.length - 1); // "Bold" is in two groups
    expect(key("Arrow")).toBe("vec|");
    expect(key("Bold with arrow")).toBe("vec|bold");
    expect(key("Double bar")).toBe("bar|bar|");
    expect(key("Double arrow  ")).toBe("over:↔|");
  });

  it("lists the forms a document uses, with their letters", () => {
    const forms = findForms(["\\vec{r}=\\vec{v}t+\\mathbf{c}_{sf}", "\\vec{r}\\cdot\\bar{\\bar{I}}", "x^2"]);
    expect(forms.map((f) => [formLabel(f.key), f.count, [...f.letters.keys()].join(",")])).toEqual([
      ["Arrow", 3, "r,v"],
      ["Bold", 1, "c"],
      ["Double bar", 1, "I"],
    ]);
  });

  it("changes one form everywhere, keeping scripts and powers", () => {
    expect(changeForm("\\vec{r}_i=\\vec{v}^2+x", key("Arrow"), "\\overrightharpoon{\\mathbf{X}}")).toBe("\\overrightharpoon{\\mathbf{r}}_i=\\overrightharpoon{\\mathbf{v}}^2+x");
    expect(changeForm("\\bar{\\bar{I}}\\cdot\\vec{\\omega}", key("Double bar"), "\\overset{\\leftrightarrow}{\\mathbf{X}}")).toBe("\\overset{\\leftrightarrow}{\\mathbf{I}}\\cdot\\vec{\\omega}");
  });

  it("only the chosen letters; Greek letters get bold italic", () => {
    expect(changeForm("\\mathbf{r}+\\mathbf{A}", key("Bold  𝐫"), "\\vec{X}", new Set(["r"]))).toBe("\\vec{r}+\\mathbf{A}");
    expect(changeForm("\\vec{\\omega}", key("Arrow"), "\\mathbf{X}")).toBe("\\boldsymbol{\\omega}");
  });

  it("finds letters written in two notations", () => {
    const inc = findInconsistencies(["\\vec{r}+\\vec{r}_i", "\\mathbf{r}\\cdot\\vec{v}", "r=|\\vec{r}|"]);
    expect(inc).toEqual([{ letter: "r", forms: [{ key: "vec|", count: 3 }, { key: "bold", count: 1 }] }]);
  });
});

describe("transposes and style mixes", async () => {
  const { transposeForms, changeTranspose, findStyleMixes } = await import("./notation");
  const thesis = ["\\vec{\\mathbf{S}}^{\\mathbf{T}}\\mathbf{c}_1", "\\begin{bmatrix}0&0&0\\end{bmatrix}^{T}", "\\hat{s}_{2}", "\\hat{s}_{3}", "\\hat{\\mathbf{b}}_{1}", "\\mathbf{r}^{\\mathbf{T}}"];

  it("counts the transpose forms (Appendix A: bold T, one plain T)", () => {
    expect(Object.fromEntries(transposeForms(thesis))).toEqual({ bold: 2, italic: 1 });
  });

  it("converts every transpose to one form", () => {
    expect(changeTranspose("\\mathbf{A}^{\\mathbf{T}}\\mathbf{x}^T", "upright")).toBe("\\mathbf{A}^{\\mathrm{T}}\\mathbf{x}^{\\mathrm{T}}");
    expect(changeTranspose("\\mathbf{A}^{-\\mathbf{T}}", "upright")).toBe("\\mathbf{A}^{-\\mathrm{T}}");
    expect(changeTranspose("\\mathbf{A}^{\\mathrm{T}}", "upright")).toBe("\\mathbf{A}^{\\mathrm{T}}");
    expect(changeTranspose("x^2", "bold")).toBe("x^2");
  });

  it("reports plain and bold unit vectors, and mixed transposes, without changing anything", () => {
    const mixes = findStyleMixes(thesis);
    const hat = mixes.find((m) => m.what.startsWith("Unit vectors"))!;
    expect(hat.styles.map((s) => [s.label, s.count, s.letters.join("")])).toEqual([["plain", 2, "s"], ["bold", 1, "b"]]);
    expect(mixes.find((m) => m.what === "Transpose")?.styles.map((s) => s.label)).toEqual(["bold T", "italic T"]);
  });
});
