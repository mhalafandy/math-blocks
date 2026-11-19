import { connector } from "./connector";
import { useApp } from "./store";

/**
 * Soak test (C4, Ctrl+K "Soak test…", optional, about 30 minutes): thousands of random but reproducible (seeded)
 * operations on two generic documents — insert, edit, delete, cut/copy/paste within and between the documents,
 * undo/redo, Convert LaTeX, Update numbers, Apply style, Change symbol, save, close and reopen. A model keeps what
 * each document's equations must be (their LaTeX, as a multiset); after every batch, Check document must be clean
 * and the equations must match the model. On a failure the report gives the seed and the last operations, so the
 * same run can be repeated exactly.
 */

const SLOW = 600_000;
const smoke = (op: string, params: Record<string, unknown> = {}) => connector.request("smoke", { op, ...params }, SLOW);

/** A small seeded generator (mulberry32): the same seed gives the same run. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T,>(xs: T[]) => xs[Math.floor(next() * xs.length)]! };
}

const POOL = ["x^2+y^2", "\\frac{a}{b}", "\\pvec{\\omega}\\times\\pvec{r}", "E=mc^2", "\\int_0^T f(t)\\,\\mathrm{d}t", "\\sum_{k=1}^{n}k", "\\mat{I}\\pvec{\\omega}", "v_0+at", "\\sqrt{x+1}", "\\pvec{\\omega}_{ba}"];

export type SoakOp = "insert" | "edit" | "delete" | "copyPaste" | "cutPaste" | "pasteOther" | "undo" | "redo" | "convert" | "updateNumbers" | "applyStyle" | "changeSymbol" | "saveReopen";

/** The model: each document's equations as a sorted list of LaTeX, and the undo/redo history of that. */
export interface SoakModel {
  docs: Record<string, string[]>;
  clipboard: string | null;
  undo: { docs: Record<string, string[]>; doc: string }[];
  redo: { docs: Record<string, string[]>; doc: string }[];
}

const sorted = (xs: string[]) => [...xs].sort();

