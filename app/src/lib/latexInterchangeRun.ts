/**
 * Convert LaTeX for a whole document written to the interchange convention (docs/LATEX-INTERCHANGE.md):
 * scan (add-in) → plan and pre-flight report (latexInterchange.ts) → build every equation as a
 * MathBlocks object → one write in Word (one Ctrl+Z, numbers and references updated at the end).
 */
import type { BrokenReference } from "@mathblocks/connector-protocol";
import { addinSupports, bringToFront, connector } from "./connector";
import { backupIfMany } from "./docOps";
import { describePlan, planInterchange, type InterchangePlan, type InterchangeScan } from "./latexInterchange";
import { NUMBER_UPDATE_METHOD } from "./numbering";
import { useApp } from "./store";

export interface InterchangeResult {
  plan: InterchangePlan;
  /** Items written / planned. */
  written: number;
  planned: number;
  /** Items Word did not take, with why. */
  failed: { what: string; problem: string }[];
  /** Equations converted (inline + display + numbered). */
  equations: number;
  /** Time building the equations in the app, and writing them in Word (ms). */
  buildMs: number;
  writeMs: number;
  /** Of writeMs: Word updating the numbers and references at the end. */
  numbersMs?: number;
  backup?: string;
  /** Where Word closed the single undo record early (diagnosis); absent when intact. */
  undoBrokenAt?: string;
  stopped?: boolean;
  /** The equations written: kind, ID and number (the self-test checks them in Word). */
  tags: { kind: "inline" | "display"; tag: string; number?: string; bookmark?: string }[];
  /** References to equations that do not exist (after the final Update numbers). */
  broken?: BrokenReference[];
  /** Cancelled by the user: the conversion was undone (rolledBack: the document is confirmed as before). */
  cancelled?: { rolledBack: boolean };
  /** The text guard found other text changed and undid the conversion. */
  guardFailed?: string;
  guardRestored?: boolean;
}

/** The pre-flight decision (the dialog answers it; the self-test passes yes). */
let decide: ((go: boolean) => void) | null = null;
export function answerPreflight(go: boolean) {
  decide?.(go);
  decide = null;
}

