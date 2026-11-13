import type { SymbolListRow, SymbolListSegment } from "@mathblocks/connector-protocol";
import { addinSupports, connector } from "./connector";
import { activeStyle, loadDocumentStyle } from "./docStyle";
import { buildObjectInsertion } from "./equation";
import { buildDocumentIndex, type IndexedEquation } from "./symbolIndex";
import { checkList, listSettings, parseDefineTag, tableEntries, type DefinitionIn, type EquationIn, type ListCheck, type SymbolListSettings } from "./symbolList";
import { useApp } from "./store";

/**
 * The list of symbols in Word (docs/SYMBOL-LIST.md): definitions read from their hidden fields, the document's
 * equations (those inside the table itself left out), the table written or updated in one Ctrl+Z.
 */

export interface DocumentSymbols {
  defs: DefinitionIn[];
  eqs: (EquationIn & { eq: IndexedEquation })[];
  /** The table's place (−1: none yet). */
  listAt: number;
  settings: SymbolListSettings;
  /** Definitions whose tag could not be read. */
  unreadable: { tag: string; start: number }[];
}

export async function readDocumentSymbols(): Promise<DocumentSymbols> {
  if (!addinSupports("listDefinitions")) throw new Error("The Word add-in is older than this version of MathBlocks: update it to use the list of symbols.");
  await loadDocumentStyle();
  const r = await connector.request("listDefinitions", {}, 120_000);
  const defs: DefinitionIn[] = [];
  const unreadable: { tag: string; start: number }[] = [];
  for (const d of r.definitions) {
    const t = parseDefineTag(d.tag);
    if (t) defs.push({ ...t, start: d.start, equationsBefore: d.equationsBefore, ...(d.page ? { page: d.page } : {}), ...(d.context ? { context: d.context } : {}) });
    else unreadable.push({ tag: d.tag, start: d.start });
  }
  const index = await buildDocumentIndex();
  const inTable = (e: IndexedEquation) => r.listAt >= 0 && e.start !== undefined && e.start >= r.listAt && e.start <= r.listEnd;
  const eqs = index.equations.map((eq, i) => ({ eq, i })).filter(({ eq }) => !inTable(eq)).map(({ eq, i }) => ({ eq, latex: eq.latex, index: i, number: eq.number ?? null, ...(eq.bookmark ? { bookmark: eq.bookmark } : {}), page: eq.page, context: eq.context, tag: eq.tag }));
  return { defs, eqs, listAt: r.listAt, settings: listSettings(activeStyle().symbolList), unreadable };
}

/** The checks of the document's symbols. */
export async function checkDocumentSymbols(): Promise<{ doc: DocumentSymbols; checks: ListCheck[] }> {
  const doc = await readDocumentSymbols();
  return { doc, checks: checkList(doc.defs, doc.eqs, activeStyle(), doc.settings) };
}

/** A cell's segments from text with inline math ($…$): the math as equations in the document style. */
async function segments(text: string): Promise<SymbolListSegment[]> {
  const out: SymbolListSegment[] = [];
  const parts = text.split(/(\$[^$]+\$)/);
  for (const p of parts) {
    if (!p) continue;
    if (p.startsWith("$") && p.endsWith("$") && p.length > 2) {
      const { flatOpc, tag } = await buildObjectInsertion(p.slice(1, -1), false, undefined, false, { keepParagraph: true, mode: "inline" });
      out.push({ flatOpc, tag });
    } else out.push({ text: p });
  }
  return out;
}

/** Inserts the table of symbols at the cursor, or updates it at its place (one Ctrl+Z). */
export async function updateSymbolList(): Promise<{ rows: number; replaced: boolean; checks: ListCheck[] }> {
  const doc = await readDocumentSymbols();
  const s = doc.settings;
  const style = activeStyle();
  const entries = tableEntries(doc.defs, doc.eqs, style, s);
  if (!entries.some((e) => !("heading" in e))) throw new Error("This document has no symbol definitions yet: write \\define{symbol}{meaning}[unit] after the sentence that introduces a symbol (then Convert LaTeX), or use Define symbol… in the editor.");
  const header = s.columns.map((c) => s.columnTitles[c]);
  const rows: SymbolListRow[] = [];
  for (const e of entries) {
    if ("heading" in e) {
      rows.push({ heading: e.heading });
      continue;
    }
    const cells: SymbolListSegment[][] = [];
    for (const c of s.columns) {
      if (c === "symbol") {
        const { flatOpc, tag } = await buildObjectInsertion(e.def.symbol, false, undefined, false, { keepParagraph: true, mode: "inline" });
        cells.push([{ flatOpc, tag }]);
      } else if (c === "meaning") cells.push(await segments(e.def.meaning));
      else if (c === "unit") {
        // [-]: dimensionless, shown as a dash; a unit drawn as the unit kind (upright).
        const u = e.def.unit;
        const drawn = !u ? [] : u === "-" ? [{ text: "–" }] : await segments(`$\\unit{${u}}$`);
        cells.push(u && u !== "-" && s.unitFormat === "brackets" ? [{ text: "[" }, ...drawn, { text: "]" }] : drawn.length ? drawn : [{ text: "" }]);
      }
      // "First defined": a linked reference to the equation's number (Ctrl+click / a link in the PDF), else the text.
      else cells.push(e.firstBookmark ? [{ ref: e.firstBookmark }] : [{ text: e.first ?? "" }]);
    }
    rows.push({ cells });
  }
  const r = await connector.request("writeSymbolList", { header, rows, ...(s.tableStyle ? { tableStyle: s.tableStyle } : {}), repeatHeader: s.repeatHeader }, 600_000);
  const checks = checkList(doc.defs, doc.eqs, style, s);
  return { rows: r.rows, replaced: r.replaced, checks };
}

/** Insert / update list of symbols (ribbon, Ctrl+K): the table, then a short report of the checks. */
export async function updateSymbolListCommand() {
  const app = useApp.getState();
  try {
    const r = await updateSymbolList();
    const issues = r.checks.length ? ` ${r.checks.length} check(s) to look at: Symbols panel.` : "";
    app.notify(`List of symbols ${r.replaced ? "updated" : "inserted"}: ${r.rows} row(s). One Ctrl+Z in Word undoes it.${issues}`);
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e), "error");
  }
}
