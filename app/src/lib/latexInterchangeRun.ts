/**
 * Convert LaTeX for a whole document written to the interchange convention (docs/LATEX-INTERCHANGE.md):
 * scan (add-in) → plan and pre-flight report (latexInterchange.ts) → build every equation as a
 * MathBlocks object → one write in Word (one Ctrl+Z, numbers and references updated at the end).
 */
import type { BrokenReference } from "@mathblocks/connector-protocol";
import { addinSupports, bringToFront, connector } from "./connector";
import { backupIfMany } from "./docOps";
import { describePlan, planInterchange, type InterchangePlan, type InterchangeScan } from "./latexInterchange";
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
  backup?: string;
  /** Where Word closed the single undo record early (diagnosis); absent when intact. */
  undoBrokenAt?: string;
  stopped?: boolean;
  /** The equations written: kind, ID and number (the self-test checks them in Word). */
  tags: { kind: "inline" | "display"; tag: string; number?: string; bookmark?: string }[];
  /** References to equations that do not exist (after the final Update numbers). */
  broken?: BrokenReference[];
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
  const plan = planInterchange(scan);
  const work = plan.equations.filter((e) => !e.invalid).length + plan.markers.length + plan.references.length;
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
  for (const m of plan.markers) {
    items.push({ id: ++id, kind: "marker", start: m.start, end: m.end, expect: m.expect, chapter: m.chapter, section: m.section, appendix: m.appendix });
    what.set(id, `\\mbnumbering{${m.value}}`);
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
  await connector.request("beginOperation", { document: scan.fullName, title: "Converting LaTeX", total: items.length, undoLabel: "Convert LaTeX" });
  let r: { results: { id: number; ok: boolean; problem: string }[]; ms: number; broken?: BrokenReference[] };
  let undoBrokenAt = "";
  try {
    r = await connector.request("convertInterchange", { document: scan.fullName, items, format, undoLabel: "Convert LaTeX" }, 1_800_000);
  } finally {
    const end = await connector.request("endOperation", { done: items.length }).catch(() => ({ ms: 0, undoBrokenAt: "" }));
    undoBrokenAt = end.undoBrokenAt ?? "";
  }
  const failed = r.results.filter((x) => !x.ok).map((x) => ({ what: what.get(x.id) ?? `item ${x.id}`, problem: x.problem }));
  const okIds = new Set(r.results.filter((x) => x.ok).map((x) => x.id));
  const equations = items.filter((i) => (i.kind === "inline" || i.kind === "display") && okIds.has(i.id)).length;
  const tags = [...okIds].map((i) => tagOf.get(i)).filter((t): t is NonNullable<typeof t> => !!t);
  const result: InterchangeResult = { plan, written: okIds.size, planned: items.length, failed, equations, buildMs, writeMs: r.ms, tags, ...(r.broken?.length ? { broken: r.broken } : {}), ...(backup ? { backup } : {}), ...(undoBrokenAt ? { undoBrokenAt } : {}) };
  console.info(`[MathBlocks] Convert LaTeX: ${describeResult(result)}`);
  if (!o.yes) ui.show({ name: scan.name, plan, stage: "result", result });
  else if (o.fromWord) await tellUser(describeResult(result), failed.length ? "error" : "info");
  return result;
}

export function describeResult(r: InterchangeResult): string {
  const per = r.equations ? Math.round((r.buildMs + r.writeMs) / r.equations) : 0;
  return [
    `${r.equations} equation(s), ${r.plan.counts.references} reference(s) and ${r.plan.counts.markers} numbering marker(s) written (${r.written}/${r.planned} items)`,
    `in ${((r.buildMs + r.writeMs) / 1000).toFixed(1)} s (${per} ms per equation: building ${Math.round(r.buildMs)} ms, writing in Word ${Math.round(r.writeMs)} ms)`,
    r.failed.length ? `${r.failed.length} item(s) left as they were` : "",
    r.backup ? `backup: ${r.backup.split(/[\\/]/).pop()}` : "",
    "One Ctrl+Z in Word undoes it.",
  ]
    .filter(Boolean)
    .join("; ");
}

export { describePlan };
