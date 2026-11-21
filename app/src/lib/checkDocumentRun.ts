import { parseLatex } from "@mathblocks/math-latex";
import { mathTypePadding, renderSvg } from "@mathblocks/math-render";
import { addinSupports, connector } from "./connector";
import { activeStyle, activeStyleHash, loadDocumentStyle } from "./docStyle";
import { replaceInDocument, type ReplaceItem } from "./docOps";
import { useApp } from "./store";
import { buildInsertion, currentProfile } from "./equation";
import { classicStyle, loadFonts } from "./render";
import { equationFacts, judgeDocument, repairPlan, type EquationFacts, type Problem } from "./checkDocument";

/**
 * Check document in Word: reads the equations (with their XML), the numbers and every field once, judges them
 * (checkDocument.ts), and repairs what the user ticks in one operation (one Ctrl+Z, guarded): pictures drawn again
 * from their LaTeX, markers hidden, numbers and references updated.
 */

export interface CheckResult {
  document: string;
  problems: Problem[];
  equations: number;
  ms: number;
  /** For repairs: each equation's form and stored XML (restored if the repair is cancelled). */
  forms: Map<string, { facts: EquationFacts; flatOpc?: string }>;
}

const SLOW = 600_000;

export async function runCheck(): Promise<CheckResult> {
  if (!addinSupports("checkFields")) throw new Error("The Word add-in is older than this version of MathBlocks: update it to use Check document.");
  const t0 = performance.now();
  await loadDocumentStyle();
  const [inst, numbered, fields] = await Promise.all([
    connector.request("listInstances", { includeContent: true, pages: false }, SLOW),
    connector.request("listNumbered", {}, SLOW),
    connector.request("checkFields", {}, SLOW),
  ]);
  const doc = inst.documents[0];
  if (!doc) throw new Error("No document is open in Word");
  const forms = new Map<string, { facts: EquationFacts; flatOpc?: string }>();
  const equations = doc.instances.map((i) => {
    const facts = i.flatOpc ? equationFacts(i.flatOpc) : ({ kind: "picture", source: null, alt: null, mode: "inline" } as EquationFacts);
    forms.set(i.tag, { facts, ...(i.flatOpc ? { flatOpc: i.flatOpc } : {}) });
    return { tag: i.tag, ...(i.start !== undefined ? { start: i.start } : {}), ...(i.story ? { story: i.story } : {}), facts };
  });
  const fonts = await loadFonts();
  const ms = activeStyle();
  const sizePt = ms.global.sizePt;
  const expectedSize = (latex: string, mode: EquationFacts["mode"]) => {
    try {
      const r = renderSvg(parseLatex(latex).root, { fonts, style: classicStyle(), display: mode !== "inline", sizePt, mathStyle: ms, padding: mathTypePadding(sizePt) });
      return { widthPt: r.widthPt, heightPt: r.heightPt };
    } catch {
      return null;
    }
  };
  const problems = judgeDocument({ equations, numbered: numbered.equations, fields, styleHash: activeStyleHash(), expectedSize });
  return { document: doc.fullName, problems, equations: equations.length, ms: performance.now() - t0, forms };
}

/** Repairs the chosen problems in one operation; returns what was done. */
export async function repairChosen(check: CheckResult, chosen: Set<string>): Promise<{ redrawn: number; hidden: number; numbersUpdated: boolean; cancelled: boolean; guardFailed?: string }> {
  const plan = repairPlan(check.problems, chosen);
  const profile = currentProfile();
  const items: ReplaceItem[] = [];
  for (const r of plan.redraw) {
    const form = check.forms.get(r.tag);
    if (!form) continue;
    const mode = form.facts.mode;
    items.push({ tag: r.tag, flatOpc: (await buildInsertion(r.latex, mode === "display", profile, r.tag, form.facts.kind === "native" ? "native" : "classic", mode !== "inline")).flatOpc, ...(form.flatOpc ? { previous: form.flatOpc } : {}) });
  }
  if (!items.length && !plan.hide.length && !plan.updateNumbers && !plan.unlockFields) return { redrawn: 0, hidden: 0, numbersUpdated: false, cancelled: false };
  let hidden = 0;
  const op = await replaceInDocument({
    document: check.document,
    title: "Repair (Check document)",
    undoLabel: "Repair (Check document)",
    items,
    total: items.length,
    // All inside the operation's single undo record: markers hidden first (by position), then numbers and
    // references updated (which can move positions), then the equations drawn again (by ID).
    prepare: async () => {
      if (plan.unlockFields && addinSupports("unlockFields")) {
        const u = await connector.request("unlockFields", { document: check.document });
        if (u.refused) useApp.getState().notify(u.refused, "error");
      }
      if (plan.hide.length) hidden = (await connector.request("hideFields", { document: check.document, starts: plan.hide })).hidden;
      if (plan.updateNumbers) await connector.request("updateNumbers", { document: check.document }, SLOW);
      return items;
    },
  });
  return { redrawn: op.replaced, hidden, numbersUpdated: plan.updateNumbers, cancelled: op.cancelled, ...(op.guardFailed ? { guardFailed: op.guardFailed } : {}) };
}
