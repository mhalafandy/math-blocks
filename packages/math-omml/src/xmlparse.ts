/**
 * Minimal, dependency-free XML parser for OMML / WordprocessingML fragments.
 * Supports elements, attributes, text, the five predefined entities and numeric character
 * references, comments, CDATA and processing instructions (skipped). Not a validating parser.
 */
export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}
export type XmlNode = XmlElement | string;

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

export class XmlParseError extends Error {}

/** Parses an XML document or fragment; returns a synthetic root element named "#document". */
export function parseXml(src: string): XmlElement {
  const root: XmlElement = { name: "#document", attrs: {}, children: [] };
  const stack: XmlElement[] = [root];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf("<", i);
    if (lt < 0) {
      pushText(src.slice(i));
      break;
    }
    if (lt > i) pushText(src.slice(i, lt));
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", lt)) {
      const end = src.indexOf("]]>", lt + 9);
      const text = src.slice(lt + 9, end < 0 ? n : end);
      top().children.push(text);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src[lt + 1] === "?" || src[lt + 1] === "!") {
      const end = src.indexOf(">", lt);
      i = end < 0 ? n : end + 1;
      continue;
    }
    const gt = findTagEnd(src, lt);
    if (gt < 0) throw new XmlParseError(`Unterminated tag at ${lt}`);
    const raw = src.slice(lt + 1, gt);
    i = gt + 1;
    if (raw[0] === "/") {
      const name = raw.slice(1).trim();
      // Pop to the matching element (tolerates minor nesting errors).
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k]!.name === name) {
          stack.length = k;
          break;
        }
      }
      continue;
    }
    const selfClosing = raw.endsWith("/");
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const m = /^([^\s/>]+)/.exec(body);
    if (!m) throw new XmlParseError(`Bad tag at ${lt}`);
    const el: XmlElement = { name: m[1]!, attrs: parseAttrs(body.slice(m[1]!.length)), children: [] };
    top().children.push(el);
    if (!selfClosing) stack.push(el);
  }
  return root;

  function top() {
    return stack[stack.length - 1]!;
  }
  function pushText(t: string) {
    if (t) top().children.push(decodeEntities(t));
  }
}

function findTagEnd(src: string, from: number): number {
  let quote: string | null = null;
  for (let k = from + 1; k < src.length; k++) {
    const c = src[k];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return k;
  }
  return -1;
}

function parseAttrs(s: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) attrs[m[1]!] = decodeEntities(m[3] ?? m[4] ?? "");
  return attrs;
}

/** Local name without namespace prefix ("m:oMath" → "oMath"). */
export const localName = (name: string) => name.slice(name.indexOf(":") + 1);

export const elements = (el: XmlElement): XmlElement[] => el.children.filter((c): c is XmlElement => typeof c !== "string");

export const child = (el: XmlElement | undefined, local: string): XmlElement | undefined =>
  el ? elements(el).find((c) => localName(c.name) === local) : undefined;

/** Value of an OMML property such as <m:chr m:val="∑"/> (attribute "m:val" or "val"). */
export function propVal(pr: XmlElement | undefined, local: string): string | undefined {
  const p = child(pr, local);
  if (!p) return undefined;
  for (const [k, v] of Object.entries(p.attrs)) if (localName(k) === "val") return v;
  return "";
}

/** Concatenated text of all descendants. */
export function textContent(el: XmlNode): string {
  return typeof el === "string" ? el : el.children.map(textContent).join("");
}

/** Depth-first search for the first descendant with one of the given local names. */
export function findFirst(el: XmlElement, locals: string[]): XmlElement | undefined {
  for (const c of elements(el)) {
    if (locals.includes(localName(c.name))) return c;
    const f = findFirst(c, locals);
    if (f) return f;
  }
  return undefined;
}
