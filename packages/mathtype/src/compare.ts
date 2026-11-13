import { strFromU8, unzipSync } from "fflate";
import { mathTypeObjectToLatex } from "./docx";

/**
 * The MathType equations of a Word document, for the visual comparison: each one's LaTeX (from its
 * MTEF), its own preview picture (the WMF Word shows), the picture's size and how far it is lowered
 * below the baseline (MathType sets w:position so the equation's baseline sits on the text's).
 * Nothing is changed in the document.
 */
export interface MathTypeSample {
  index: number;
  latex: string | null;
  warnings: string[];
  display: boolean;
  /** The preview picture as Word stores it (WMF; EMF in some documents). */
  picture: Uint8Array | null;
  pictureType: "wmf" | "emf" | "other" | null;
  widthPt: number;
  heightPt: number;
  /** Below the baseline (from w:position, half-points). */
  depthPt: number;
}

const OBJ_RUN = /<w:r\b(?:(?!<w:r\b)[\s\S])*?<w:object\b[\s\S]*?<\/w:object>[\s\S]*?<\/w:r>/g;

function rels(xml: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(r[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(r[0])?.[1];
    if (id && target && !/TargetMode="External"/.test(r[0])) m.set(id, target);
  }
  return m;
}

const resolve = (target: string) => (target.startsWith("/") ? target.slice(1) : `word/${target.replace(/^\.\//, "")}`);
const hasText = (x: string) => /<w:t(?:\s[^>]*)?>[^<]*\S/.test(x);

/** Every MathType object of the main document, in reading order. */
export function mathTypeSamples(docx: Uint8Array): MathTypeSample[] {
  const zip = unzipSync(docx);
  const doc = zip["word/document.xml"];
  if (!doc) return [];
  const xml = strFromU8(doc);
  const r = zip["word/_rels/document.xml.rels"] ? rels(strFromU8(zip["word/_rels/document.xml.rels"]!)) : new Map<string, string>();
  const out: MathTypeSample[] = [];
  for (const m of xml.matchAll(OBJ_RUN)) {
    const run = m[0];
    const progId = /ProgID="([^"]+)"/.exec(run)?.[1] ?? "";
    if (!/^Equation\.(DSMT\d|3)$/.test(progId)) continue;
    // The paragraph around the run: a display equation is alone in it (tabs and a number aside).
    const pStart = Math.max(xml.lastIndexOf("<w:p>", m.index!), xml.lastIndexOf("<w:p ", m.index!));
    const pEnd = xml.indexOf("</w:p>", m.index! + run.length);
    const before = xml.slice(pStart, m.index!);
    const after = xml.slice(m.index! + run.length, pEnd);
    const nextText = after.search(/<w:t(?:\s[^>]*)?>[^<]*\S/);
    const nextTab = after.indexOf("<w:tab/>");
    const display = !hasText(before) && !before.includes("<w:object") && (nextText < 0 || (nextTab >= 0 && nextTab < nextText));
    const style = /style="([^"]*)"/.exec(run)?.[1] ?? "";
    const pt = (name: string) => {
      const v = new RegExp(`${name}:([\\d.]+)pt`).exec(style)?.[1];
      return v ? Number(v) : 0;
    };
    const pos = /<w:position w:val="(-?\d+)"\/>/.exec(run)?.[1];
    const imgRel = /<v:imagedata\b[^>]*\br:id="([^"]+)"/.exec(run)?.[1];
    const oleRel = /<o:OLEObject\b[^>]*\br:id="([^"]+)"/.exec(run)?.[1];
    const imgPath = imgRel ? r.get(imgRel) : undefined;
    const picture = imgPath ? zip[resolve(imgPath)] ?? null : null;
    const type = imgPath ? (/\.wmf$/i.test(imgPath) ? "wmf" : /\.emf$/i.test(imgPath) ? "emf" : "other") : null;
    let latex: string | null = null;
    let warnings: string[] = [];
    const bin = oleRel && r.get(oleRel) ? zip[resolve(r.get(oleRel)!)] : undefined;
    if (bin) {
      try {
        const c = mathTypeObjectToLatex(bin);
        latex = c.latex;
        warnings = c.warnings;
      } catch (e) {
        warnings = [e instanceof Error ? e.message : String(e)];
      }
    } else warnings = ["no equation data"];
    out.push({ index: out.length + 1, latex, warnings, display, picture, pictureType: type, widthPt: pt("width"), heightPt: pt("height"), depthPt: pos ? Math.max(0, -Number(pos) / 2) : 0 });
  }
  return out;
}
