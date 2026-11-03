import type { Row } from "@mathblocks/math-core";
import { parseLatex } from "@mathblocks/math-latex";
import { decodeEntities, readOmml } from "@mathblocks/math-omml";
import { emfComment } from "@mathblocks/math-render";

export interface ReadEquation {
  root: Row;
  display: boolean;
  unknown: string[];
  kind: "native" | "picture";
  /** A Classic picture typeset as display but placed in a numbered line. */
  numbered?: boolean;
}

const ALT = /(?:descr|alt)="MathBlocks (display|inline|numbered): ([^"]*)"/;

/** The source a MathBlocks picture carries inside its EMF (a GDI comment), if any. */
function emfSource(xml: string): { latex: string; mode: string } | null {
  for (const m of xml.matchAll(/<pkg:part\b[^>]*pkg:contentType="image\/x-emf"[^>]*>\s*<pkg:binaryData>([\s\S]*?)<\/pkg:binaryData>/g)) {
    try {
      const bin = atob(m[1]!.replace(/\s+/g, ""));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const text = emfComment(bytes);
      if (text) {
        const src = JSON.parse(text) as { latex?: string; mode?: string };
        if (typeof src.latex === "string") return { latex: src.latex, mode: src.mode ?? "display" };
      }
    } catch {
      // Not ours, or damaged: try the next picture.
    }
  }
  return null;
}

/**
 * Reads an equation from Word's XML: a native equation (OMML), or a MathBlocks picture whose
 * alt text carries its LaTeX. Null when the XML holds neither.
 */
export function readEquationXml(xml: string): ReadEquation | null {
  const emf = emfSource(xml);
  if (emf) return { root: parseLatex(emf.latex).root, display: emf.mode !== "inline", numbered: emf.mode === "numbered", unknown: [], kind: "picture" };
  const pic = ALT.exec(xml);
  if (pic) {
    const latex = decodeEntities(pic[2]!);
    return { root: parseLatex(latex).root, display: pic[1] !== "inline", numbered: pic[1] === "numbered", unknown: [], kind: "picture" };
  }
  const r = readOmml(xml);
  if (!r || r.root.children.length === 0) return null;
  return { ...r, kind: "native" };
}
