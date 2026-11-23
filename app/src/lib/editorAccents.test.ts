import { describe, expect, it } from "vitest";
import { groupScriptedAccents, ungroupScriptedAccents } from "./editorAccents";

describe("stretchy accents with an index in the editor's form", () => {
  const cases = [
    ["\\overrightharpoon{\\mathbf{r}}_{P/O}\\overrightharpoon{\\mathbf{v}}_{P/O}", "\\mathord{\\overrightharpoon{\\mathbf{r}}}_{P/O}\\mathord{\\overrightharpoon{\\mathbf{v}}}_{P/O}"],
    ["\\overrightarrow{AB}^{2}+\\widehat{xy}_i", "\\mathord{\\overrightarrow{AB}}^{2}+\\mathord{\\widehat{xy}}_i"],
    ["\\class{nk-pvec}{\\overrightharpoon{\\mathbf{r}}_{P/O}}", "\\class{nk-pvec}{\\mathord{\\overrightharpoon{\\mathbf{r}}}_{P/O}}"],
  ];
  it("groups an accent followed by a script, and only then", () => {
    for (const [a, b] of cases) expect(groupScriptedAccents(a!)).toBe(b);
    expect(groupScriptedAccents("\\overrightharpoon{r}+x")).toBe("\\overrightharpoon{r}+x");
    expect(groupScriptedAccents("\\overbrace{a+b}^{n}")).toBe("\\overbrace{a+b}^{n}");
  });
  it("grouping twice changes nothing; ungrouping restores the LaTeX exactly", () => {
    for (const [a, b] of cases) {
      expect(groupScriptedAccents(b!)).toBe(b);
      expect(ungroupScriptedAccents(b!)).toBe(a);
    }
    // A group written by the author around more than the accent stays.
    expect(ungroupScriptedAccents("{\\overrightharpoon{r}x}_{a}")).toBe("{\\overrightharpoon{r}x}_{a}");
    // The plain group of earlier builds is removed too; another command's argument is not.
    expect(ungroupScriptedAccents("{\\overrightharpoon{r}}_{a}=\\mathord{\\widehat{x}}^{2}")).toBe("\\overrightharpoon{r}_{a}=\\widehat{x}^{2}");
    expect(ungroupScriptedAccents("\\mathbf{\\overrightharpoon{r}}_{a}")).toBe("\\mathbf{\\overrightharpoon{r}}_{a}");
  });
});

describe("a command's argument is not a group", () => {
  it("leaves \\class{…}{\\overrightharpoon{…}}_{…} alone", () => {
    expect(ungroupScriptedAccents("\\class{nk-pvec}{\\overrightharpoon{\\mathbf{a}}}_{2}")).toBe("\\class{nk-pvec}{\\overrightharpoon{\\mathbf{a}}}_{2}");
    expect(ungroupScriptedAccents("a^{2}{\\overrightharpoon{r}}_{1}")).toBe("a^{2}\\overrightharpoon{r}_{1}");
  });
});
