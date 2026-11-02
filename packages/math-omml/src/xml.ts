export const NS_M = "http://schemas.openxmlformats.org/officeDocument/2006/math";
export const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** <tag attr="v">children</tag>, or self-closing when there are no children. */
export function el(tag: string, attrs: Record<string, string | number | undefined> | null, ...children: string[]): string {
  let a = "";
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined) a += ` ${k}="${escapeXml(String(v))}"`;
  }
  const body = children.join("");
  return body ? `<${tag}${a}>${body}</${tag}>` : `<${tag}${a}/>`;
}

/** Single-value OMML property element such as <m:chr m:val="∑"/>. */
export const val = (tag: string, v: string | number) => el(tag, { "m:val": v });
