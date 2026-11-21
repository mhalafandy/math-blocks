import { connector } from "./connector";
import { useApp } from "./store";

/**
 * Thesis-size test (C3, Ctrl+K "Thesis-size test…"): a generated generic document of about 300 pages — 10 chapters
 * and 2 appendices, about 1500 equations (inline, display, numbered, in tables, footnotes and text boxes), about
 * 1000 references, symbol definitions and the list of symbols — through every whole-document operation, each timed:
 * open, Convert LaTeX, Update numbers, the list of symbols, Apply style, Check document, Change symbol, save.
 * Cancel is tried on the long ones (as if pressed at the first progress step): the document must be exactly as
 * before. The report (report.txt) and the document are saved in a new folder next to the self-test reports.
 */

const SLOW = 3_600_000;
const smoke = (op: string, params: Record<string, unknown> = {}, timeout = SLOW) => connector.request("smoke", { op, ...params }, timeout);

export interface ThesisStep {
  what: string;
  ms: number;
  ok: boolean | null;
  detail: string;
}

/** A fingerprint of the document: its text, every equation's LaTeX and style, the numbers (for "exactly as before"). */
async function state(): Promise<string> {
  const { readEquationXml } = await import("./readEquation");
  const { serializeLatex } = await import("@mathblocks/math-latex");
  const text = ((await smoke("snapshot")) as { text?: string }).text ?? "";
  const inst = await connector.request("listInstances", { includeContent: true }, SLOW);
  const eqs = (inst.documents[0]?.instances ?? []).map((i) => {
    const r = i.flatOpc ? readEquationXml(i.flatOpc) : null;
    return `${r ? serializeLatex(r.root) : "?"}#${r?.styleHash ?? ""}`;
  });
  const numbers = (await connector.request("listNumbered", {}, SLOW)).equations.map((e) => e.number).join(" ");
  return `${text}\u0000${eqs.join("\u0001")}\u0000${numbers}`;
}

/** The report's lines; `running` is the step under way (so a report left by a crash or a hang says where it stopped). */
export function thesisReport(steps: ThesisStep[], startedAt: Date, totalMs: number, running?: { what: string; since: Date }): string[] {
  return [
    `MathBlocks thesis-size test — ${startedAt.toLocaleString()}`,
    running ? `Not finished: running "${running.what}" since ${running.since.toLocaleTimeString()} (${(totalMs / 1000).toFixed(0)} s so far)` : `Total ${(totalMs / 1000).toFixed(0)} s`,
    "",
    ...steps.map((s) => `${s.ok === null ? "INFO" : s.ok ? "PASS" : "FAIL"}  ${s.what}: ${(s.ms / 1000).toFixed(1)} s${s.detail ? `  — ${s.detail}` : ""}`),
  ];
}

const writeReport = (lines: string[]) => smoke("writeFile", { file: "thesis-size report.txt", text: lines.join("\r\n") }, 30_000).catch(() => null) as Promise<{ path: string } | null>;

