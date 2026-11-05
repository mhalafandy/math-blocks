import { create } from "zustand";
import type { NumberedEquation } from "@mathblocks/connector-protocol";
import { serializeLatex } from "@mathblocks/math-latex";
import { readEquationXml as readOmml } from "./readEquation";
import { addinSupports, connector } from "./connector";
import { buildInsertion, currentProfile } from "./equation";
import { useApp, type NumberStyle } from "./store";

/**
 * Equation numbering and cross-references (M8). Numbers are Word fields (SEQ MBEq), each covered
 * by a hidden bookmark, so Word renumbers them and REF fields cross-reference them; MathType's
 * numbers (ZEqnNum bookmarks) can be referenced too.
 */

const SLOW = 120_000;

function requireAddin(method: string) {
  if (addinSupports(method)) return true;
  useApp.getState().notify("The MathBlocks add-in loaded in Word is too old for this. Close Word completely and start it again.", "error");
  return false;
}

/** Puts an equation that is already in Word into its own numbered paragraph. */
export async function numberInWord(tag: string, latex: string, expect?: string) {
  if (!requireAddin("numberEquation")) return null;
  const { flatOpc } = await buildInsertion(latex, false, currentProfile(), tag, undefined, true);
  const style = useApp.getState().numberStyle;
  return connector.request("numberEquation", { tag, flatOpc, expect, ...numberFormat(style) }, SLOW);
}

/** Removes an equation's number; it becomes a display (or inline) equation. */
export async function unnumberInWord(tag: string, latex: string, display: boolean, expect?: string) {
  if (!requireAddin("unnumberEquation")) return null;
  const { flatOpc } = await buildInsertion(latex, display, currentProfile(), tag);
  return connector.request("unnumberEquation", { tag, flatOpc, expect }, SLOW);
}

export async function updateNumbers() {
  const notify = useApp.getState().notify;
  if (!useApp.getState().connector.connected) return notify("Word is not connected.", "error");
  if (!requireAddin("updateNumbers")) return;
  try {
    const r = await connector.request("updateNumbers", {}, SLOW);
    notify(`Updated ${r.numbers} equation number(s) and ${r.references} reference(s)`);
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  }
}

/** Ribbon "Number equation": toggles the number of the equation the cursor is in. */
export async function toggleNumberFromRibbon(params: { tag?: string; flatOpc?: string; numbered?: boolean; fingerprint?: string; problem?: string } = {}, fromWord = false) {
  const { tell } = await import("./wordUi");
  const notify = (text: string, kind: "info" | "error" = "info") => tell(text, kind, fromWord);
  if (params.problem) {
    if (fromWord) notify(`${params.problem} Nothing was changed. Use Repair equations (MathBlocks tab) first.`, "error");
    return showWrapperProblem(params.problem);
  }
  if (!params.tag || !params.flatOpc) return notify("Click into a MathBlocks equation in Word first, then press Number equation.", "error");
  const read = readOmml(params.flatOpc);
  if (!read || !read.root.children.length) return notify("Could not read that equation.", "error");
  const latex = serializeLatex(read.root);
  try {
    // The content read from that equation goes back to that equation, verified by its fingerprint.
    if (params.numbered) {
      await unnumberInWord(params.tag, latex, true, params.fingerprint);
      notify("Number removed");
    } else {
      const r = await numberInWord(params.tag, latex, params.fingerprint);
      if (r) notify(`Numbered ${r.number}`);
    }
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  }
}

/** A wrapper that does not hold exactly one equation: say what it holds and offer Repair equations. */
export function showWrapperProblem(problem: string) {
  const app = useApp.getState();
  app.setNotice({
    text: `${problem} Nothing was changed. Repair equations gives every equation its own wrapper and moves text out.`,
    actions: [
      { label: "Repair equations", run: () => void import("./repair").then((m) => m.repairDocument()).then(() => useApp.getState().setNotice(null)) },
      { label: "Dismiss", run: () => useApp.getState().setNotice(null) },
    ],
  });
}