export async function convertLatexDocument(o: { document?: string; fromWord?: boolean; yes?: boolean } = {}): Promise<InterchangeResult | null> {
  const app = useApp.getState();
  const { useInterchange } = await import("../components/InterchangeDialog");
  const ui = useInterchange.getState();
  const tellUser = async (text: string, kind: "info" | "error") => (await import("./wordUi")).tell(text, kind, !!o.fromWord);
  if (!addinSupports("scanInterchange")) return null;
  const scan = (await connector.request("scanInterchange", o.document ? { document: o.document } : {}, 300_000)) as InterchangeScan;
  const { activeStyle } = await import("./docStyle");
  const plan = planInterchange(scan, { frameSubscriptWarning: activeStyle().global.frameSubscriptWarning });
  // Footnotes, endnotes, text boxes, headers and footers: their inline equations, each in its own story.
  const storyEquations: { story: number; start: number; end: number; expect: string; latex: string; typed: string }[] = [];
  if (addinSupports("scanStories")) {
    const ss = await connector.request("scanStories", o.document ? { document: o.document } : {}, 300_000);
    const byStory = new Map<number, typeof ss.paragraphs>();
    for (const p of ss.paragraphs) byStory.set(p.story, [...(byStory.get(p.story) ?? []), p]);
    for (const [story, paras] of byStory) {
      const sub = planInterchange({ ...scan, paragraphs: paras.map((p) => ({ start: p.start, end: p.end, text: p.text, style: p.style })), bookmarks: [] }, { frameSubscriptWarning: activeStyle().global.frameSubscriptWarning });
      for (const e of sub.equations) if (e.kind === "inline" && !e.invalid) storyEquations.push({ story, start: e.start, end: e.end, expect: e.expect, latex: e.latex, typed: e.typed });
    }
  }
  const work = plan.equations.filter((e) => !e.invalid).length + plan.markers.length + plan.defines.length + plan.references.length + storyEquations.length;
  if (!work && !plan.issues.length) {
    await tellUser(`No LaTeX found in “${scan.name}” to convert.`, "info");
    return { plan, written: 0, planned: 0, failed: [], equations: 0, buildMs: 0, writeMs: 0, tags: [] };
  }

  // Pre-flight: nothing is written before the user has seen the counts and every problem.
  if (!o.yes) {
    if (o.fromWord) void bringToFront();
    ui.show({ name: scan.name, plan, stage: "preflight" });
    const go = await new Promise<boolean>((resolve) => (decide = resolve));
    if (!go) {
      ui.close();
      return { plan, written: 0, planned: 0, failed: [], equations: 0, buildMs: 0, writeMs: 0, stopped: true, tags: [] };
    }
    ui.show({ name: scan.name, plan, stage: "working", progress: "Building the equations…" });
  }

  // Build every equation (MathBlocks objects, as Classic equations are written).
  const t0 = performance.now();
  const { buildObjectInsertion } = await import("./equation");
  type Item = Record<string, unknown> & { id: number; kind: string; start: number; end: number; expect: string };
  const items: Item[] = [];
  const what = new Map<number, string>();
  const tagOf = new Map<number, { kind: "inline" | "display"; tag: string; number?: string; bookmark?: string }>();
  let id = 0;
  const valid = plan.equations.filter((e) => !e.invalid);
  for (const [k, e] of valid.entries()) {
    const mode = e.kind === "inline" ? "inline" : e.numbered ? "numbered" : "display";
    const { tag, flatOpc } = await buildObjectInsertion(e.latex, mode === "display", undefined, mode !== "inline", { keepParagraph: true, mode });
    items.push({ id: ++id, kind: e.kind, start: e.start, end: e.end, expect: e.expect, flatOpc, tag, numbered: e.numbered, ...(e.bookmark ? { bookmark: e.bookmark } : {}), appendix: !!e.appendix });
    tagOf.set(id, { kind: e.kind, tag, ...(e.number ? { number: e.number } : {}), ...(e.bookmark ? { bookmark: e.bookmark } : {}) });
    what.set(id, `${e.kind === "inline" ? "$" : "$$"}${e.typed.trim().slice(0, 50)}${e.kind === "inline" ? "$" : "$$"}${e.number ? ` ${e.number}` : ""}`);
    if (!o.yes && k % 10 === 0) ui.show({ name: scan.name, plan, stage: "working", progress: `Building the equations… ${k + 1} / ${valid.length}` });
  }
  for (const e of storyEquations) {
    const { tag, flatOpc } = await buildObjectInsertion(e.latex, false, undefined, false, { keepParagraph: true, mode: "inline" });
    items.push({ id: ++id, kind: "inline", story: e.story, start: e.start, end: e.end, expect: e.expect, flatOpc, tag, numbered: false, appendix: false });
    tagOf.set(id, { kind: "inline", tag });
    what.set(id, "$" + e.typed.trim().slice(0, 50) + "$ (footnote, text box or header)");
  }
  for (const m of plan.markers) {
    items.push({ id: ++id, kind: "marker", start: m.start, end: m.end, expect: m.expect, chapter: m.chapter, section: m.section, appendix: m.appendix });
    what.set(id, `\\mbnumbering{${m.value}}`);
  }
  for (const d of plan.defines) {
    items.push({ id: ++id, kind: "define", start: d.start, end: d.end, expect: d.expect, tag: d.tag });
    what.set(id, `\\define{${d.symbol}}`);
  }
  for (const r of plan.references) {
    items.push(r.resolved ? { id: ++id, kind: "ref", start: r.start, end: r.end, expect: r.expect, bookmark: r.bookmark, form: r.form } : { id: ++id, kind: "highlight", start: r.start, end: r.end, expect: r.expect });
    what.set(id, r.expect);
  }
  const buildMs = performance.now() - t0;

  // One write, one Ctrl+Z (inside an operation: progress window, no redraw, document stays in front).
  const backup = await backupIfMany(scan.fullName, items.length);
  const { numberFormat } = await import("./numbering");
  // From the markers: (chapter.section.n) with section markers, else (chapter.n).
  const format = plan.usesMarkers ? { open: "(", close: ")", parts: plan.usesSections ? "section" : "chapter", separator: ".", restart: plan.usesSections ? "section" : "chapter", source: "markers" } : numberFormat(app.numberStyle);
  if (!o.yes) ui.show({ name: scan.name, plan, stage: "working", progress: `Writing ${items.length} item(s) into Word…` });
  // The text guard compares everything else: the ranges written here (LaTeX → equations, references,
  // markers) are excluded; highlighted references keep their text.
  const exclude = items.filter((i) => i.kind !== "highlight" && i.story === undefined).map((i) => ({ start: i.start, end: i.end }));
  await connector.request("beginOperation", { document: scan.fullName, title: "Converting LaTeX", total: items.length, undoLabel: "Convert LaTeX", exclude });
  let r: { results: { id: number; ok: boolean; problem: string }[]; ms: number; broken?: BrokenReference[] } = { results: [], ms: 0 };
  let undoBrokenAt = "";
  let numbersMs: number | undefined;
  let guard: { failed?: string; restored?: boolean } = {};
  let cancelled = false;
  let rolledBack = false;
  try {
    // In batches, last position first (writing moves what comes after): the progress bar moves and Cancel works
    // between batches; the last call updates numbers and references once. Other stories' items do not move
    // positions in the main text: they go first.
    const order = [...items].sort((a, b) => (a.story === undefined ? 1 : 0) - (b.story === undefined ? 1 : 0) || Number(a.story ?? 0) - Number(b.story ?? 0) || b.start - a.start);
    const BATCH = 40;
    const t1 = performance.now();
    for (let i = 0; i < order.length || i === 0; i += BATCH) {
      const batch = order.slice(i, i + BATCH);
      const last = i + BATCH >= order.length;
      const part = await connector.request("convertInterchange", { document: scan.fullName, items: batch, format, undoLabel: "Convert LaTeX", updateNumbers: last, numbersMethod: NUMBER_UPDATE_METHOD }, 1_800_000);
      if (typeof part.numbersMs === "number") numbersMs = part.numbersMs;
      r = { results: [...r.results, ...part.results], ms: performance.now() - t1, ...(part.broken ? { broken: part.broken } : r.broken ? { broken: r.broken } : {}) };
      if (last) break;
      const pr = await connector.request("operationProgress", { done: Math.min(order.length, i + BATCH), text: `${Math.min(order.length, i + BATCH)} / ${order.length} items` });
      if (pr.cancelled) {
        cancelled = true;
        break;
      }
    }
  } finally {
    // Cancelled: the whole conversion is undone, so the document is exactly as before.
    const end = await connector.request("endOperation", { done: items.length, ...(cancelled ? { rollback: true } : {}) }).catch(() => ({ ms: 0, undoBrokenAt: "" }) as { ms: number; undoBrokenAt?: string; guardFailed?: string; guardRestored?: boolean; rolledBack?: boolean });
    undoBrokenAt = end.undoBrokenAt ?? "";
    if (end.guardFailed) guard = { failed: end.guardFailed, restored: !!end.guardRestored };
    if (cancelled) rolledBack = !!end.rolledBack;
  }
  const failed = r.results.filter((x) => !x.ok).map((x) => ({ what: what.get(x.id) ?? `item ${x.id}`, problem: x.problem }));
  const okIds = new Set(r.results.filter((x) => x.ok).map((x) => x.id));
  const equations = items.filter((i) => (i.kind === "inline" || i.kind === "display") && okIds.has(i.id)).length;
  // In document order (the items' order), not the order Word wrote them in (last first).
  const tags = items.filter((i) => okIds.has(i.id)).map((i) => tagOf.get(i.id)).filter((t): t is NonNullable<typeof t> => !!t);
  const result: InterchangeResult = { ...(cancelled ? { cancelled: { rolledBack }, stopped: true } : {}), ...(guard.failed ? { guardFailed: guard.failed, guardRestored: !!guard.restored } : {}), plan, written: okIds.size, planned: items.length, failed, equations, buildMs, writeMs: r.ms, ...(numbersMs !== undefined ? { numbersMs } : {}), tags, ...(r.broken?.length ? { broken: r.broken } : {}), ...(backup ? { backup } : {}), ...(undoBrokenAt ? { undoBrokenAt } : {}) };
  console.info(`[MathBlocks] Convert LaTeX: ${describeResult(result)}`);
  if (!o.yes) ui.show({ name: scan.name, plan, stage: "result", result });
  else if (o.fromWord) await tellUser(describeResult(result), failed.length ? "error" : "info");
  return result;
}

