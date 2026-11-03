import { describe, expect, it } from "vitest";
import { parseLatex } from "@mathblocks/math-latex";
import { toOmml, TUNED_PROFILE, WORD_DEFAULT_PROFILE } from "@mathblocks/math-omml";
import { contentOfLatex, contentOfWord, linkOf, planUpdate } from "./linkPlan";

const word = (latex: string, display = true, profile = TUNED_PROFILE) => toOmml(parseLatex(latex).root, { display, profile, standalone: true });
const profiles = [TUNED_PROFILE, WORD_DEFAULT_PROFILE];

describe("linked equation update plan", () => {
  it("updates copies that still show the previous version, keeping inline/display", () => {
    const plan = planUpdate(
      [
        { tag: "a", flatOpc: word("F=ma") },
        { tag: "b", flatOpc: word("F=ma", false) },
      ],
      "F=ma",
      "\\vec{F}=m\\vec{a}",
      profiles,
    );
    expect(plan.update).toEqual([{ tag: "a", display: true, kind: "native" }, { tag: "b", display: false, kind: "native" }]);
    expect(plan.conflicts).toEqual([]);
  });

  it("leaves copies that already show the new version alone", () => {
    const plan = planUpdate([{ tag: "a", flatOpc: word("\\vec{F}=m\\vec{a}") }], "F=ma", "\\vec{F}=m\\vec{a}", profiles);
    expect(plan.unchanged).toEqual(["a"]);
  });

  it("flags copies edited directly in Word as conflicts", () => {
    const plan = planUpdate([{ tag: "a", flatOpc: word("F=2ma") }], "F=ma", "\\vec{F}=m\\vec{a}", profiles);
    expect(plan.conflicts).toEqual([{ tag: "a", display: true, kind: "native" }]);
  });

  it("with no known previous version, updates everything that differs", () => {
    const plan = planUpdate([{ tag: "a", flatOpc: word("anything") }], null, "x", profiles);
    expect(plan.update.map((u) => u.tag)).toEqual(["a"]);
  });

  it("is not fooled by a different style profile (e.g. matrix padding, font)", () => {
    const m = "\\begin{bmatrix} 0 & y & z \\end{bmatrix}^{\\mathbf{T}}";
    expect(contentOfWord(word(m, true, WORD_DEFAULT_PROFILE))!.latex).toBe(contentOfLatex(m, TUNED_PROFILE));
    const plan = planUpdate([{ tag: "a", flatOpc: word(m, true, WORD_DEFAULT_PROFILE) }], m, "x", profiles);
    expect(plan.update.map((u) => u.tag)).toEqual(["a"]);
  });

  it("parses link tags", () => {
    expect(linkOf("mb1|AAAABBBBCCCCDDDD|abcdefghijkl")).toEqual({ blockId: "AAAABBBBCCCCDDDD", instanceId: "abcdefghijkl" });
    expect(linkOf("mb1|-|abcdefghijkl")).toBeNull();
  });
});

describe("Classic pictures in linked updates", () => {
  const pic = (latex: string, display = true) => `<w:sdt><w:sdtContent><w:r><w:drawing><wp:docPr id="1" name="x" descr="MathBlocks ${display ? "display" : "inline"}: ${latex.replace(/&/g, "&amp;")}"/></w:drawing></w:r></w:sdtContent></w:sdt>`;
  it("reads a picture's equation from its alt text and plans the update", () => {
    const plan = planUpdate([{ tag: "p", flatOpc: pic("F=ma", false) }, { tag: "q", flatOpc: pic("F=2ma") }], "F=ma", "F=ma+0", [TUNED_PROFILE]);
    expect(plan.update).toEqual([{ tag: "p", display: false, kind: "picture" }]);
    expect(plan.conflicts.map((c) => c.tag)).toEqual(["q"]);
  });
});
