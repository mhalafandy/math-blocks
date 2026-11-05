/**
 * Converts the MathType equations of a .docx into native Word equations (OMML) wrapped in
 * MathBlocks content controls. Everything else in the document is left byte-for-byte as it was:
 * paragraph layout (MTDisplayEquation tabs), equation numbers (SEQ MTEqn fields), bookmarks and
 * cross-references (REF / GOTOBUTTON) keep working.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Unzipped } from "fflate";
import { parseLatex } from "@mathblocks/math-latex";
import { toOmml, TUNED_PROFILE, type StyleProfile } from "@mathblocks/math-omml";
import { formatTag, newInstanceId, pictureRun, vmlPictureRun } from "@mathblocks/ooxml";
import { readCfb } from "./cfb";
import { readMtef } from "./mtef";
import { mtefToLatex } from "./toLatex";

export interface ConvertOptions {
  profile?: StyleProfile;
  /**
   * Picture mode: equations become MathBlocks pictures (SVG with a PNG fallback) instead of
   * native Word equations. Returns null to fall back to a native equation.
   */
  picture?: (latex: string, display: boolean) => PictureData | null;
}

export interface PictureData {
  /** Vector picture (EMF) with the source inside: placed as a classic VML picture, like MathType. */
  emf?: Uint8Array;
  svg: string;
  png: Uint8Array;
  widthPt: number;
  heightPt: number;
  /** How far the picture reaches below the text baseline. */
  depthPt: number;
}

interface MediaOut {
  part: string;
  svgId: string;
  pngId: string;
  name: string;
  data: PictureData;
}

export interface ConvertedEquation {
  /** 1-based position in the document (in reading order of each part). */
  index: number;
  part: string;
  display: boolean;
  /** Equation number shown next to it, e.g. "(A.1)", when there is one. */
  number: string | null;
  latex: string | null;
  status: "converted" | "skipped";
  /** Why the equation was skipped, or what may need a look. */
  messages: string[];
  /** Content-control tag of the new MathBlocks equation. */
  tag?: string;
}

export interface ConvertResult {
  docx: Uint8Array;
  equations: ConvertedEquation[];
  converted: number;
  skipped: number;
}

const MATHTYPE_PROGID = /^Equation\.(DSMT\d*|3)$/;
/** Temporary marker in front of each new content control, removed before saving. */
const MARK = "<!--mb-converted-->";
const W15 = "http://schemas.microsoft.com/office/word/2012/wordml";

/** Converts one MathType OLE object (the .bin embedding) to LaTeX. */
export function mathTypeObjectToLatex(ole: Uint8Array): { latex: string; warnings: string[] } {
  const native = readCfb(ole).get("Equation Native");
  if (!native) throw new Error("Not a MathType equation (no \"Equation Native\" stream)");
  const d = native.data;
  const headerSize = d[0]! | (d[1]! << 8);
  const eq = readMtef(d.subarray(headerSize));
  return mtefToLatex(eq.items);
}

