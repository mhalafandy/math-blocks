import { addinSupports, connector } from "./connector";
import { activeStyle, loadDocumentStyle, saveDocumentStyle } from "./docStyle";
import { BACKUP_ABOVE, describeOperation, replaceInDocument, type OperationResult, type ReplaceItem } from "./docOps";
import { buildInsertion, currentProfile } from "./equation";
import { recordNativeSources } from "./nativeSources";
import { readDocumentSymbols, buildSymbolListRows, type DocumentSymbols } from "./symbolListRun";
import { defineTag, type DefinitionIn } from "./symbolList";
import { applyChoices, changeInLatex, changeRules, findClashes, planChange, type ChangeChoices, type ChangePlan, type Clash, type DocEquation } from "./changeSymbol";
import type { IndexedEquation } from "./symbolIndex";

/**
 * Change symbol… in Word (docs: STATUS, B). Reading: the equations (main text, footnotes, endnotes, text boxes,
 * headers and footers; the list of symbols' own table left out), the definitions, the headings (the preview groups
 * by section) and plain-text mentions. Applying: one operation — one Ctrl+Z, under the text guard, a backup first
 * for large documents — that updates the definitions (meaning and unit kept), the document's rules, its blocks when
 * asked, the list of symbols in place, and redraws every changed equation. Numbers, bookmarks and references are
 * not touched (an equation is replaced in place, its number field untouched).
 */

export interface ChangeContext {
  doc: DocumentSymbols;
  eqs: (DocEquation & { eq: IndexedEquation })[];
}

export interface Mention {
  text: string;
  start: number;
  end: number;
  context: string;
}

/** Everything the dialog needs about the document (read once when it opens). */
export async function readForChange(): Promise<ChangeContext> {
  await loadDocumentStyle();
  const doc = await readDocumentSymbols();
  const headings = addinSupports("listHeadings") ? (await connector.request("listHeadings", {}, 60_000)).headings : [];
  const sectionAt = (start: number | undefined) => {
    if (start === undefined) return undefined;
    let h: string | undefined;
    for (const x of headings) {
      if (x.start > start) break;
      if (x.level <= 2) h = x.text;
    }
    return h;
  };
  const storyName: Record<string, string> = { footnotes: "Footnotes", endnotes: "Endnotes", textbox: "Text boxes", header: "Headers", footer: "Footers", comments: "Comments", other: "Elsewhere" };
  const eqs = doc.eqs.map((e) => ({
    eq: e.eq,
    tag: e.eq.tag,
    latex: e.eq.latex,
    display: e.eq.display,
    numbered: !!e.eq.numbered,
    number: e.eq.number ?? null,
    ...(e.eq.story ? { story: e.eq.story, section: storyName[e.eq.story] ?? e.eq.story } : sectionAt(e.eq.start) ? { section: sectionAt(e.eq.start)! } : {}),
  }));
  return { doc, eqs };
}

/** The preview: the plan, clashes for the default choices, and plain-text mentions of the old symbol. */
export async function previewChange(ctx: ChangeContext, from: string, to: string): Promise<{ plan: ChangePlan; clashes: Clash[]; mentions: Mention[] } | { error: string }> {
  const style = activeStyle();
  const plan = planChange(from, to, ctx.eqs, ctx.doc.defs, style);
  if ("error" in plan) return plan;
  const clashes = findClashes(plan, { skip: new Set(), related: new Set() }, ctx.eqs, ctx.doc.defs, style);
  const mentions = addinSupports("findTextMentions") ? (await connector.request("findTextMentions", { texts: mentionTexts(plan) }, 60_000)).mentions : [];
  return { plan, clashes, mentions };
}

/**
 * What a plain-text mention of the symbol looks like: its LaTeX typed as text, and its letter when Greek (ω typed
 * with the Symbol font or Unicode). A single Latin letter is not searched (every word has one).
 */
export function mentionTexts(plan: ChangePlan): { text: string; wholeWord?: boolean; matchCase?: boolean }[] {
  const out: { text: string; wholeWord?: boolean; matchCase?: boolean }[] = [{ text: plan.target.latex, matchCase: true }];
  if (plan.target.key !== plan.target.latex) out.push({ text: plan.target.key, matchCase: true });
  const l = plan.target.letter;
  if (l && /[Α-Ωα-ωϑϕϖϱϵ]/.test(l)) out.push({ text: l, matchCase: true });
  else if (l && plan.target.partSub) {
    const sub = plan.target.key.replace(/^.*?_\{?([^}]*)\}?$/, "$1");
    out.push({ text: `${l}_${sub}`, wholeWord: true, matchCase: true }, { text: `${l}${sub}`, wholeWord: true, matchCase: true });
  }
  return out;
}

export interface ApplyOptions {
  /** Change the document's own blocks that contain the symbol (asked; off by default). */
  blocks?: boolean;
  /** When the new symbol is defined already: which definitions stay. */
  merge?: "both" | "existing" | "changed";
}

export interface ApplyResult extends Pick<OperationResult, "cancelled" | "guardFailed" | "guardRestored" | "backup"> {
  equations: number;
  definitions: number;
  rules: number;
  blocks: number;
  list: boolean;
  skipped: number;
  note: string;
}

