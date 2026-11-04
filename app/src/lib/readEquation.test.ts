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

describe("pasted pictures without their content control (Bug 1)", () => {
  const pkg = (emf: Uint8Array, alt = "") =>
    `<pkg:package><pkg:part pkg:name="/word/document.xml"><pkg:xmlData><w:document><w:body><w:p><w:r><w:pict><v:shape${alt ? ` alt="${alt}"` : ""}><v:imagedata r:id="rId5"/></v:shape></w:pict></w:r></w:p></w:body></w:document></pkg:xmlData></pkg:part><pkg:part pkg:name="/word/media/image9.emf" pkg:contentType="image/x-emf"><pkg:binaryData>${b64(emf)}</pkg:binaryData></pkg:part></pkg:package>`;

  it("a bare picture with the EMF comment is still a MathBlocks equation, kinds included", () => {
    const emf = renderEmf(fake, { comment: JSON.stringify({ latex: "\\pvec[P/O]{r}=\\dcm{b}{a}\\cmat{c}", mode: "display", block: "AbCdEfGhIjKlMnOp" }) });
    const r = readEquationXml(pkg(emf))!;
    expect(r.kind).toBe("picture");
    expect(serializeLatex(r.root)).toBe("\\pvec[P/O]{r}=\\dcm{b}{a}\\cmat{c}");
  });

  it("only the alt text survived (the EMF was re-encoded by a paste mode)", () => {
    const r = readEquationXml(pkg(new Uint8Array([1, 0, 0, 0, 8, 0, 0, 0]), "MathBlocks display: a\\cdot b"))!;
    expect(serializeLatex(r.root)).toBe("a\\cdot b");
  });

  it("a picture without MathBlocks data is not taken for an equation", () => {
    expect(readEquationXml(pkg(new Uint8Array([1, 0, 0, 0, 8, 0, 0, 0])))).toBeNull();
  });
});
