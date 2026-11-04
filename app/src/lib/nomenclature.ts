import type { MathNode } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { escapeXml, NS_M, NS_W, toOmml, type StyleProfile } from "@mathblocks/math-omml";
import { contentControl, flatOpc, type FlatOpcMedia } from "@mathblocks/ooxml";
import { readEquationXml } from "./readEquation";
import type { DocumentIndex, IndexedEquation } from "./symbolIndex";

/**
 * List of symbols (nomenclature) of a Word document, generated from the symbol index: a table
 * Symbol | Description | First appears, grouped Latin / Greek / other, in a content control
 * tagged NOMENCLATURE_TAG so it can be regenerated. Descriptions typed in Word are kept on update.
 */

export const NOMENCLATURE_TAG = "mbnom|list";

export type SymbolGroup = "Latin" | "Greek" | "Other";

export interface NomenclatureEntry {
  key: string;
  group: SymbolGroup;
  /** Sort letter (lower case base letter). */
  letter: string;
  /** "(2.3)" or "p. 4" — where it is defined, else where it first appears. */
  where: string;
  count: number;
}

const GREEK_ORDER = "αβγδεϵζηθϑικλμνξοπϖρϱσςτυφϕχψω";

/** The base letter of a symbol: r for \vec{r}_{sf}, θ for \theta_0. */
export function baseLetter(key: string): string {
  let n: MathNode | undefined = parseLatex(key).root.children[0];
  while (n) {
    if (n.kind === "ident" || n.kind === "number") return n.text;
    if (n.kind === "scripts") n = n.base.children[0];
    else if (n.kind === "accent") n = n.body.children[0];
    else if (n.kind === "stack") n = n.body.children[0];
    else if (n.kind === "row") n = n.children[0];
    else return "";
  }
  return "";
}

export function groupOf(letter: string): SymbolGroup {
  if (/^[A-Za-z]$/.test(letter)) return "Latin";
  if (/^[Ͱ-Ͽἀ-῿]$/.test(letter)) return "Greek";
  return "Other";
}

const GROUP_RANK: Record<SymbolGroup, number> = { Latin: 0, Greek: 1, Other: 2 };

function letterRank(letter: string): number {
  const l = letter.toLowerCase();
  const g = GREEK_ORDER.indexOf(l);
  return g >= 0 ? g : l.charCodeAt(0);
}

const whereOf = (e: IndexedEquation) => (e.number ? e.number : e.page ? `p. ${e.page}` : "");

/** Entries in nomenclature order: Latin a–z (lower case before upper), Greek α–ω, then others. */
export function nomenclatureEntries(index: Pick<DocumentIndex, "symbols">, where: (e: IndexedEquation) => string = whereOf): NomenclatureEntry[] {
  return index.symbols
    .map((s) => {
      const letter = baseLetter(s.key);
      const first = s.definedIn ?? s.equations[0];
      return { key: s.key, group: groupOf(letter), letter, where: first ? where(first) : "", count: s.count };
    })
    .sort(
      (a, b) =>
        GROUP_RANK[a.group] - GROUP_RANK[b.group] ||
        letterRank(a.letter) - letterRank(b.letter) ||
        Number(a.letter !== a.letter.toLowerCase()) - Number(b.letter !== b.letter.toLowerCase()) ||
        a.key.length - b.key.length ||
        a.key.localeCompare(b.key),
    );
}

export interface KeptDescription {
  /** Plain text of the description cell. */
  text: string;
  /** The cell's paragraphs as Word wrote them (formatting kept), when safe to reuse. */
  xml?: string;
}

