import { describe, expect, it } from "vitest";
import { parseRegistry, serializeRegistry } from "../src";

describe("document registry", () => {
  it("round-trips blocks, escaping LaTeX and names", () => {
    const reg = parseRegistry(null);
    reg.blocks.AbC = { id: "AbC", name: "Newton & co <2nd>", version: 3, latex: "\\vec{F}=m\\vec{a} & x<y", display: false };
    const back = parseRegistry(serializeRegistry(reg));
    expect(back).toEqual(reg);
  });

  it("never throws on missing or broken XML", () => {
    expect(Object.keys(parseRegistry("").blocks)).toEqual([]);
    expect(Object.keys(parseRegistry("<not xml").blocks)).toEqual([]);
    expect(Object.keys(parseRegistry("<other/>").blocks)).toEqual([]);
  });

  it("reads the M1 spike format (blocks nested in <mb:blocks>)", () => {
    const xml = '<mb:registry xmlns:mb="urn:mathblocks:registry:v1" docId="D1"><mb:blocks><mb:block id="B" name="N" version="1"><mb:latex>x</mb:latex></mb:block></mb:blocks></mb:registry>';
    expect(parseRegistry(xml)).toEqual({ docId: "D1", blocks: { B: { id: "B", name: "N", version: 1, latex: "x", display: true } } });
  });
});