/** Applies the change with the user's choices: one operation in Word (one Ctrl+Z). */
export async function applyChange(ctx: ChangeContext, plan: ChangePlan, choices: ChangeChoices, o: ApplyOptions = {}): Promise<ApplyResult> {
  const style = activeStyle();
  const { equations: changedEqs, definitions: changedDefs } = applyChoices(plan, choices, style);
  const document = (await connector.request("documentInfo", {})).fullName as string;
  // The new definitions, list and rules are computed before the operation: reading Word's equations (their XML)
  // inside it would end its undo record.
  let defs: DefinitionIn[] = ctx.doc.defs.map((d) => {
    const c = changedDefs.find((x) => x.start === d.start);
    return c ? { ...d, symbol: c.symbol } : d;
  });
  const removeDefs: number[] = [];
  if (o.merge && o.merge !== "both") {
    const clashes = findClashes(plan, choices, ctx.eqs, ctx.doc.defs, style);
    const existing = clashes.flatMap((c) => c.definitions.map((d) => d.start));
    const changed = changedDefs.map((d) => d.start);
    removeDefs.push(...(o.merge === "existing" ? changed : existing));
    defs = defs.filter((d) => !removeDefs.includes(d.start));
  }
  const newEqLatex = new Map(changedEqs.map((e) => [e.tag, e.latex]));
  const listEqs = ctx.doc.eqs.map((e) => (newEqLatex.has(e.tag!) ? { ...e, latex: newEqLatex.get(e.tag!)! } : e));
  const list = ctx.doc.listAt >= 0 && defs.length ? await buildSymbolListRows(defs, listEqs, ctx.doc.settings, style) : null;
  const rules = changeRules(style.symbols, plan, choices);
  let blocksXml: string | null = null;
  let blocksChanged = 0;
  if (o.blocks && addinSupports("setDocumentBlocks")) {
    const { useBlocks, documentBlocksXml } = await import("./blocks/useBlocks");
    const list0 = useBlocks.getState().docBlocks;
    const next = list0.map((b) => {
      const r = changeInLatex(b.body, plan.target, plan.to, style, (x) => x.cls !== "related" || (!!x.relatedKey && choices.related.has(x.relatedKey)));
      if (r.changed) blocksChanged++;
      return r.changed ? { ...b, body: r.latex } : b;
    });
    if (blocksChanged) blocksXml = documentBlocksXml(next);
  }
  // The equations: drawn again in their own form (picture or Word equation), each replaced in place.
  const profile = currentProfile();
  const items: ReplaceItem[] = [];
  let skipped = 0;
  for (const c of changedEqs) {
    const e = ctx.eqs.find((x) => x.tag === c.tag)!.eq;
    if (e.editedInWord && !e.blockId) {
      skipped++;
      continue;
    }
    items.push({ tag: e.tag, flatOpc: (await buildInsertion(c.latex, e.numbered ? false : e.display, profile, e.tag, e.kind === "picture" ? "classic" : "native", e.display)).flatOpc, previous: e.flatOpc });
  }
  const changedDefsKept = changedDefs.filter((d) => !removeDefs.includes(d.start));
  const work = items.length + changedDefsKept.length + removeDefs.length + (list ? 1 : 0) + (rules.changed ? 1 : 0) + (blocksXml ? 1 : 0);
  if (!work) return { equations: 0, definitions: 0, rules: 0, blocks: 0, list: false, skipped, note: "Nothing to change.", cancelled: false };
  if (work > BACKUP_ABOVE && addinSupports("backupDocument")) await connector.request("backupDocument", { document }, 120_000);
  const label = `Change ${plan.target.latex} to ${plan.to.latex}`;
  const op = await replaceInDocument({
    document,
    title: label,
    undoLabel: label,
    noBackup: true,
    total: items.length,
    items,
    // Inside the operation's single undo record, before the equations: definitions from the last to the first (so
    // the positions of the earlier ones stay right), then the list (it may come before them), rules and blocks.
    prepare: async () => {
      const byStart = [...ctx.doc.defs].sort((a, b) => b.start - a.start);
      for (const d of byStart) {
        if (removeDefs.includes(d.start)) await connector.request("updateDefinition", { document, start: d.start });
        else {
          const c = changedDefsKept.find((x) => x.start === d.start);
          if (c) await connector.request("updateDefinition", { document, start: d.start, tag: defineTag({ symbol: c.symbol, meaning: c.meaning, ...(c.unit ? { unit: c.unit } : {}) }) });
        }
      }
      if (list) await connector.request("writeSymbolList", { document, header: list.header, rows: list.rows, ...(ctx.doc.settings.tableStyle ? { tableStyle: ctx.doc.settings.tableStyle } : {}), repeatHeader: ctx.doc.settings.repeatHeader }, 600_000);
      if (rules.changed) await saveDocumentStyle({ ...style, symbols: rules.rules }, document);
      if (blocksXml) await connector.request("setDocumentBlocks", { document, xml: blocksXml });
      return items;
    },
  });
  if (!op.cancelled && !op.guardFailed) {
    const natives = items.map((it) => ctx.eqs.find((e) => e.tag === it.tag)!.eq).filter((e) => e.kind === "native");
    if (natives.length) await recordNativeSources(document, natives.map((e) => ({ tag: e.tag, latex: newEqLatex.get(e.tag)! })));
    if (blocksXml) await import("./blocks/useBlocks").then((m) => m.loadDocumentBlocks());
  }
  let note = op.replaced > BACKUP_ABOVE ? describeOperation(op, "Done") : "";
  if (skipped) note += ` ${skipped} equation(s) edited directly in Word were left unchanged (double-click one to decide).`;
  return { equations: op.replaced, definitions: changedDefsKept.length, rules: rules.changed, blocks: blocksChanged, list: !!list, skipped, note: note.trim(), cancelled: op.cancelled, ...(op.guardFailed ? { guardFailed: op.guardFailed, guardRestored: op.guardRestored } : {}), ...(op.backup ? { backup: op.backup } : {}) };
}
