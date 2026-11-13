import type * as Pdfjs from "pdfjs-dist";

/**
 * Reference links in a PDF exported by Word (self-test "Reference links"): every Link annotation with the page
 * and height it jumps to, and where each equation number is printed — to check one link per reference, each
 * landing on its equation's page with the top of the equation in view.
 */

export interface PdfLink {
  /** 1-based page of the link (the reference). */
  page: number;
  /** 1-based page and height (PDF points from the bottom) it jumps to; y null for "fit page" destinations. */
  destPage: number | null;
  destY: number | null;
}

export interface PdfText {
  page: number;
  str: string;
  /** Baseline height (PDF points from the bottom of the page). */
  y: number;
  x: number;
}

/** The links and the text of a PDF (pdf.js; loaded by the caller: the app or a test). */
export async function readPdfLinks(pdfjs: typeof Pdfjs, data: Uint8Array): Promise<{ links: PdfLink[]; texts: PdfText[]; pages: number }> {
  const doc = await pdfjs.getDocument({ data }).promise;
  const links: PdfLink[] = [];
  const texts: PdfText[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    for (const a of (await page.getAnnotations()) as { subtype?: string; dest?: unknown; url?: string }[]) {
      if (a.subtype !== "Link" || a.url) continue;
      let dest = a.dest as unknown;
      if (typeof dest === "string") dest = await doc.getDestination(dest);
      let destPage: number | null = null;
      let destY: number | null = null;
      if (Array.isArray(dest) && dest.length) {
        try {
          destPage = (await doc.getPageIndex(dest[0] as Parameters<typeof doc.getPageIndex>[0])) + 1;
        } catch {
          destPage = typeof dest[0] === "number" ? (dest[0] as number) + 1 : null;
        }
        const kind = (dest[1] as { name?: string } | undefined)?.name;
        // /XYZ left top zoom; /FitH top; /FitBH top.
        if (kind === "XYZ") destY = typeof dest[3] === "number" ? (dest[3] as number) : null;
        else if (kind === "FitH" || kind === "FitBH") destY = typeof dest[2] === "number" ? (dest[2] as number) : null;
      }
      links.push({ page: p, destPage, destY });
    }
    const content = await page.getTextContent();
    for (const it of content.items as { str?: string; transform?: number[] }[]) if (it.str && it.transform) texts.push({ page: p, str: it.str, x: it.transform[4]!, y: it.transform[5]! });
  }
  return { links, texts, pages: doc.numPages };
}

/** Where an equation number such as "(1.2)" is printed (pieces of one line joined, as Word splits them). */
export function findNumber(texts: PdfText[], number: string): PdfText | null {
  const want = number.replace(/\s+/g, "");
  const lines = new Map<string, PdfText[]>();
  for (const t of texts) {
    const k = `${t.page}|${Math.round(t.y)}`;
    lines.set(k, [...(lines.get(k) ?? []), t]);
  }
  for (const [, items] of lines) {
    const sorted = [...items].sort((a, b) => a.x - b.x);
    const joined = sorted.map((t) => t.str).join("").replace(/\s+/g, "");
    const i = joined.lastIndexOf(want);
    if (i >= 0) return { ...sorted[sorted.length - 1]!, str: want };
  }
  return null;
}

export interface LinkCheck {
  number: string;
  /** Page of the equation (where its number is printed). */
  page: number | null;
  destPage: number | null;
  destY: number | null;
  /** The equation's top (PDF points from the bottom): number baseline + height above the baseline. */
  equationTop: number | null;
  onPage: boolean;
  topInView: boolean | null;
}

/**
 * For each reference (its equation's number and the equation's height above its baseline, in points): the link
 * that goes to it lands on the equation's page, at or above the equation's top (so the whole equation shows).
 * Links are matched to references in document order.
 */
export function checkLinks(links: PdfLink[], texts: PdfText[], refs: { number: string; aboveBaselinePt: number }[]): LinkCheck[] {
  return refs.map((r, i) => {
    const n = findNumber(texts, r.number);
    const l = links[i];
    const equationTop = n ? n.y + r.aboveBaselinePt : null;
    return {
      number: r.number,
      page: n?.page ?? null,
      destPage: l?.destPage ?? null,
      destY: l?.destY ?? null,
      equationTop,
      onPage: !!n && !!l && l.destPage === n.page,
      topInView: l?.destY == null || equationTop == null ? null : l.destY >= equationTop - 1,
    };
  });
}