export function convertDocx(input: Uint8Array, options: ConvertOptions = {}): ConvertResult {
  const profile = options.profile ?? TUNED_PROFILE;
  const zip = unzipSync(input);
  const equations: ConvertedEquation[] = [];
  const removedRels = new Map<string, Set<string>>();
  const media: MediaOut[] = [];

  const parts = Object.keys(zip).filter((n) => /^word\/(document|footnotes|endnotes|header\d*|footer\d*)\.xml$/.test(n));
  parts.sort((a, b) => (a === "word/document.xml" ? -1 : b === "word/document.xml" ? 1 : a.localeCompare(b)));

  for (const part of parts) {
    const relsName = part.replace(/^word\//, "word/_rels/") + ".rels";
    const rels = zip[relsName] ? parseRels(strFromU8(zip[relsName]!)) : new Map<string, string>();
    const xml = strFromU8(zip[part]!);
    if (!xml.includes("<w:object")) continue;
    const out = convertPartXml(part, xml, rels, (path) => zip[path], profile, equations, options.picture, media);
    zip[part] = strToU8(out.xml);
    if (out.dropped.size) removedRels.set(relsName, out.dropped);
  }
  removeUnusedParts(zip, removedRels);
  addMedia(zip, media);

  const converted = equations.filter((e) => e.status === "converted").length;
  return { docx: zipSync(zip, { level: 6 }), equations, converted, skipped: equations.length - converted };
}

/** Converts the MathType objects of one WordprocessingML part (document, footnotes…). */
function convertPartXml(
  part: string,
  source: string,
  rels: Map<string, string>,
  getBinary: (path: string) => Uint8Array | undefined,
  profile: StyleProfile,
  equations: ConvertedEquation[],
  picture?: ConvertOptions["picture"],
  media?: MediaOut[],
): { xml: string; dropped: Set<string> } {
  const hasW15 = source.includes(`xmlns:w15="${W15}"`);
  const dropped = new Set<string>();
  let xml = replaceObjectRuns(source, (run, before, after) => {
    const progId = /ProgID="([^"]+)"/.exec(run)?.[1] ?? "";
    if (!MATHTYPE_PROGID.test(progId)) return null; // other OLE objects (Excel, Visio…) stay
    const display = isDisplay(before, after);
    const entry: ConvertedEquation = {
      index: equations.length + 1,
      part,
      display,
      number: display ? equationNumber(after) : null,
      latex: null,
      status: "skipped",
      messages: [],
    };
    equations.push(entry);
    if (progId === "Equation.3") {
      entry.messages.push("Old Equation Editor 3.0 object: not supported yet (open it in MathType and save, then convert)");
      return null;
    }
    const oleRel = /<o:OLEObject\b[^>]*\br:id="([^"]+)"/.exec(run)?.[1];
    const target = oleRel ? rels.get(oleRel) : undefined;
    const bin = target ? getBinary(resolveTarget(part, target)) : undefined;
    if (!bin) {
      entry.messages.push("The equation data is missing from the file");
      return null;
    }
    try {
      const { latex, warnings } = mathTypeObjectToLatex(bin);
      const parsed = parseLatex(latex);
      entry.latex = latex;
      entry.messages.push(...warnings, ...parsed.diagnostics.map((x) => x.message));
      entry.status = "converted";
      for (const m of run.matchAll(/\br:id="([^"]+)"/g)) dropped.add(m[1]!);
      entry.tag = formatTag({ blockId: null, instanceId: newInstanceId() });
      const pic = picture && media ? picture(latex, display) : null;
      if (pic && media) {
        const n = media.length + 1;
        const uid = newInstanceId();
        const item: MediaOut = { part, svgId: `rIdMbS${n}`, pngId: `rIdMbP${n}`, name: `mathblocks-${uid}`, data: pic };
        media.push(item);
        const drawing = pic.emf
          ? vmlPictureRun({ rId: item.pngId, widthPt: pic.widthPt, heightPt: pic.heightPt, depthPt: pic.depthPt, id: 90000 + n, alt: `MathBlocks ${display ? (entry.number ? "numbered" : "display") : "inline"}: ${latex}`, title: entry.tag })
          : pictureRun({
          svgRId: item.svgId,
          pngRId: item.pngId,
          widthPt: pic.widthPt,
          heightPt: pic.heightPt,
          depthPt: pic.depthPt,
          id: 90000 + n,
          name: `MathBlocks equation ${n}`,
          description: `MathBlocks ${display ? (entry.number ? "numbered" : "display") : "inline"}: ${latex}`,
        });
        // A Classic (EMF) picture is the equation: its ID is its title, no content control.
        return pic.emf ? drawing : sdt(drawing, hasW15, entry.tag, true);
      }
      const omml = toOmml(parsed.root, { profile, display: false });
      return sdt(omml, hasW15, entry.tag);
    } catch (e) {
      entry.messages.push(e instanceof Error ? e.message : String(e));
      return null;
    }
  });
  // Paragraphs that hold nothing but one converted equation become display equations.
  xml = promoteDisplayParagraphs(xml);
  return { xml, dropped };
}

export interface FlatOpcConvertResult {
  /** The converted Flat OPC package (for Range.InsertXML), or null when nothing was converted. */
  flatOpc: string | null;
  equations: ConvertedEquation[];
}

/**
 * Converts the MathType objects in a Flat OPC package, as Word returns it from
 * Range.WordOpenXML (the embeddings travel along as base64 binary parts).
 */
