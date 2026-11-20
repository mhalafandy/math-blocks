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

const OLE_PART = /<pkg:part\b[^>]*pkg:contentType="application\/vnd\.openxmlformats-officedocument\.oleObject"[^>]*>\s*<pkg:binaryData>([\s\S]*?)<\/pkg:binaryData>/g;

function base64Bytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

type ObjSource = { latex: string; mode: string; styleHash?: string };
const asSource = (src: { latex?: unknown; mode?: unknown; styleHash?: unknown }): ObjSource | null =>
  typeof src.latex === "string" ? { latex: src.latex, mode: typeof src.mode === "string" ? src.mode : "inline", ...(typeof src.styleHash === "string" ? { styleHash: src.styleHash } : {}) } : null;

/**
 * The source JSON found in the raw bytes, as the add-in finds the ID (ObjectDataTagXml): for an object Word
 * hands back whose compound file does not read (seen right after Ctrl+Z of an edit, 0.1.166 self-test).
 */
export function rawObjectSource(bytes: Uint8Array): ObjSource | null {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  for (let at = text.indexOf('{"'); at >= 0; at = text.indexOf('{"', at + 1)) {
    let depth = 0;
    let inStr = false;
    for (let k = at; k < text.length && k < at + 100_000; k++) {
      const c = text[k];
      if (inStr) {
        if (c === "\\") k++;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        try {
          const src = asSource(JSON.parse(text.slice(at, k + 1)) as Record<string, unknown>);
          if (src && /"tag":"mb1\|/.test(text.slice(at, k + 1))) return src;
        } catch {
          // Not JSON: keep looking.
        }
        break;
      }
    }
  }
  return null;
}

/**
 * The data inside a MathBlocks embedded object ("MathBlocks" stream of its compound file), if any. Any
 * embedded object with that stream is ours (Word's XML after an undo may not carry the ProgID).
 */
export function objectSource(xml: string): ObjSource | null {
  for (const m of xml.matchAll(OLE_PART)) {
    let bytes: Uint8Array;
    try {
      bytes = base64Bytes(m[1]!);
    } catch {
      continue;
    }
    let unreadable = false;
    try {
      const s = readCfb(bytes).get("MathBlocks");
      if (s) {
        const src = asSource(JSON.parse(new TextDecoder().decode(s.data)) as Record<string, unknown>);
        if (src) return src;
      }
    } catch {
      unreadable = true;
    }
    // Raw bytes only where it can be ours (not every MathType object of a thesis).
    if (unreadable || /ProgID="MathBlocks\.Equation/.test(xml)) {
      const raw = rawObjectSource(bytes);
      if (raw) return raw;
    }
  }
  return null;
}

/** Why an equation's XML did not read (self-test detail): what it holds. */
export function describeUnreadable(xml: string): string {
  const parts = [...xml.matchAll(OLE_PART)];
  let cfb = "no object data";
  if (parts.length) {
    try {
      const entries = readCfb(base64Bytes(parts[0]![1]!));
      cfb = `object data reads, streams ${[...entries.keys()].join(", ") || "none"}`;
    } catch (e) {
      cfb = `object data does not read (${e instanceof Error ? e.message : String(e)})`;
    }
  }
  const alt = /(?:descr|alt)="([^"]{0,60})/.exec(xml)?.[1];
  return `${xml.length} chars; ProgID ${/ProgID="MathBlocks\.Equation/.test(xml) ? "MathBlocks" : (/ProgID="([^"]*)"/.exec(xml)?.[1] ?? "none")}; ${parts.length} embedded part(s); ${cfb}; EMF ${/image\/x-emf/.test(xml) ? "yes" : "no"}; alt "${alt ?? ""}"`;
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
