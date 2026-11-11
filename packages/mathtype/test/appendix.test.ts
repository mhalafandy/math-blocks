import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { writeCfb } from "@mathblocks/ooxml";
import { convertDocx, readCfb } from "../src";

/**
 * Convert MathType on a local document (path from the environment, never committed;
 * numbered paragraphs styled MTDisplayEquation): only the MathType objects may change —
 * every paragraph's properties (style, tabs, spacing…) must be byte-identical afterwards.
 */
const FILE = new URL("../../../a local MathType document", import.meta.url);
const paragraphs = (xml: string) => [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((m) => m[0]);
const pPr = (p: string) => /^<w:p\b[^>]*>(<w:pPr>[\s\S]*?<\/w:pPr>)?/.exec(p)![1] ?? "";

const present = existsSync(FILE);

describe.skipIf(!present)("Convert MathType on a local document", () => {
  // Read only when the fixture is there (a skipped describe still runs its body when collected).
  if (!present) return;
  const input = new Uint8Array(readFileSync(FILE));
  const before = strFromU8(unzipSync(input)["word/document.xml"]!);
  const plan = convertDocx(input);
  const tags = plan.equations.map((e) => e.tag);
  const out = convertDocx(input, {
    tags,
    picture: (latex, _d, tag) => ({
      emf: new Uint8Array([1, 2, 3, 4]),
      svg: "<svg/>",
      png: new Uint8Array(),
      widthPt: 20,
      heightPt: 14,
      depthPt: 4,
      object: writeCfb({ MathBlocks: new TextEncoder().encode(JSON.stringify({ version: 1, latex, tag })) }),
    }),
  });
  const files = unzipSync(out.docx);
  const after = strFromU8(files["word/document.xml"]!);

  it("converts every MathType equation to a MathBlocks object", () => {
    expect(plan.converted).toBeGreaterThan(100);
    expect(after).not.toContain('ProgID="Equation.DSMT4"');
    expect(after.match(/ProgID="MathBlocks\.Equation\.1"/g)?.length).toBe(out.converted);
  });

  it("keeps every paragraph's properties byte-identical", () => {
    const a = paragraphs(before);
    const b = paragraphs(after);
    expect(b.length).toBe(a.length);
    const changed = a.map((p, i) => [i, pPr(p), pPr(b[i]!)] as const).filter(([, x, y]) => x !== y);
    expect(changed.slice(0, 3)).toEqual([]);
  });

  it("keeps the number of MTDisplayEquation paragraphs", () => {
    const count = (xml: string) => (xml.match(/<w:pStyle w:val="MTDisplayEquation"\/>/g) ?? []).length;
    expect(count(after)).toBe(count(before));
    expect(count(before)).toBeGreaterThan(30);
  });

  it("keeps MathType's numbers and bookmarks around each equation", () => {
    const count = (xml: string, re: RegExp) => (xml.match(re) ?? []).length;
    expect(count(after, /MACROBUTTON MTPlaceRef/g)).toBe(count(before, /MACROBUTTON MTPlaceRef/g));
    expect(count(after, /w:name="ZEqnNum\d+"/g)).toBe(count(before, /w:name="ZEqnNum\d+"/g));
  });

  it("each object's own data holds its ID", () => {
    const bins = Object.keys(files).filter((f) => /^word\/embeddings\/mathblocks-.*\.bin$/.test(f));
    expect(bins.length).toBe(out.converted);
    const t = JSON.parse(new TextDecoder().decode(readCfb(files[bins[0]!]!).get("MathBlocks")!.data)).tag;
    expect(tags).toContain(t);
  });
});
