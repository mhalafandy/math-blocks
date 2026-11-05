import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { XMLValidator } from "fast-xml-parser";
import { buildDocx, contentControl, flatOpc, formatTag, newBlockId, newInstanceId, paragraph, parseTag, randomId, vmlPictureRun } from "../src";

describe("ids and tags", () => {
  it("generates base62 ids of the requested length", () => {
    for (let i = 0; i < 200; i++) expect(randomId(16)).toMatch(/^[0-9A-Za-z]{16}$/);
    expect(new Set(Array.from({ length: 1000 }, () => newInstanceId())).size).toBe(1000);
  });

  it("formats and parses tags", () => {
    const blockId = newBlockId();
    const instanceId = newInstanceId();
    const tag = formatTag({ blockId, instanceId });
    expect(tag.length).toBeLessThanOrEqual(64);
    expect(parseTag(tag)).toEqual({ version: 1, blockId, instanceId });
    expect(parseTag(formatTag({ blockId: null, instanceId }))).toEqual({ version: 1, blockId: null, instanceId });
  });

  it("ignores foreign tags", () => {
    for (const t of [null, undefined, "", "mb1", "mb2|-|abcdefghijkl", "mb1|-|short", "other control"]) {
      expect(parseTag(t)).toBeNull();
    }
  });
});

describe("WordprocessingML", () => {
  it("content controls carry tag, title and lock", () => {
    const xml = contentControl("<m:oMath/>", { tag: "mb1|-|abcdefghijkl", title: "Newton & co", lock: "contentLocked", id: 7 });
    expect(xml).toBe(
      '<w:sdt><w:sdtPr><w:alias w:val="Newton &amp; co"/><w:tag w:val="mb1|-|abcdefghijkl"/><w:id w:val="7"/><w:lock w:val="contentLocked"/></w:sdtPr><w:sdtContent><m:oMath/></w:sdtContent></w:sdt>',
    );
  });

  it("flat OPC packages are well-formed", () => {
    expect(XMLValidator.validate(flatOpc([paragraph("<m:oMath/>")]))).toBe(true);
  });

  it("builds a .docx with all required parts and custom XML", () => {
    const zip = unzipSync(buildDocx({ paragraphs: [paragraph("")], customXml: [{ namespace: "urn:test", xml: '<r xmlns="urn:test"/>' }] }));
    for (const part of [
      "[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/settings.xml",
      "word/_rels/document.xml.rels", "customXml/item1.xml", "customXml/itemProps1.xml", "customXml/_rels/item1.xml.rels",
    ]) {
      expect(zip[part], part).toBeDefined();
      expect(XMLValidator.validate(strFromU8(zip[part]!)), part).toBe(true);
    }
  });
});

describe("Classic picture identity", () => {
  it("puts the equation ID in the picture title (escaped) next to the alt text", () => {
    const run = vmlPictureRun({ rId: "rId1", widthPt: 10, heightPt: 8, depthPt: 2, id: 5, alt: "MathBlocks display: a<b", title: "mb1|-|abc123DEF456" });
    expect(run).toContain(`title="mb1|-|abc123DEF456"`);
    expect(run).toContain(`alt="MathBlocks display: a&lt;b"`);
    expect(XMLValidator.validate(`<x xmlns:w="w" xmlns:v="v" xmlns:o="o" xmlns:r="r">${run}</x>`)).toBe(true);
    expect(vmlPictureRun({ rId: "rId1", widthPt: 1, heightPt: 1, depthPt: 0, id: 1, alt: "x" })).not.toContain(" title=");
  });
});
