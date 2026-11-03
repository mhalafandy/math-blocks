import { create } from "zustand";
import type { NumberedEquation } from "@mathblocks/connector-protocol";
import { serializeLatex } from "@mathblocks/math-latex";
import { readOmml } from "@mathblocks/math-omml";
import { addinSupports, connector } from "./connector";
import { buildInsertion, currentProfile } from "./equation";
import { useApp } from "./store";

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
export async function numberInWord(tag: string, latex: string) {
  if (!requireAddin("numberEquation")) return null;
  const { flatOpc } = buildInsertion(latex, false, currentProfile(), tag);
  const style = useApp.getState().numberStyle;
  return connector.request("numberEquation", { tag, flatOpc, open: style.open, close: style.close, chapter: style.chapter }, SLOW);
}

/** Removes an equation's number; it becomes a display (or inline) equation. */
export async function unnumberInWord(tag: string, latex: string, display: boolean) {
  if (!requireAddin("unnumberEquation")) return null;
  const { flatOpc } = buildInsertion(latex, display, currentProfile(), tag);
  return connector.request("unnumberEquation", { tag, flatOpc }, SLOW);
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
export async function toggleNumberFromRibbon(params: { tag?: string; flatOpc?: string; numbered?: boolean } = {}) {
  const notify = useApp.getState().notify;
  if (!params.tag || !params.flatOpc) return notify("Click into a MathBlocks equation in Word first, then press Number equation.", "error");
  const read = readOmml(params.flatOpc);
  if (!read || !read.root.children.length) return notify("Could not read that equation.", "error");
  const latex = serializeLatex(read.root);
  try {
    if (params.numbered) {
      await unnumberInWord(params.tag, latex, true);
      notify("Number removed");
    } else {
      const r = await numberInWord(params.tag, latex);
      if (r) notify(`Numbered ${r.number}`);
    }
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  }
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

export async function insertReference(item: ReferenceItem) {
  const notify = useApp.getState().notify;
  try {
    const r = await connector.request("insertReference", { bookmark: item.bookmark });
    useReferences.getState().set({ open: false });
    notify(`Inserted a reference to ${r.text || item.number}`);
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  }
}
