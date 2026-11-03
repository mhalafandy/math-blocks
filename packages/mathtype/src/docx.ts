/**
 * Converts the MathType equations of a .docx into native Word equations (OMML) wrapped in
 * MathBlocks content controls. Everything else in the document is left byte-for-byte as it was:
 * paragraph layout (MTDisplayEquation tabs), equation numbers (SEQ MTEqn fields), bookmarks and
 * cross-references (REF / GOTOBUTTON) keep working.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Unzipped } from "fflate";
import { parseLatex } from "@mathblocks/math-latex";
import { toOmml, TUNED_PROFILE, type StyleProfile } from "@mathblocks/math-omml";
import { formatTag, newInstanceId } from "@mathblocks/ooxml";
import { readCfb } from "./cfb";
import { readMtef } from "./mtef";
import { mtefToLatex } from "./toLatex";

export interface ConvertOptions {
  profile?: StyleProfile;
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

  const parts = Object.keys(zip).filter((n) => /^word\/(document|footnotes|endnotes|header\d*|footer\d*)\.xml$/.test(n));
  parts.sort((a, b) => (a === "word/document.xml" ? -1 : b === "word/document.xml" ? 1 : a.localeCompare(b)));

  for (const part of parts) {
    const relsName = part.replace(/^word\//, "word/_rels/") + ".rels";
    const rels = zip[relsName] ? parseRels(strFromU8(zip[relsName]!)) : new Map<string, string>();
    let xml = strFromU8(zip[part]!);
    if (!xml.includes("<w:object")) continue;
    const hasW15 = xml.includes(`xmlns:w15="${W15}"`);
    const dropped = new Set<string>();

    xml = replaceObjectRuns(xml, (run, before, after) => {
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
      const oleRel = /<o:OLEObject\b[^>]*\br:id="([^"]+)"/.exec(run)?.[1];
      const target = oleRel ? rels.get(oleRel) : undefined;
      const bin = target ? zip[resolveTarget(part, target)] : undefined;
      if (!bin) {
        entry.messages.push("The equation data is missing from the file");
        return null;
      }
      try {
        const { latex, warnings } = mathTypeObjectToLatex(bin);
        const parsed = parseLatex(latex);
        entry.latex = latex;
        entry.messages.push(...warnings, ...parsed.diagnostics.map((x) => x.message));
        const omml = toOmml(parsed.root, { profile, display: false });
        entry.status = "converted";
        for (const m of run.matchAll(/\br:id="([^"]+)"/g)) dropped.add(m[1]!);
        return sdt(omml, hasW15);
      } catch (e) {
        entry.messages.push(e instanceof Error ? e.message : String(e));
        return null;
      }
    });

    // Paragraphs that hold nothing but one converted equation become display equations.
    xml = promoteDisplayParagraphs(xml);

    zip[part] = strToU8(xml);
    if (dropped.size) removedRels.set(relsName, dropped);
  }

  removeUnusedParts(zip, removedRels);

  const converted = equations.filter((e) => e.status === "converted").length;
  return { docx: zipSync(zip, { level: 6 }), equations, converted, skipped: equations.length - converted };
}

/** The content control MathBlocks uses for every equation (tag mb1|-|id, box hidden). */
function sdt(omml: string, hasW15: boolean) {
  const id = Math.floor(Math.random() * 2_000_000_000) + 1;
  const appearance = hasW15 ? `<w15:appearance w15:val="hidden"/>` : "";
  return `${MARK}<w:sdt><w:sdtPr><w:tag w:val="${formatTag({ blockId: null, instanceId: newInstanceId() })}"/><w:id w:val="${id}"/>${appearance}</w:sdtPr><w:sdtContent>${omml}</w:sdtContent></w:sdt>`;
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
