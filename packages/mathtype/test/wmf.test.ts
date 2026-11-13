import { describe, expect, it } from "vitest";
import { readWmf, writeWmf } from "../src";

describe("WMF (MathType's preview pictures)", () => {
  it("reads the placeable header, polygons and text records with their font", () => {
    const wmf = writeWmf({
      bounds: { left: 0, top: 0, right: 400, bottom: 240 },
      polys: [[[[10, 10], [60, 10], [60, 20], [10, 20]]]],
      texts: [{ x: 100, y: 180, text: "ab", face: "Times New Roman", height: 240, italic: true }],
    });
    const r = readWmf(wmf);
    expect(r.bounds).toEqual({ left: 0, top: 0, right: 400, bottom: 240 });
    expect(r.inch).toBe(1440);
    expect(r.window).toEqual({ x: 0, y: 0, w: 400, h: 240 });
    const poly = r.ops.find((o) => o.k === "poly");
    expect(poly && poly.k === "poly" && poly.rings[0]).toEqual([[10, 10], [60, 10], [60, 20], [10, 20]]);
    const text = r.ops.find((o) => o.k === "text");
    expect(text && text.k === "text" && { x: text.x, y: text.y, codes: text.codes, face: text.font.face, height: text.font.height, italic: text.font.italic, align: text.align }).toEqual({ x: 100, y: 180, codes: [97, 98], face: "Times New Roman", height: -240, italic: true, align: 24 });
  });
});
