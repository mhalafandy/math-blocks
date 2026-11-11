/**
 * Test helpers that build MathType data by hand: MTEF records, an OLE compound file holding
 * them, and a small .docx with the equation embedded the way MathType does it.
 */
import { strToU8, zipSync } from "fflate";

// ------------------------------------------------------------------ MTEF records

// The MTEF builders live in the package (synthetic MathType data for tests and the self-test).
export { tf, line, nullLine, ch, v, tmpl, pile, matrix, mtef } from "../src/synthetic";

// ------------------------------------------------------------------ OLE compound file

/** A minimal compound file with one stream per entry (all in regular 512-byte sectors). */
export function cfb(streams: Record<string, Uint8Array>): Uint8Array {
  const S = 512;
  const names = Object.keys(streams);
  const sectorsOf = (n: number) => Math.max(1, Math.ceil(n / S));
  const dirSectors = Math.ceil(((names.length + 1) * 128) / S);
  let next = 1 + dirSectors; // sector 0 = FAT
  const starts = names.map((n) => {
    const s = next;
    next += sectorsOf(streams[n]!.length);
    return s;
  });
  const total = next;
  if (total > 128) throw new Error("test cfb too large");
  const buf = new Uint8Array(S * (total + 1));
  const dv = new DataView(buf.buffer);
  buf.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  dv.setUint16(0x18, 0x3e, true);
  dv.setUint16(0x1a, 3, true);
  dv.setUint16(0x1c, 0xfffe, true);
  dv.setUint16(0x1e, 9, true);
  dv.setUint16(0x20, 6, true);
  dv.setUint32(0x2c, 1, true);
  dv.setUint32(0x30, 1, true);
  dv.setUint32(0x38, 0, true); // mini stream cutoff 0: every stream in regular sectors
  dv.setUint32(0x3c, 0xfffffffe, true);
  dv.setUint32(0x44, 0xfffffffe, true);
  for (let i = 0; i < 109; i++) dv.setUint32(0x4c + i * 4, i === 0 ? 0 : 0xffffffff, true);
  const sec = (n: number) => (n + 1) * S;
  // FAT
  const fat = new Array(S / 4).fill(0xffffffff);
  fat[0] = 0xfffffffd;
  for (let i = 0; i < dirSectors; i++) fat[1 + i] = i === dirSectors - 1 ? 0xfffffffe : 2 + i;
  names.forEach((n, k) => {
    const c = sectorsOf(streams[n]!.length);
    for (let i = 0; i < c; i++) fat[starts[k]! + i] = i === c - 1 ? 0xfffffffe : starts[k]! + i + 1;
  });
  fat.forEach((x, i) => dv.setUint32(sec(0) + i * 4, x, true));
  // Directory
  const entry = (i: number, name: string, type: number, start: number, size: number) => {
    const o = sec(1) + i * 128;
    for (let j = 0; j < name.length; j++) dv.setUint16(o + j * 2, name.charCodeAt(j), true);
    dv.setUint16(o + 0x40, (name.length + 1) * 2, true);
    buf[o + 0x42] = type;
    dv.setUint32(o + 0x44, 0xffffffff, true);
    dv.setUint32(o + 0x48, 0xffffffff, true);
    dv.setUint32(o + 0x4c, type === 5 && names.length ? 1 : 0xffffffff, true);
    dv.setUint32(o + 0x74, start, true);
    dv.setUint32(o + 0x78, size, true);
  };
  entry(0, "Root Entry", 5, 0xfffffffe, 0);
  names.forEach((n, k) => {
    entry(k + 1, n, 2, starts[k]!, streams[n]!.length);
    buf.set(streams[n]!, sec(starts[k]!));
  });
  return buf;
}

/** The OLE object MathType embeds: "Equation Native" = 28-byte header + MTEF. */
export function mathTypeObject(mtefBytes: Uint8Array): Uint8Array {
  const header = new Uint8Array(28);
  header[0] = 28;
  new DataView(header.buffer).setUint32(8, mtefBytes.length, true);
  const native = new Uint8Array(28 + mtefBytes.length);
  native.set(header);
  native.set(mtefBytes, 28);
  return cfb({ "\u0001CompObj": strToU8("MathType 7.0 Equation"), "Equation Native": native });
}

// ------------------------------------------------------------------ .docx

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"';

/** A MathType object run as Word stores it. */
export const objectRun = (n: number) =>
  `<w:r><w:rPr><w:position w:val="-12"/></w:rPr><w:object w:dxaOrig="1120" w:dyaOrig="620"><v:shape id="_x0000_i${n}" type="#_x0000_t75" style="width:55pt;height:31pt" o:ole=""><v:imagedata r:id="rIdImg${n}" o:title=""/></v:shape><o:OLEObject Type="Embed" ProgID="Equation.DSMT4" ShapeID="_x0000_i${n}" DrawAspect="Content" ObjectID="_${n}" r:id="rIdOle${n}"/></w:object></w:r>`;

/** Display paragraph with a MathType number field: tab, equation, tab, (1). */
export const numberedParagraph = (n: number, num: string) =>
  `<w:p><w:pPr><w:pStyle w:val="MTDisplayEquation"/></w:pPr><w:r><w:tab/></w:r>${objectRun(n)}<w:r><w:tab/></w:r><w:bookmarkStart w:id="${n}" w:name="ZEqnNum${n}"/><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> MACROBUTTON MTPlaceRef \\* MERGEFORMAT </w:instrText></w:r><w:r><w:instrText>(${num})</w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:bookmarkEnd w:id="${n}"/></w:p>`;

export function docx(paragraphs: string[], objects: Uint8Array[]): Uint8Array {
  const rels = objects
    .map((_, i) => `<Relationship Id="rIdOle${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="embeddings/oleObject${i + 1}.bin"/><Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${i + 1}.wmf"/>`)
    .join("");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="bin" ContentType="application/vnd.openxmlformats-officedocument.oleObject"/><Default Extension="wmf" ContentType="image/x-wmf"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${paragraphs.join("")}</w:body></w:document>`),
    "word/_rels/document.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`),
  };
  objects.forEach((o, i) => {
    files[`word/embeddings/oleObject${i + 1}.bin`] = o;
    files[`word/media/image${i + 1}.wmf`] = new Uint8Array([1, 2, 3]);
  });
  return zipSync(files);
}