export async function runThesisTest(scale = 1, progress: (s: string) => void = () => undefined): Promise<ThesisStep[]> {
  const steps: ThesisStep[] = [];
  const startedAt = new Date();
  const t00 = performance.now();
  // Written before and after every step: Word crashing or hanging still leaves the timings so far.
  const save = (running?: string) => writeReport(thesisReport(steps, startedAt, performance.now() - t00, running ? { what: running, since: new Date() } : undefined));
  const time = async <T,>(what: string, run: () => Promise<T>, judge: (r: T) => [boolean | null, string] = () => [true, ""]): Promise<T | null> => {
    progress(what);
    await save(what);
    const t0 = performance.now();
    try {
      const r = await run();
      const [ok, detail] = judge(r);
      steps.push({ what, ms: performance.now() - t0, ok, detail });
      return r;
    } catch (e) {
      steps.push({ what, ms: performance.now() - t0, ok: false, detail: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      await save();
    }
  };
  const { interchangeDocx, thesisParagraphs } = await import("./interchangeFixture");
  const { toBase64 } = await import("./render");
  await smoke("begin");
  await save("generate the document");
  try {
    const paras = thesisParagraphs(scale);
    const docx = toBase64(interchangeDocx(paras));
    await time("open the generated document", () => smoke("openDocx", { file: "thesis-size test.docx", base64: docx }), () => [true, `${paras.length} paragraphs`]);
    const { convertLatexDocument } = await import("./latexInterchangeRun");
    // Cancel at the first progress step: the document must be exactly as before.
    const before = await state();
    await time(
      "Convert LaTeX, cancelled at the first progress step",
      async () => {
        await smoke("cancelNextProgress");
        return convertLatexDocument({ yes: true });
      },
      (r) => [!!r?.cancelled?.rolledBack, r?.cancelled ? (r.cancelled.rolledBack ? "undone, confirmed as before" : "undone, not confirmed") : "not cancelled"],
    );
    const afterCancel = await state();
    steps.push({ what: "…the document is exactly as before", ms: 0, ok: afterCancel === before, detail: afterCancel === before ? "identical" : "differs" });
    await time("Convert LaTeX (whole document)", () => convertLatexDocument({ yes: true }), (r) => [!!r && !r.cancelled && !r.guardFailed && r.failed.length === 0, r ? `${r.equations} equations, ${r.plan.counts.references} references; ${r.failed.length} left; ${Math.round((r.buildMs + r.writeMs - (r.numbersMs ?? 0)) / Math.max(1, r.equations))} ms per equation (building ${Math.round(r.buildMs / Math.max(1, r.equations))}, writing ${Math.round((r.writeMs - (r.numbersMs ?? 0)) / Math.max(1, r.equations))}); numbers and references at the end ${((r.numbersMs ?? 0) / 1000).toFixed(0)} s` : ""]);
    // Both ways of Update numbers on the same document (the faster safe one becomes the default).
    await time("Update numbers (each field on its own)", () => connector.request("updateNumbers", { method: "each" }, SLOW), (r) => [!r.guardFailed, `${r.numbers} numbers, ${r.references} references; fields ${((r.ms ?? 0) / 1000).toFixed(1)} s`]);
    await time("Update numbers (others locked, Word updates all)", () => connector.request("updateNumbers", { method: "locked" }, SLOW), (r) => [!r.guardFailed, `${r.numbers} numbers, ${r.references} references; fields ${((r.ms ?? 0) / 1000).toFixed(1)} s`]);
    await smoke("caretTo", { where: "start" }).catch(() => undefined);
    const sl = await import("./symbolListRun");
    await time("Insert the list of symbols", () => sl.updateSymbolList(), (r) => [r.rows > 0, `${r.rows} rows`]);
    const ds = await import("./docStyle");
    const styleRun = await import("./styleRun");
    const style = ds.activeStyle();
    const changed = { ...style, kinds: { ...style.kinds, label: style.kinds.label === "upright" ? "italic" : "upright" } } as typeof style;
    await ds.saveDocumentStyle(changed).catch(() => undefined);
    // A step that failed above (Word slow) must not end the test: each step below still runs and is timed.
    const beforeStyle = await state().catch((e: unknown) => `unreadable: ${e instanceof Error ? e.message : String(e)}`);
    await time(
      "Apply style, cancelled at the first progress step",
      async () => {
        await smoke("cancelNextProgress");
        return styleRun.applyStyleToDocument().then(
          () => "not cancelled",
          (e: unknown) => (e instanceof Error ? e.message : String(e)),
        );
      },
      (msg) => [/cancel|stopp/i.test(msg), msg.slice(0, 120)],
    );
    const afterStyleCancel = await state().catch(() => "unreadable (after)");
    steps.push({ what: "…the drawings are exactly as before", ms: 0, ok: afterStyleCancel === beforeStyle, detail: afterStyleCancel === beforeStyle ? "identical" : "differs" });
    await time("Apply style (every equation drawn again)", () => styleRun.applyStyleToDocument(), (r) => [true, `${r.equations} equations`]);
    const cd = await import("./checkDocumentRun");
    const check = await time("Check document", () => cd.runCheck(), (r) => [r.problems.length === 0, `${r.equations} equations, ${r.problems.length} problem(s)${r.problems.length ? `: ${r.problems.slice(0, 3).map((p) => p.message).join(" | ")}` : ""}`]);
    void check;
    const cs = await import("./changeSymbolRun");
    await time("Change symbol \\pvec{\\omega} → \\pvec{\\Omega} (read and preview)", async () => {
      const ctx = await cs.readForChange();
      const pv = await cs.previewChange(ctx, "\\pvec{\\omega}", "\\pvec{\\Omega}");
      if ("error" in pv) throw new Error(pv.error);
      const t1 = performance.now();
      const r = await cs.applyChange(ctx, pv.plan, { skip: new Set(), related: new Set() });
      steps.push({ what: "Change symbol: applying", ms: performance.now() - t1, ok: !r.cancelled && !r.guardFailed, detail: `${r.equations} equations, ${r.definitions} definition(s), list ${r.list ? "updated" : "—"}` });
      return pv.plan.counts;
    }, (c) => [c.equations > 0, `${c.equations} equations in the preview`]);
    await time("Save", () => smoke("save", { file: "thesis-size test.docx" }));
  } finally {
    await smoke("closeTestDocuments").catch(() => undefined);
    await smoke("end").catch(() => undefined);
  }
  return steps;
}

/** Ctrl+K: runs it and writes the report. */
export async function thesisTestCommand() {
  const app = useApp.getState();
  const { askConfirm } = await import("../components/Dialogs");
  if (!(await askConfirm("Thesis-size test", "Generate a generic document of about 300 pages (1500 equations, 1000 references) and run every whole-document operation on it, timed. It takes a while (about 20–40 minutes) and opens its own document; your documents are not touched.", "Run"))) return;
  const t0 = performance.now();
  const startedAt = new Date();
  const steps = await runThesisTest(1, (s) => app.notify(`Thesis-size test: ${s}…`));
  const r = await writeReport(thesisReport(steps, startedAt, performance.now() - t0));
  app.notify(`Thesis-size test finished: ${steps.filter((s) => s.ok === false).length} problem(s). Report: ${r?.path ?? "(not saved)"}`);
}