export async function runSoak(o: { seed: number; operations: number; batch?: number; progress?: (s: string) => void }): Promise<{ ok: boolean; done: number; lines: string[] }> {
  const rnd = seeded(o.seed);
  const batch = o.batch ?? 25;
  const lines: string[] = [`Soak test — seed ${o.seed}, ${o.operations} operations, checked every ${batch}`];
  const log: string[] = [];
  const { interchangeDocx } = await import("./interchangeFixture");
  const { toBase64 } = await import("./render");
  const { buildInsertion, currentProfile } = await import("./equation");
  const { serializeLatex, parseLatex } = await import("@mathblocks/math-latex");
  const { readEquationXml } = await import("./readEquation");
  const norm = (l: string) => serializeLatex(parseLatex(l).root);
  await smoke("begin");
  const model: SoakModel = { docs: {}, clipboard: null, undo: [], redo: [] };
  const names: string[] = [];
  try {
    for (const f of ["soak A.docx", "soak B.docx"]) {
      const d = await smoke("openDocx", { file: f, base64: toBase64(interchangeDocx([{ style: "Normal", text: `Soak test document ${f}.` }])) });
      names.push(d.name as string);
      model.docs[d.name as string] = [];
    }
    const equationsOf = async (name: string) => {
      await smoke("activate", { name });
      const inst = (await connector.request("listInstances", { includeContent: true }, SLOW)).documents.find((x) => x.name === name)?.instances ?? [];
      return inst.map((i) => {
        const r = i.flatOpc ? readEquationXml(i.flatOpc) : null;
        return { tag: i.tag, latex: r ? serializeLatex(r.root) : "?" };
      });
    };
    const remember = (doc: string) => {
      model.undo.push({ docs: JSON.parse(JSON.stringify(model.docs)) as Record<string, string[]>, doc });
      model.redo = [];
    };
    const profile = currentProfile();
    let done = 0;
    for (let i = 0; i < o.operations; i++) {
      const doc = rnd.pick(names);
      const other = names.find((n) => n !== doc)!;
      await smoke("activate", { name: doc });
      const eqs = model.docs[doc]!;
      const op: SoakOp = rnd.pick(eqs.length ? (["insert", "insert", "edit", "delete", "copyPaste", "cutPaste", "pasteOther", "undo", "redo", "convert", "updateNumbers", "applyStyle", "changeSymbol", "saveReopen"] as SoakOp[]) : (["insert", "insert", "convert"] as SoakOp[]));
      const entry = `#${i + 1} ${op} in ${doc}`;
      try {
        if (op === "insert") {
          const latex = norm(rnd.pick(POOL));
          const display = rnd.next() < 0.5;
          await smoke("caretTo", { where: "end" });
          remember(doc);
          const { tag, flatOpc } = await buildInsertion(latex, display, profile, undefined, "classic");
          await connector.request("insertEquation", { flatOpc, tag, display, undoLabel: "Insert equation" }, SLOW);
          eqs.push(latex);
          log.push(`${entry}: ${latex}`);
        } else if (op === "edit" || op === "delete" || op === "copyPaste" || op === "cutPaste" || op === "pasteOther") {
          const live = await equationsOf(doc);
          if (!live.length) continue;
          const target = rnd.pick(live);
          if (op === "edit") {
            const latex = norm(rnd.pick(POOL));
            remember(doc);
            const { flatOpc } = await buildInsertion(latex, true, profile, target.tag, "classic");
            await connector.request("replaceEquation", { tag: target.tag, flatOpc, undoLabel: "Update equation" }, SLOW);
            eqs.splice(eqs.indexOf(target.latex), 1, latex);
            log.push(`${entry}: ${target.latex} → ${latex}`);
          } else if (op === "delete" || op === "cutPaste") {
            remember(doc);
            await smoke("cut", { tag: target.tag });
            eqs.splice(eqs.indexOf(target.latex), 1);
            model.clipboard = target.latex;
            if (op === "cutPaste") {
              remember(doc);
              await smoke("caretTo", { where: "end" });
              await smoke("paste", { mode: "ctrlV" });
              eqs.push(target.latex);
            }
            log.push(`${entry}: ${target.latex}`);
          } else {
            await smoke("copy", { tag: target.tag });
            model.clipboard = target.latex;
            const into = op === "pasteOther" ? other : doc;
            await smoke("activate", { name: into });
            await smoke("caretTo", { where: "end" });
            remember(into);
            await smoke("paste", { mode: "ctrlV" });
            model.docs[into]!.push(target.latex);
            log.push(`${entry}: ${target.latex} → ${into}`);
          }
        } else if (op === "undo") {
          const last = model.undo.pop();
          if (!last) continue;
          await smoke("activate", { name: last.doc });
          model.redo.push({ docs: JSON.parse(JSON.stringify(model.docs)) as Record<string, string[]>, doc: last.doc });
          await smoke("undo", { times: 1 });
          model.docs = last.docs;
          log.push(`${entry}: in ${last.doc}`);
        } else if (op === "redo") {
          const next = model.redo.pop();
          if (!next) continue;
          await smoke("activate", { name: next.doc });
          model.undo.push({ docs: JSON.parse(JSON.stringify(model.docs)) as Record<string, string[]>, doc: next.doc });
          await smoke("redo", { times: 1 });
          model.docs = next.docs;
          log.push(`${entry}: in ${next.doc}`);
        } else if (op === "convert") {
          const latex = norm(rnd.pick(POOL));
          await smoke("caretTo", { where: "end" });
          await smoke("newParagraph");
          await smoke("typeText", { text: `Typed: $${latex}$ here.` });
          // Typing is not a MathBlocks operation: the history before it no longer applies.
          model.undo = [];
          model.redo = [];
          const { convertLatexDocument } = await import("./latexInterchangeRun");
          remember(doc);
          const conv = await convertLatexDocument({ yes: true });
          // One Ctrl+Z must undo it: a record Word ended early is the failure, named where it ended.
          if (conv?.undoBrokenAt) throw new Error(`Convert LaTeX took more than one undo step (Word ended its record ${conv.undoBrokenAt})`);
          eqs.push(latex);
          log.push(`${entry}: $${latex}$`);
        } else if (op === "updateNumbers") {
          remember(doc);
          await connector.request("updateNumbers", {}, SLOW);
          log.push(entry);
        } else if (op === "applyStyle") {
          const ds = await import("./docStyle");
          const style = ds.activeStyle();
          await ds.saveDocumentStyle({ ...style, kinds: { ...style.kinds, label: style.kinds.label === "upright" ? "italic" : "upright" } } as typeof style);
          remember(doc);
          await (await import("./styleRun")).applyStyleToDocument();
          log.push(entry);
        } else if (op === "changeSymbol") {
          const cs = await import("./changeSymbolRun");
          const { changeInLatex, symbolTarget } = await import("./changeSymbol");
          const { activeStyle } = await import("./docStyle");
          const [from, to] = rnd.next() < 0.5 ? ["\\pvec{\\omega}", "\\pvec{\\Omega}"] : ["\\pvec{\\Omega}", "\\pvec{\\omega}"];
          const ctx = await cs.readForChange();
          const pv = await cs.previewChange(ctx, from, to);
          if ("error" in pv || !pv.plan.equations.length) continue;
          remember(doc);
          await cs.applyChange(ctx, pv.plan, { skip: new Set(), related: new Set() });
          const t = symbolTarget(from, activeStyle())!;
          const u = symbolTarget(to, activeStyle())!;
          model.docs[doc] = eqs.map((l) => changeInLatex(l, t, u, activeStyle()).latex);
          log.push(`${entry}: ${from} → ${to}`);
        } else if (op === "saveReopen") {
          const file = doc.replace(/\.docx$/i, "") + ".docx";
          await smoke("save", { file });
          await smoke("closeDocument", { name: doc, save: false });
          const re = await smoke("reopen", { file });
          if (re.name !== doc) {
            model.docs[re.name as string] = model.docs[doc]!;
            delete model.docs[doc];
            names[names.indexOf(doc)] = re.name as string;
          }
          // A reopened document has no undo history.
          model.undo = model.undo.filter((u) => u.doc !== doc);
          model.redo = model.redo.filter((u) => u.doc !== doc);
          log.push(entry);
        }
        done++;
      } catch (e) {
        lines.push(`FAIL  ${entry}: ${e instanceof Error ? e.message : String(e)}`, "Last operations:", ...log.slice(-20));
        return { ok: false, done, lines };
      }
      if ((i + 1) % batch === 0 || i === o.operations - 1) {
        o.progress?.(`${i + 1} / ${o.operations}`);
        const cd = await import("./checkDocumentRun");
        for (const name of names) {
          const live = (await equationsOf(name)).map((x) => x.latex);
          const want = model.docs[name] ?? [];
          if (JSON.stringify(sorted(live)) !== JSON.stringify(sorted(want))) {
            lines.push(`FAIL  after #${i + 1}: ${name}'s equations differ from the model`, `  in Word: ${sorted(live).join(" | ")}`, `  model:   ${sorted(want).join(" | ")}`, "Last operations:", ...log.slice(-20));
            return { ok: false, done, lines };
          }
          const check = await cd.runCheck();
          const bad = check.problems.filter((p) => p.group !== "style");
          if (bad.length) {
            lines.push(`FAIL  after #${i + 1}: Check document in ${name}: ${bad.map((p) => p.message).join(" | ")}`, "Last operations:", ...log.slice(-20));
            return { ok: false, done, lines };
          }
        }
        lines.push(`PASS  operations ${Math.max(1, i + 2 - batch)}–${i + 1}: both documents match the model and check clean`);
      }
    }
    lines.push(`All ${done} operations done; seed ${o.seed}.`);
    return { ok: true, done, lines };
  } finally {
    await smoke("closeTestDocuments").catch(() => undefined);
    await smoke("end").catch(() => undefined);
  }
}

/** Ctrl+K: asks for the seed (a new one by default), runs, writes "soak report.txt". */
export async function soakTestCommand() {
  const app = useApp.getState();
  const { askText } = await import("../components/Dialogs");
  const fresh = String(Math.floor(Math.random() * 1e9));
  const answer = await askText("Soak test (about 30 minutes, on its own two documents)", fresh, "Seed: the same seed repeats the same run exactly", "Run");
  if (answer === null) return;
  const seed = Number(answer) || Number(fresh);
  const r = await runSoak({ seed, operations: 1000, progress: (s) => app.notify(`Soak test: ${s}`) });
  const saved = (await smoke("writeFile", { file: "soak report.txt", text: r.lines.join("\r\n") }).catch(() => null)) as { path: string } | null;
  app.notify(`Soak test ${r.ok ? "passed" : "FAILED"} (${r.done} operations, seed ${seed}). Report: ${saved?.path ?? "(not saved)"}`, r.ok ? "info" : "error");
}
