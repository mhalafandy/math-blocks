import { escapeXml, NS_M, NS_W } from "@mathblocks/math-omml";

export const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** Content-control lock modes (w:lock). */
export type SdtLock = "unlocked" | "sdtLocked" | "contentLocked" | "sdtContentLocked";

export interface ContentControlOptions {
  /** Machine-readable tag (see ids.ts). */
  tag: string;
  /** Human-readable title shown on the control's label in Word. */
  title?: string;
  lock?: SdtLock;
  /** Numeric w:id; random when omitted. */
  id?: number;
}

/** Wraps run-level content (e.g. <m:oMath> or <m:oMathPara>) in an inline content control. */
export function contentControl(inner: string, o: ContentControlOptions): string {
  const id = o.id ?? Math.floor(Math.random() * 2_000_000_000) + 1;
  const pr = [
    o.title ? `<w:alias w:val="${escapeXml(o.title)}"/>` : "",
    `<w:tag w:val="${escapeXml(o.tag)}"/>`,
    `<w:id w:val="${id}"/>`,
    o.lock && o.lock !== "unlocked" ? `<w:lock w:val="${o.lock}"/>` : "",
  ].join("");
  return `<w:sdt><w:sdtPr>${pr}</w:sdtPr><w:sdtContent>${inner}</w:sdtContent></w:sdt>`;
}

export interface RunStyle {
  bold?: boolean;
  italic?: boolean;
  font?: string;
  /** Half-points, e.g. 20 = 10pt. */
  size?: number;
  color?: string;
}

export function textRun(text: string, s: RunStyle = {}): string {
  const pr = [
    s.font ? `<w:rFonts w:ascii="${escapeXml(s.font)}" w:hAnsi="${escapeXml(s.font)}"/>` : "",
    s.bold ? "<w:b/>" : "",
    s.italic ? "<w:i/>" : "",
    s.color ? `<w:color w:val="${s.color}"/>` : "",
    s.size ? `<w:sz w:val="${s.size}"/>` : "",
  ].join("");
  return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

/** A paragraph from run-level content; `style` is a paragraph style id such as "Heading1". */
export function paragraph(content: string, style?: string): string {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${pPr}${content}</w:p>`;
}

export const heading = (text: string, level: 1 | 2 = 1) => paragraph(textRun(text), `Heading${level}`);

/** Document body wrapped in <w:document>, with A4 page settings. */
export function documentXml(bodyParagraphs: string[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${NS_W}" xmlns:m="${NS_M}" xmlns:r="${NS_R}"><w:body>` +
    bodyParagraphs.join("") +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>` +
    `</w:body></w:document>`
  );
}

/**
 * Flat OPC package for Word's Range.InsertXML (COM) or insertOoxml (Office.js).
 * Both APIs require a full package, not a bare fragment.
 */
export function flatOpc(bodyParagraphs: string[]): string {
  const doc = documentXml(bodyParagraphs).replace(/^<\?xml[^>]*\?>/, "");
  return (
    `<?xml version="1.0" standalone="yes"?><?mso-application progid="Word.Document"?>` +
    `<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage">` +
    `<pkg:part pkg:name="/_rels/.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml"><pkg:xmlData>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships></pkg:xmlData></pkg:part>` +
    `<pkg:part pkg:name="/word/document.xml" pkg:contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"><pkg:xmlData>` +
    doc +
    `</pkg:xmlData></pkg:part></pkg:package>`
  );
}