export function convertFlatOpc(flat: string, options: ConvertOptions = {}): FlatOpcConvertResult {
  const profile = options.profile ?? TUNED_PROFILE;
  const parts = new Map<string, { attrs: string; body: string; start: number; end: number }>();
  for (const m of flat.matchAll(/<pkg:part\b([^>]*)>([\s\S]*?)<\/pkg:part>/g)) {
    const name = /pkg:name="\/?([^"]+)"/.exec(m[1]!)?.[1];
    if (name) parts.set(name, { attrs: m[1]!, body: m[2]!, start: m.index!, end: m.index! + m[0].length });
  }
  const docName = [...parts.keys()].find((n) => /^word\/document\.xml$/.test(n)) ?? [...parts.keys()].find((n) => /main\+xml/.test(parts.get(n)!.attrs));
  const equations: ConvertedEquation[] = [];
  if (!docName) return { flatOpc: null, equations };
  const doc = parts.get(docName)!;
  const xmlData = /<pkg:xmlData>([\s\S]*)<\/pkg:xmlData>/.exec(doc.body);
  if (!xmlData || !xmlData[1]!.includes("<w:object")) return { flatOpc: null, equations };
  const relsPart = parts.get(docName.replace(/^word\//, "word/_rels/") + ".rels");
  const rels = relsPart ? parseRels(relsPart.body) : new Map<string, string>();
  const getBinary = (path: string) => {
    const p = parts.get(path);
    const b64 = p && /<pkg:binaryData>([\s\S]*?)<\/pkg:binaryData>/.exec(p.body)?.[1];
    return b64 ? base64ToBytes(b64) : undefined;
  };
  const media: MediaOut[] = [];
  const out = convertPartXml(docName, xmlData[1]!, rels, getBinary, profile, equations, options.picture, media);
  if (!equations.some((e) => e.status === "converted")) return { flatOpc: null, equations };
  const body = doc.body.replace(xmlData[1]!, () => out.xml);
  let result = flat.slice(0, doc.start) + `<pkg:part${doc.attrs}>${body}</pkg:part>` + flat.slice(doc.end);
  if (media.length) {
    // Pictures: relationships in the document's rels part, files as binary parts.
    const IMG = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
    const relXml = media
      .map((m) => (m.data.emf ? `<Relationship Id="${m.pngId}" Type="${IMG}" Target="media/${m.name}.emf"/>` : `<Relationship Id="${m.svgId}" Type="${IMG}" Target="media/${m.name}.svg"/><Relationship Id="${m.pngId}" Type="${IMG}" Target="media/${m.name}.png"/>`))
      .join("");
    const relsName = docName.replace(/^word\//, "word/_rels/") + ".rels";
    if (result.includes(`pkg:name="/${relsName}"`)) {
      const at = result.indexOf(`pkg:name="/${relsName}"`);
      const end = result.indexOf("</Relationships>", at);
      result = result.slice(0, end) + relXml + result.slice(end);
    } else {
      result = result.replace("</pkg:package>", `<pkg:part pkg:name="/${relsName}" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml"><pkg:xmlData><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relXml}</Relationships></pkg:xmlData></pkg:part></pkg:package>`);
    }
    const files = media
      .map((m) =>
        m.data.emf
          ? `<pkg:part pkg:name="/word/media/${m.name}.emf" pkg:contentType="image/x-emf" pkg:compression="store"><pkg:binaryData>${bytesToBase64(m.data.emf)}</pkg:binaryData></pkg:part>`
          : `<pkg:part pkg:name="/word/media/${m.name}.svg" pkg:contentType="image/svg+xml" pkg:compression="store"><pkg:binaryData>${bytesToBase64(new TextEncoder().encode(m.data.svg))}</pkg:binaryData></pkg:part>` +
          `<pkg:part pkg:name="/word/media/${m.name}.png" pkg:contentType="image/png" pkg:compression="store"><pkg:binaryData>${bytesToBase64(m.data.png)}</pkg:binaryData></pkg:part>`,
      )
      .join("");
    result = result.replace("</pkg:package>", `${files}</pkg:package>`);
  }
  return { flatOpc: result, equations };
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The content control MathBlocks uses for every equation (tag mb1|-|id, box hidden). */
function sdt(omml: string, hasW15: boolean, tag: string, picture = false) {
  const id = Math.floor(Math.random() * 2_000_000_000) + 1;
  const appearance = hasW15 ? `<w15:appearance w15:val="hidden"/>` : "";
  if (picture) return `<w:sdt><w:sdtPr><w:tag w:val="${tag}"/><w:id w:val="${id}"/>${appearance}</w:sdtPr><w:sdtContent>${omml}</w:sdtContent></w:sdt>`;
  return `${MARK}<w:sdt><w:sdtPr><w:tag w:val="${tag}"/><w:id w:val="${id}"/>${appearance}</w:sdtPr><w:sdtContent>${omml}</w:sdtContent></w:sdt>`;
}

function parseRels(xml: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(r[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(r[0])?.[1];
    if (id && target && !/TargetMode="External"/.test(r[0])) m.set(id, target);
  }
  return m;
}

function resolveTarget(part: string, target: string) {
  if (target.startsWith("/")) return target.slice(1);
  const base = part.slice(0, part.lastIndexOf("/") + 1);
  const segs = (base + target).split("/");
  const out: string[] = [];
  for (const s of segs) {
    if (s === "..") out.pop();
    else if (s !== ".") out.push(s);
  }
  return out.join("/");
}

/**
 * Finds every run (<w:r>) containing a <w:object> and calls `replace(run, before, after)` with the
 * rest of its paragraph; a string result replaces the whole run, null keeps it.
 */
function replaceObjectRuns(xml: string, replace: (run: string, before: string, after: string) => string | null): string {
  let out = "";
  let pos = 0;
  for (;;) {
    const obj = xml.indexOf("<w:object", pos);
    if (obj < 0) break;
    const runStart = lastRunStart(xml, obj);
    const objEnd = xml.indexOf("</w:object>", obj);
    const runEnd = objEnd < 0 ? -1 : xml.indexOf("</w:r>", objEnd);
    if (runStart < pos || runEnd < 0) {
      out += xml.slice(pos, obj + 1);
      pos = obj + 1;
      continue;
    }
    const end = runEnd + "</w:r>".length;
    const run = xml.slice(runStart, end);
    const pStart = Math.max(xml.lastIndexOf("<w:p>", runStart), xml.lastIndexOf("<w:p ", runStart));
    const pEnd = xml.indexOf("</w:p>", end);
    const before = pStart >= 0 ? xml.slice(pStart, runStart) : "";
    const after = pEnd >= 0 ? xml.slice(end, pEnd) : "";
    const replacement = replace(run, before, after);
    out += xml.slice(pos, runStart) + (replacement ?? run);
    pos = end;
  }
  return out + xml.slice(pos);
}

function lastRunStart(xml: string, before: number) {
  let i = before;
  for (;;) {
    i = xml.lastIndexOf("<w:r", i - 1);
    if (i < 0) return -1;
    const c = xml[i + 4];
    if (c === ">" || c === " ") return i;
  }
}

const hasText = (x: string) => /<w:t(?:\s[^>]*)?>[^<]*\S/.test(x);

/**
 * A display equation starts its paragraph (only tabs before it) and is followed by nothing, or by
 * tabs and its number. (MathType's MTDisplayEquation style alone is not enough: documents often
 * have it on ordinary text paragraphs too.)
 */
function isDisplay(before: string, after: string) {
  if (hasText(before) || before.includes("<w:object") || before.includes("<m:oMath")) return false;
  const next = after.split(/<w:object\b/)[0]!;
  // Text right after the equation (before any tab): inline.
  const firstText = next.search(/<w:t(?:\s[^>]*)?>[^<]*\S/);
  const firstTab = next.indexOf("<w:tab/>");
  const firstField = next.indexOf("<w:fldChar");
  if (firstText < 0) return true;
  return (firstTab >= 0 && firstTab < firstText) || (firstField >= 0 && firstField < firstText);
}

/** Visible text of the number field after a display equation: "(A.1)". */
function equationNumber(after: string): string | null {
  const next = after.split(/<w:object\b/)[0]!;
  const upToText = next.split(/<w:t(?:\s[^>]*)?>/)[0]!;
  const text = [...upToText.matchAll(/<w:instrText(?:\s[^>]*)?>([^<]*)</g)]
    .map((m) => m[1]!)
    .filter((t) => !/^\s*(MACROBUTTON|SEQ|REF|GOTOBUTTON)\b/.test(t))
    .join("")
    .trim();
  const plain = [...next.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)</g)].map((m) => m[1]!).join("").trim();
  const m = /\([^()]*\)/.exec(text) ?? /^\([^()]*\)/.exec(plain);
  return m ? m[0] : null;
}

/**
 * A paragraph whose only content is one MathBlocks equation (plus tabs) becomes a display
 * equation: the tabs go and <m:oMath> becomes <m:oMathPara>. Numbered equations keep their
 * tabs and fields, so they stay inline math in a MathType-style paragraph.
 */
function promoteDisplayParagraphs(xml: string): string {
  return xml
    .replace(/<w:p\b[^>]*>(?:(?!<\/w:p>).)*<\/w:p>/gs, (p) => {
      if (!p.includes(MARK) || p.split(MARK).length !== 2) return p;
      const open = /^<w:p\b[^>]*>/.exec(p)![0];
      const body = p.slice(open.length, -"</w:p>".length);
      const start = body.indexOf(MARK);
      const end = body.indexOf("</w:sdt>", start) + "</w:sdt>".length;
      const pPr = /^<w:pPr>.*?<\/w:pPr>/s.exec(body)?.[0] ?? "";
      const rest = body.slice(pPr.length, start) + body.slice(end);
      // Only tab runs and bookmarks around it.
      const leftover = rest
        .replace(/<w:r\b[^>]*>(?:<w:rPr>(?:(?!<\/w:rPr>).)*<\/w:rPr>)?(?:<w:tab\/>)*<\/w:r>/gs, "")
        .replace(/<w:bookmark(?:Start|End)\b[^>]*\/>/g, "")
        .replace(/<w:proofErr\b[^>]*\/>/g, "")
        .trim();
      if (leftover) return p;
      const bookmarks = rest.match(/<w:bookmark(?:Start|End)\b[^>]*\/>/g)?.join("") ?? "";
      const math = body
        .slice(start, end)
        .replace(/<m:oMath>([\s\S]*)<\/m:oMath>/, `<m:oMathPara><m:oMathParaPr><m:jc m:val="centerGroup"/></m:oMathParaPr><m:oMath>$1</m:oMath></m:oMathPara>`);
      return `${open}${pPr}${bookmarks}${math}</w:p>`;
    })
    .split(MARK)
    .join("");
}

/** Removes the relationships of converted objects, and their parts when nothing else uses them. */
function removeUnusedParts(zip: Unzipped, removed: Map<string, Set<string>>) {
  const candidates = new Set<string>();
  for (const [relsName, ids] of removed) {
    const owner = relsName.replace(/_rels\//, "").replace(/\.rels$/, "");
    let xml = strFromU8(zip[relsName]!);
    const ownerXml = strFromU8(zip[owner]!);
    xml = xml.replace(/<Relationship\b[^>]*\/>/g, (r) => {
      const id = /\bId="([^"]+)"/.exec(r)?.[1];
      if (!id || !ids.has(id)) return r;
      if (new RegExp(`"${id}"`).test(ownerXml)) return r; // still referenced
      const target = /\bTarget="([^"]+)"/.exec(r)?.[1];
      if (target) candidates.add(resolveTarget(owner, target));
      return "";
    });
    zip[relsName] = strToU8(xml);
  }
  // Keep a part if any relationship anywhere still points at it.
  const stillUsed = new Set<string>();
  for (const name of Object.keys(zip)) {
    if (!name.endsWith(".rels")) continue;
    const owner = name.replace(/_rels\//, "").replace(/\.rels$/, "");
    for (const t of parseRels(strFromU8(zip[name]!)).values()) stillUsed.add(resolveTarget(owner, t));
  }
  let types = zip["[Content_Types].xml"] ? strFromU8(zip["[Content_Types].xml"]!) : null;
  for (const p of candidates) {
    if (stillUsed.has(p) || !zip[p]) continue;
    delete zip[p];
    if (types) types = types.replace(new RegExp(`<Override PartName="/${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*/>`), "");
  }
  if (types) zip["[Content_Types].xml"] = strToU8(types);
}

