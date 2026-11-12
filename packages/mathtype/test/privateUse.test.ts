import { describe, expect, it } from "vitest";
import { mtefToLatex, type MtNode } from "../src";
import { MT_PRIVATE_USE } from "../src/mtCodes";

const ch = (code: number, typeface = 3): MtNode => ({ t: "char", typeface, code, embells: [], funcStart: false });
const line = (...items: MtNode[]): MtNode[] => [{ t: "line", isNull: false, items }];

describe("MathType private-use characters (MT Extra)", () => {
  it("are mapped from MathType's character table: the medium dot operator is \\cdot", () => {
    expect(MT_PRIVATE_USE[0xe98f]).toBe("·");
    expect(mtefToLatex(line(ch(0x61), ch(0xe98f, 6), ch(0x62))).latex.replace(/\s+/g, "")).toBe("a\\cdotb");
  });

  it("an unmapped one is kept as it is (the conversion then reports it, it is never passed on silently)", () => {
    const unmapped = 0xe000;
    expect(MT_PRIVATE_USE[unmapped]).toBeUndefined();
    expect(mtefToLatex(line(ch(0x61), ch(unmapped, 6))).latex).toContain(String.fromCodePoint(unmapped));
  });
});

describe("Convert MathType never passes anything on silently", async () => {
  const { convertDocx, mathTypeDocx, mathTypeRun, styledParagraph } = await import("../src");
  const para = (n: number) => `<w:p>${styledParagraph("x").slice(5, -6)}${mathTypeRun(n)}</w:p>`;
  it("converts the private-use dot; an empty equation and an unmapped character stay MathType, each with its reason", () => {
    const docx = mathTypeDocx([para(1), para(2), para(3)], ["dotProduct", "empty", "unmappedPrivate"]);
    const r = convertDocx(docx);
    const [dot, empty, unmapped] = r.equations;
    expect(dot!.status).toBe("converted");
    expect(dot!.latex).toBe("a\\cdot b");
    expect(empty!.status).toBe("skipped");
    expect(empty!.messages.join(" ")).toMatch(/Empty MathType equation/);
    expect(unmapped!.status).toBe("skipped");
    expect(unmapped!.messages.join(" ")).toMatch(/U\+E000.*no LaTeX equivalent/);
    expect(r.converted).toBe(1);
  });
});

describe("worth a look: Greek look-alikes, stray dollar signs, number sets", async () => {
  const { dollarWarnings, lookalikeWarnings } = await import("../src");
  it("a Greek capital that looks like a Latin letter is pointed out", () => {
    expect(lookalikeWarnings("\\boldsymbol{\u0399}")[0]).toMatch(/Greek capital Ι.*Latin letter I/);
    expect(lookalikeWarnings("\\Gamma+x")).toEqual([]);
  });
  it("a “$” touching the equation in the text is pointed out", () => {
    const t = (s: string) => `<w:r><w:t xml:space="preserve">${s}</w:t></w:r>`;
    expect(dollarWarnings(t("see $"), t("$ next"))[0]).toMatch(/both sides/);
    expect(dollarWarnings(t("written as $"), t(" more"))[0]).toMatch(/before it/);
    expect(dollarWarnings(t("costs 5 $ and "), t(" more"))).toEqual([]);
    expect(dollarWarnings(t("see "), t(" next"))).toEqual([]);
  });
  it("double-struck number sets become \\mathbb", () => {
    expect(mtefToLatex(line(ch(0x6b), ch(0x2208, 6), ch(0x2124, 6))).latex.replace(/\s+/g, "")).toBe("k\\in\\mathbb{Z}");
  });
});