export function describeResult(r: InterchangeResult): string {
  if (r.cancelled) return r.cancelled.rolledBack ? "Convert LaTeX cancelled: everything it had written was undone; the document is as it was." : "Convert LaTeX cancelled and undone, but the document could not be confirmed as before: check it (Ctrl+Z / Ctrl+Y).";
  // Per equation without the number update at the end (timed on its own).
  const per = r.equations ? Math.round((r.buildMs + r.writeMs - (r.numbersMs ?? 0)) / r.equations) : 0;
  return [
    `${r.equations} equation(s), ${r.plan.counts.references} reference(s), ${r.plan.counts.markers} numbering marker(s) and ${r.plan.counts.defines} symbol definition(s) written (${r.written}/${r.planned} items)`,
    `in ${((r.buildMs + r.writeMs) / 1000).toFixed(1)} s (${per} ms per equation: building ${Math.round(r.buildMs)} ms, writing in Word ${Math.round(r.writeMs - (r.numbersMs ?? 0))} ms${r.numbersMs !== undefined ? `; numbers and references updated in ${(r.numbersMs / 1000).toFixed(1)} s` : ""})`,
    r.failed.length ? `${r.failed.length} item(s) left as they were` : "",
    r.backup ? `backup: ${r.backup.split(/[\\/]/).pop()}` : "",
    "One Ctrl+Z in Word undoes it.",
  ]
    .filter(Boolean)
    .join("; ");
}

export { describePlan };
