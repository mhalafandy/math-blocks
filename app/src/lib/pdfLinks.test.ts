import { describe, expect, it } from "vitest";
import { checkLinks, findNumber, type PdfText } from "./pdfLinks";

describe("reference links in the PDF (checks)", () => {
  const texts: PdfText[] = [
    { page: 2, str: "(1.", x: 500, y: 400 },
    { page: 2, str: "2)", x: 512, y: 400 },
    { page: 3, str: "(1.3)", x: 500, y: 600 },
  ];
  it("finds a number split into pieces by Word", () => {
    expect(findNumber(texts, "(1.2)")).toMatchObject({ page: 2, y: 400 });
    expect(findNumber(texts, "(9.9)")).toBeNull();
  });
  it("a link lands on the equation's page, at or above its top", () => {
    const r = checkLinks(
      [
        { page: 1, destPage: 2, destY: 460 },
        { page: 1, destPage: 3, destY: 610 },
      ],
      texts,
      [
        { number: "(1.2)", aboveBaselinePt: 50 },
        { number: "(1.3)", aboveBaselinePt: 40 },
      ],
    );
    expect(r[0]).toMatchObject({ onPage: true, topInView: true, equationTop: 450 });
    // The tall second equation's top (640) is above the link's height (610): only the number line would show.
    expect(r[1]).toMatchObject({ onPage: true, topInView: false });
  });
});
