import { describe, expect, it } from "vitest";
import { serializeLatex } from "@mathblocks/math-latex";
import { renderEmf, type RenderResult } from "@mathblocks/math-render";
import { readEquationXml } from "./readEquation";

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
// A tiny drawing is enough: only the comment matters for reading.
const fake = { ops: [], viewW: 100, viewH: 100, widthPt: 10, heightPt: 10, depthPt: 2, svg: "", box: { w: 1, h: 1, d: 0, items: [] } } as unknown as RenderResult;

describe("reading Classic pictures back from Word", () => {
  it("takes the source from the EMF inside the package (alt text may be lost)", () => {
    const emf = renderEmf(fake, { comment: JSON.stringify({ latex: "\\frac{-\\mu}{r^2}", mode: "numbered" }) });
    const xml = `<pkg:package><pkg:part pkg:name="/word/document.xml"><pkg:xmlData><w:document><w:body><w:p><w:sdt><w:sdtContent><w:r><w:pict><v:shape><v:imagedata r:id="rId5"/></v:shape></w:pict></w:r></w:sdtContent></w:sdt></w:p></w:body></w:document></pkg:xmlData></pkg:part><pkg:part pkg:name="/word/media/image1.emf" pkg:contentType="image/x-emf" pkg:compression="store"><pkg:binaryData>${b64(emf).replace(/(.{76})/g, "$1\n")}</pkg:binaryData></pkg:part></pkg:package>`;
    const r = readEquationXml(xml)!;
    expect(r.kind).toBe("picture");
    expect(r.numbered).toBe(true);
    expect(serializeLatex(r.root)).toBe("\\frac{-\\mu}{r^2}");
  });

  it("falls back to the alt text", () => {
    const r = readEquationXml(`<v:shape alt="MathBlocks inline: x^2"/>`)!;
    expect(r.display).toBe(false);
    expect(serializeLatex(r.root)).toBe("x^2");
  });
});
