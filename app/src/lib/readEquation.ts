import type { Row } from "@mathblocks/math-core";
import { parseLatex } from "@mathblocks/math-latex";
import { decodeEntities, readOmml } from "@mathblocks/math-omml";

export interface ReadEquation {
  root: Row;
  display: boolean;
  unknown: string[];
  kind: "native" | "picture";
  /** A Classic picture typeset as display but placed in a numbered line. */
  numbered?: boolean;
}

const ALT = /descr="MathBlocks (display|inline|numbered): ([^"]*)"/;

/**
 * Reads an equation from Word's XML: a native equation (OMML), or a MathBlocks picture whose
 * alt text carries its LaTeX. Null when the XML holds neither.
 */
export function readEquationXml(xml: string): ReadEquation | null {
  const pic = ALT.exec(xml);
  if (pic) {
    const latex = decodeEntities(pic[2]!);
    return { root: parseLatex(latex).root, display: pic[1] !== "inline", numbered: pic[1] === "numbered", unknown: [], kind: "picture" };
  }
  const r = readOmml(xml);
  if (!r || r.root.children.length === 0) return null;
  return { ...r, kind: "native" };
}