/** Adds picture-mode media (SVG + PNG) with their relationships and content types. */
function addMedia(zip: Unzipped, media: MediaOut[]) {
  if (!media.length) return;
  const byPart = new Map<string, MediaOut[]>();
  for (const m of media) byPart.set(m.part, [...(byPart.get(m.part) ?? []), m]);
  for (const [part, items] of byPart) {
    const relsName = part.replace(/^word\//, "word/_rels/") + ".rels";
    let rels = zip[relsName] ? strFromU8(zip[relsName]!) : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    const IMG = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
    const add = items
      .map((m) => (m.data.emf ? `<Relationship Id="${m.pngId}" Type="${IMG}" Target="media/${m.name}.emf"/>` : `<Relationship Id="${m.svgId}" Type="${IMG}" Target="media/${m.name}.svg"/><Relationship Id="${m.pngId}" Type="${IMG}" Target="media/${m.name}.png"/>`))
      .join("");
    rels = rels.replace("</Relationships>", `${add}</Relationships>`);
    zip[relsName] = strToU8(rels);
    for (const m of items) {
      if (m.data.emf) {
        zip[`word/media/${m.name}.emf`] = new Uint8Array(m.data.emf);
        continue;
      }
      zip[`word/media/${m.name}.svg`] = strToU8(m.data.svg);
      zip[`word/media/${m.name}.png`] = new Uint8Array(m.data.png);
    }
  }
  let types = strFromU8(zip["[Content_Types].xml"]!);
  for (const [ext, type] of [["svg", "image/svg+xml"], ["png", "image/png"], ["emf", "image/x-emf"]] as const)
    if (!new RegExp(`Extension="${ext}"`, "i").test(types)) types = types.replace("<Default ", `<Default Extension="${ext}" ContentType="${type}"/><Default `);
  zip["[Content_Types].xml"] = strToU8(types);
}
