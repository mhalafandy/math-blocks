import { strToU8, zipSync } from "fflate";
import { NS_M, NS_W, escapeXml } from "@mathblocks/math-omml";
import { documentXml } from "./wordml";

export interface CustomXmlPart {
  /** Root namespace, also registered as the part's schema reference. */
  namespace: string;
  xml: string;
}

/** A file in word/media, referenced from document.xml as r:embed="<rId>". */
export interface MediaPart {
  rId: string;
  /** File name inside word/media/, e.g. "eq1.svg". */
  name: string;
  data: Uint8Array;
}

export interface DocxOptions {
  paragraphs: string[];
  media?: MediaPart[];
  /** Document-wide math font (m:mathFont). Runs written by toOmml also carry the font. */
  mathFont?: string;
  /** Body text font. */
  bodyFont?: string;
  customXml?: CustomXmlPart[];
}

/** Builds a minimal, valid .docx package (Word 2013+ compatibility mode). */
export function buildDocx(o: DocxOptions): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const add = (path: string, content: string) => (files[path] = strToU8(content));
  const parts = o.customXml ?? [];

  add(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Default Extension="png" ContentType="image/png"/>` +
      `<Default Extension="svg" ContentType="image/svg+xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
      `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>` +
      parts
        .map((_, i) => `<Override PartName="/customXml/itemProps${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/>`)
        .join("") +
      `</Types>`,
  );

  add(
    "_rels/.rels",
    rels([["rId1", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument", "word/document.xml"]]),
  );

  add(
    "word/_rels/document.xml.rels",
    rels([
      ["rId1", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles", "styles.xml"],
      ["rId2", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings", "settings.xml"],
      ...parts.map((_, i): [string, string, string] => [
        `rId${i + 10}`,
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml",
        `../customXml/item${i + 1}.xml`,
      ]),
      ...(o.media ?? []).map((m): [string, string, string] => [
        m.rId,
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
        `media/${m.name}`,
      ]),
    ]),
  );

  add("word/document.xml", documentXml(o.paragraphs));
  for (const m of o.media ?? []) files[`word/media/${m.name}`] = m.data;
  add("word/styles.xml", stylesXml(o.bodyFont ?? "Calibri"));
  add("word/settings.xml", settingsXml(o.mathFont ?? "Cambria Math"));

  parts.forEach((p, i) => {
    const n = i + 1;
    add(`customXml/item${n}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${p.xml}`);
    add(
      `customXml/itemProps${n}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="no"?>` +
        `<ds:datastoreItem ds:itemID="${guid()}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml">` +
        `<ds:schemaRefs><ds:schemaRef ds:uri="${escapeXml(p.namespace)}"/></ds:schemaRefs></ds:datastoreItem>`,
    );
    add(
      `customXml/_rels/item${n}.xml.rels`,
      rels([["rId1", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps", `itemProps${n}.xml`]]),
    );
  });

  return zipSync(files, { level: 6 });
}

function rels(list: [string, string, string][]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`).join("") +
    `</Relationships>`
  );
}

function settingsXml(mathFont: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:settings xmlns:w="${NS_W}" xmlns:m="${NS_M}">` +
    `<w:defaultTabStop w:val="720"/>` +
    `<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>` +
    `<m:mathPr><m:mathFont m:val="${escapeXml(mathFont)}"/><m:brkBin m:val="before"/><m:brkBinSub m:val="--"/>` +
    `<m:smallFrac m:val="0"/><m:dispDef/><m:lMargin m:val="0"/><m:rMargin m:val="0"/><m:defJc m:val="centerGroup"/>` +
    `<m:wrapIndent m:val="1440"/><m:intLim m:val="subSup"/><m:naryLim m:val="undOvr"/></m:mathPr>` +
    `</w:settings>`
  );
}

function stylesXml(font: string): string {
  const f = escapeXml(font);
  const headingStyle = (id: string, name: string, size: number, before: number) =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:spacing w:before="${before}" w:after="120"/><w:outlineLvl w:val="${id === "Heading1" ? 0 : 1}"/></w:pPr>` +
    `<w:rPr><w:b/><w:color w:val="1F3864"/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:styles xmlns:w="${NS_W}">` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
    headingStyle("Heading1", "heading 1", 32, 360) +
    headingStyle("Heading2", "heading 2", 24, 240) +
    `</w:styles>`
  );
}

function guid(): string {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `{${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}}`;
}
