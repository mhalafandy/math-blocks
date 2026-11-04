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
