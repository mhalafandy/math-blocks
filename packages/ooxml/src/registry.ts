import { escapeXml, parseXml, type XmlElement } from "@mathblocks/math-omml";
import { randomId } from "./ids";

/**
 * Document registry: a Custom XML Part (namespace below) stored inside the .docx that records the
 * definition of every linked block the document uses, as last written into the document. It makes
 * a document self-contained (it can be opened on another PC) and lets MathBlocks tell when the
 * library has moved on, or when a copy was edited directly in Word.
 *
 *   <mb:registry xmlns:mb="urn:mathblocks:registry:v1" schemaVersion="1" docId="…">
 *     <mb:block id="…" name="…" version="3" display="1"><mb:latex>…</mb:latex></mb:block>
 *   </mb:registry>
 */
export const REGISTRY_NS = "urn:mathblocks:registry:v1";

export interface RegistryBlock {
  id: string;
  name: string;
  version: number;
  latex: string;
  display: boolean;
}

/**
 * Source of a native Word equation that uses notation kinds (Word's equations cannot hold
 * \pvec): its LaTeX and a hash of its content as written, to notice edits made in Word.
 */
export interface RegistrySource {
  /** Instance id (from the content-control tag). */
  id: string;
  latex: string;
  hash: string;
}

export interface Registry {
  docId: string;
  blocks: Record<string, RegistryBlock>;
  sources?: Record<string, RegistrySource>;
}

const local = (n: string) => n.slice(n.indexOf(":") + 1);
const kids = (el: XmlElement) => el.children.filter((c): c is XmlElement => typeof c !== "string");
const text = (el: XmlElement): string => el.children.map((c) => (typeof c === "string" ? c : text(c))).join("");

/** Reads a registry; anything missing or unreadable gives an empty registry (never throws). */
export function parseRegistry(xml: string | null | undefined): Registry {
  const empty: Registry = { docId: randomId(16), blocks: {} };
  if (!xml) return empty;
  let root: XmlElement | undefined;
  try {
    root = kids(parseXml(xml)).find((e) => local(e.name) === "registry");
  } catch {
    return empty;
  }
  if (!root) return empty;
  const reg: Registry = { docId: root.attrs.docId || empty.docId, blocks: {} };
  for (const b of kids(root)) {
    if (local(b.name) === "blocks") {
      // Spike documents (M1) nested blocks in <mb:blocks>.
      for (const bb of kids(b)) readBlock(bb, reg);
    } else readBlock(b, reg);
  }
  return reg;
}

function readBlock(b: XmlElement, reg: Registry) {
  if (local(b.name) === "source" && b.attrs.id) {
    (reg.sources ??= {})[b.attrs.id] = { id: b.attrs.id, latex: text(b), hash: b.attrs.hash ?? "" };
    return;
  }
  if (local(b.name) !== "block" || !b.attrs.id) return;
  const latexEl = kids(b).find((e) => local(e.name) === "latex");
  reg.blocks[b.attrs.id] = {
    id: b.attrs.id,
    name: b.attrs.name ?? "",
    version: Number(b.attrs.version) || 1,
    latex: latexEl ? text(latexEl) : "",
    display: b.attrs.display !== "0",
  };
}

export function serializeRegistry(reg: Registry): string {
  const blocks = Object.values(reg.blocks)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (b) =>
        `<mb:block id="${escapeXml(b.id)}" name="${escapeXml(b.name)}" version="${b.version}" display="${b.display ? 1 : 0}">` +
        `<mb:latex>${escapeXml(b.latex)}</mb:latex></mb:block>`,
    )
    .join("");
  const sources = Object.values(reg.sources ?? {})
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => `<mb:source id="${escapeXml(s.id)}" hash="${escapeXml(s.hash)}">${escapeXml(s.latex)}</mb:source>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><mb:registry xmlns:mb="${REGISTRY_NS}" schemaVersion="1" docId="${escapeXml(reg.docId)}">${blocks}${sources}</mb:registry>`;
}