const WRAP = (inner: string) => `<w:body xmlns:w="${NS_W}" xmlns:m="${NS_M}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${inner}</w:body>`;

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function cellText(cell: string): string {
  return [...cell.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map((p) => [...p[0].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((t) => decode(t[1]!)).join(""))
    .join("\n")
    .trim();
}

/** Reads the descriptions of an existing list (Word's XML of its content control), by symbol. */
export function parseNomenclature(xml: string): Map<string, KeptDescription> {
  const out = new Map<string, KeptDescription>();
  for (const tr of xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
    const cells = [...tr[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((m) => m[0]);
    if (cells.length < 2) continue;
    const eq = readEquationXml(WRAP(cells[0]!));
    if (!eq || !eq.root.children.length) continue;
    const key = serializeLatex(eq.root);
    const inner = cells[1]!.replace(/^<w:tc\b[^>]*>/, "").replace(/<\/w:tc>$/, "").replace(/<w:tcPr\b[\s\S]*?<\/w:tcPr>/, "");
    const text = cellText(cells[1]!);
    // Pictures or links inside point at parts of the old package: keep only the text then.
    const safe = /<w:p\b/.test(inner) && !/\br:(id|embed)=/.test(inner);
    out.set(key, safe ? { text, xml: inner } : { text });
  }
  return out;
}

export interface NomenclatureOptions {
  /** Run-level XML for each symbol (Classic picture or native math). */
  symbolRun: (key: string) => string;
  descriptions: Map<string, KeptDescription>;
  showWhere: boolean;
}

const GROUP_TITLE: Record<SymbolGroup, string> = { Latin: "Latin symbols", Greek: "Greek symbols", Other: "Other symbols" };
const COLS = [1600, 5600, 1800];

const run = (text: string, bold = false, italic = false) =>
  `<w:r>${bold || italic ? `<w:rPr>${bold ? "<w:b/>" : ""}${italic ? "<w:i/>" : ""}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
const para = (content: string) => `<w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr>${content}</w:p>`;
const cell = (w: number, content: string, extra = "") => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${extra}<w:vAlign w:val="center"/></w:tcPr>${content}</w:tc>`;

/** The table, wrapped in its content control (body-level XML). */
export function nomenclatureXml(entries: NomenclatureEntry[], o: NomenclatureOptions): string {
  const widths = o.showWhere ? COLS : [COLS[0]!, COLS[1]! + COLS[2]!];
  const rule = `<w:tcBorders><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tcBorders>`;
  const header =
    `<w:tr><w:trPr><w:tblHeader/></w:trPr>` +
    cell(widths[0]!, para(run("Symbol", true)), rule) +
    cell(widths[1]!, para(run("Description", true)), rule) +
    (o.showWhere ? cell(widths[2]!, para(run("First appears", true)), rule) : "") +
    `</w:tr>`;
  const rows: string[] = [header];
  let group: SymbolGroup | null = null;
  for (const e of entries) {
    if (e.group !== group) {
      group = e.group;
      rows.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${cell(widths.reduce((a, b) => a + b, 0), `<w:p><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="40"/></w:pPr>${run(GROUP_TITLE[group], false, true)}</w:p>`, `<w:gridSpan w:val="${widths.length}"/>`)}</w:tr>`);
    }
    const kept = o.descriptions.get(e.key);
    const desc = kept?.xml ?? para(kept?.text ? run(kept.text) : "");
    rows.push(
      `<w:tr><w:trPr><w:cantSplit/></w:trPr>` +
        cell(widths[0]!, para(o.symbolRun(e.key))) +
        cell(widths[1]!, desc) +
        (o.showWhere ? cell(widths[2]!, para(run(e.where))) : "") +
        `</w:tr>`,
    );
  }
  const border = (side: string) => `<w:${side} w:val="single" w:sz="8" w:space="0" w:color="auto"/>`;
  const tbl =
    `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${border("top")}${border("bottom")}</w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${rows.join("")}</w:tbl>`;
  return contentControl(tbl + `<w:p/>`, { tag: NOMENCLATURE_TAG, title: "MathBlocks list of symbols" });
}

/** Native Word math for a symbol. */
export const nativeSymbolRun = (key: string, profile: StyleProfile) => toOmml(parseLatex(key).root, { display: false, profile });

/** Builds the Flat OPC package: pictures are rendered for Classic look. */
export async function buildNomenclaturePackage(
  entries: NomenclatureEntry[],
  descriptions: Map<string, KeptDescription>,
  o: { look: "classic" | "native"; profile: StyleProfile; sizePt: number; showWhere: boolean },
): Promise<string> {
  const media: FlatOpcMedia[] = [];
  const runs = new Map<string, string>();
  if (o.look === "classic") {
    const { renderPicture, toBase64, altText } = await import("./render");
    const { vmlPictureRun } = await import("@mathblocks/ooxml");
    const stamp = Date.now() % 1_000_000;
    for (const [i, e] of entries.entries()) {
      const pic = await renderPicture(e.key, false, o.sizePt, "inline");
      const rId = `rIdMbN${i + 1}`;
      media.push({ rId, target: `media/mbnom${stamp}_${i + 1}.emf`, contentType: "image/x-emf", base64: toBase64(pic.emf) });
      runs.set(e.key, vmlPictureRun({ rId, widthPt: pic.widthPt, heightPt: pic.heightPt, depthPt: pic.depthPt, id: stamp * 1000 + i + 1, alt: altText(e.key, "inline") }));
    }
  }
  const body = nomenclatureXml(entries, {
    symbolRun: (k) => runs.get(k) ?? nativeSymbolRun(k, o.profile),
    descriptions,
    showWhere: o.showWhere,
  });
  return flatOpc([body], media);
}

const excludedKey = (doc: string) => `mathblocks.nomenclature.excluded.${doc}`;

export function loadExcluded(doc: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(excludedKey(doc)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function saveExcluded(doc: string, keys: Set<string>) {
  try {
    localStorage.setItem(excludedKey(doc), JSON.stringify([...keys]));
  } catch {
    // Remembering exclusions is a convenience.
  }
}
