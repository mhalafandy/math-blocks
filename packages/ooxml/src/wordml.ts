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

export interface PictureOptions {
  /** Relationship id of the PNG fallback (required by Word for SVG pictures). */
  pngRId: string;
  /** Relationship id of the SVG (Word 2016+ draws this one). */
  svgRId?: string;
  widthPt: number;
  heightPt: number;
  /** Lowers the picture so its math baseline sits on the text baseline. */
  depthPt?: number;
  /** Unique drawing id within the document. */
  id: number;
  name: string;
  /** Alt text (accessibility; we also keep the LaTeX source here). */
  description?: string;
}

const EMU_PER_PT = 12700;

/** An inline picture run (DrawingML), optionally SVG with PNG fallback. */
export function pictureRun(o: PictureOptions): string {
  const cx = Math.round(o.widthPt * EMU_PER_PT);
  const cy = Math.round(o.heightPt * EMU_PER_PT);
  const svgExt = o.svgRId
    ? `<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${o.svgRId}"/></a:ext></a:extLst>`
    : "";
  const position = o.depthPt ? `<w:rPr><w:position w:val="${-Math.round(o.depthPt * 2)}"/></w:rPr>` : "";
  return (
    `<w:r>${position}<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${o.id}" name="${escapeXml(o.name)}"${o.description ? ` descr="${escapeXml(o.description)}"` : ""}/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${o.id}" name="${escapeXml(o.name)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${o.pngRId}">${svgExt}</a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

/** A centred paragraph (display equations rendered as pictures). */
export const centeredParagraph = (content: string) => `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${content}</w:p>`;

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
