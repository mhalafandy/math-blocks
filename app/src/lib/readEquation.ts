import type { Row } from "@mathblocks/math-core";
import { parseLatex } from "@mathblocks/math-latex";
import { decodeEntities, readOmml } from "@mathblocks/math-omml";
import { emfComment } from "@mathblocks/math-render";
import { readCfb } from "@mathblocks/mathtype";

export interface ReadEquation {
  root: Row;
  display: boolean;
  unknown: string[];
  kind: "native" | "picture";
  /** A Classic picture typeset as display but placed in a numbered line. */
  numbered?: boolean;
  /** Classic pictures: the fallback symbol font used (MT Extra or STIX), if any. */
  fallback?: string;
  /** Classic pictures: fingerprint of the document style they were drawn in. */
  styleHash?: string;
}

const ALT = /(?:descr|alt)="MathBlocks (display|inline|numbered)(?: \([^)"]*\))?: ([^"]*)"/;

/** The source a MathBlocks picture carries inside its EMF (a GDI comment), if any. */
function emfSource(xml: string): { latex: string; mode: string; fallback?: string; styleHash?: string } | null {
  for (const m of xml.matchAll(/<pkg:part\b[^>]*pkg:contentType="image\/x-emf"[^>]*>\s*<pkg:binaryData>([\s\S]*?)<\/pkg:binaryData>/g)) {
    try {
      const bin = atob(m[1]!.replace(/\s+/g, ""));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const text = emfComment(bytes);
      if (text) {
        const src = JSON.parse(text) as { latex?: string; mode?: string; fallback?: string; styleHash?: string };
        if (typeof src.latex === "string") return { latex: src.latex, mode: src.mode ?? "display", fallback: src.fallback, styleHash: src.styleHash };
      }
    } catch {
      // Not ours, or damaged: try the next picture.
    }
  }
  return null;
}

/** The data inside a MathBlocks embedded object ("MathBlocks" stream of its compound file), if any. */
function objectSource(xml: string): { latex: string; mode: string; styleHash?: string } | null {
  if (!/ProgID="MathBlocks\.Equation/.test(xml)) return null;
  for (const m of xml.matchAll(/<pkg:part\b[^>]*pkg:contentType="application\/vnd\.openxmlformats-officedocument\.oleObject"[^>]*>\s*<pkg:binaryData>([\s\S]*?)<\/pkg:binaryData>/g)) {
    try {
      const bin = atob(m[1]!.replace(/\s+/g, ""));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const s = readCfb(bytes).get("MathBlocks");
      if (!s) continue;
      const src = JSON.parse(new TextDecoder().decode(s.data)) as { latex?: string; mode?: string; styleHash?: string };
      if (typeof src.latex === "string") return { latex: src.latex, mode: src.mode ?? "inline", ...(src.styleHash ? { styleHash: src.styleHash } : {}) };
    } catch {
      // Damaged: the picture's own source or alt text below.
    }
  }
  return null;
}

/**
 * Reads an equation from Word's XML: a native equation (OMML), or a MathBlocks picture whose
 * alt text carries its LaTeX. Null when the XML holds neither.
 */
export function readEquationXml(xml: string): ReadEquation | null {
  // A MathBlocks embedded object: its own data first (it holds the full source).
  const obj = objectSource(xml);
  if (obj) return { root: parseLatex(obj.latex).root, display: obj.mode !== "inline", numbered: obj.mode === "numbered", unknown: [], kind: "picture", ...(obj.styleHash ? { styleHash: obj.styleHash } : {}) };
  const emf = emfSource(xml);
  if (emf) return { root: parseLatex(emf.latex).root, display: emf.mode !== "inline", numbered: emf.mode === "numbered", unknown: [], kind: "picture", ...(emf.fallback ? { fallback: emf.fallback } : {}), ...(emf.styleHash ? { styleHash: emf.styleHash } : {}) };
  const pic = ALT.exec(xml);
  if (pic) {
    const latex = decodeEntities(pic[2]!);
    return { root: parseLatex(latex).root, display: pic[1] !== "inline", numbered: pic[1] === "numbered", unknown: [], kind: "picture" };
  }
  const r = readOmml(xml);
  if (!r || r.root.children.length === 0) return null;
  return { ...r, kind: "native" };
}