// ------------------------------------------------------------------ reference picker

export interface ReferenceItem extends NumberedEquation {
  latex: string | null;
}

export const useReferences = create<{ open: boolean; loading: boolean; items: ReferenceItem[]; set: (s: Partial<{ open: boolean; loading: boolean; items: ReferenceItem[] }>) => void }>(
  (set) => ({ open: false, loading: false, items: [], set: (s) => set(s) }),
);

export async function openReferencePicker() {
  const notify = useApp.getState().notify;
  const ui = useReferences.getState();
  if (!useApp.getState().connector.connected) return notify("Word is not connected.", "error");
  if (!requireAddin("listNumbered")) return;
  ui.set({ open: true, loading: true, items: [] });
  try {
    const r = await connector.request("listNumbered", { includeContent: true }, SLOW);
    const items = r.equations.map((e): ReferenceItem => {
      const read = e.flatOpc ? readOmml(e.flatOpc) : null;
      return { ...e, flatOpc: undefined, latex: read && read.root.children.length ? serializeLatex(read.root) : null };
    });
    ui.set({ loading: false, items });
  } catch (e) {
    ui.set({ open: false, loading: false });
    notify(e instanceof Error ? e.message : String(e), "error");
  }
}

/** The add-in's number format from the preferences. */
export function numberFormat(style: NumberStyle) {
  const parts = style.parts ?? (style.chapter ? "chapter" : "eq");
  return { open: style.open, close: style.close, chapter: parts !== "eq", parts, separator: style.separator ?? ".", restart: style.restart ?? "chapter", source: style.source ?? "headings" } as const;
}

/** Upgrade numbering: every MathBlocks number and reference becomes one field (backup first, one undo step). */
export async function upgradeNumbering() {
  const app = useApp.getState();
  if (!addinSupports("upgradeNumbering")) return app.notify("Restart Word to load the updated MathBlocks add-in first.", "error");
  const { backupIfMany } = await import("./docOps");
  try {
    const list = await connector.request("listNumbered", {}, SLOW);
    const ours = list.equations.filter((e) => e.kind === "mathblocks");
    if (!ours.length) return app.notify("No MathBlocks equation numbers in this document (MathType numbers are left as they are).");
    const backup = await backupIfMany(list.fullName, ours.length > 10 ? ours.length : 11);
    await connector.request("beginOperation", { document: list.fullName, title: "Upgrade numbering", total: ours.length, undoLabel: "Upgrade equation numbering" });
    try {
      const r = await connector.request("upgradeNumbering", { document: list.fullName, ...numberFormat(app.numberStyle) }, 600_000);
      app.notify(`Numbering upgraded: ${r.numbers} number(s) and ${r.references} reference(s) are now single fields; references still point at the same equations. One Ctrl+Z undoes it.${backup ? ` Backup: ${backup.split(/[\\/]/).pop()}` : ""}`);
    } finally {
      await connector.request("endOperation", { done: ours.length }).catch(() => undefined);
    }
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e), "error");
  }
}

/** Hidden chapter/section marker at Word's cursor (markers numbering source). */
export async function insertNumberMarker(o: { chapter: number; section: number; appendix: boolean }) {
  const app = useApp.getState();
  try {
    await connector.request("insertNumberMarker", { ...o, restartEquations: true });
    app.notify(`${o.appendix ? "Appendix" : "Chapter"} ${o.appendix ? String.fromCharCode(64 + o.chapter) : o.chapter}, section ${o.section} starts here: equation numbers after it restart.`);
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e), "error");
  }
}

export async function insertReference(item: ReferenceItem, numberOnly = useApp.getState().numberStyle.references === "number") {
  const notify = useApp.getState().notify;
  try {
    const r = await connector.request("insertReference", { bookmark: item.bookmark, numberOnly });
    useReferences.getState().set({ open: false });
    notify(`Inserted a reference to ${r.text || item.number}`);
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  }
}
