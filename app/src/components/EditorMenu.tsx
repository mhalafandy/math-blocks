import type { MathfieldElement } from "mathlive";
import { KIND_BY_ID, KINDS } from "@mathblocks/math-core";
import { openMenu, type MenuItem } from "./ContextMenu";
import { convertKindToPlain, makeKindFromSelection } from "./MathEditor";
import { kindAt, type KindField } from "../lib/kindExit";

/** Kinds a selection can be made into (one symbol argument). */
const makeable = () => KINDS.filter((k) => k.args === 1 && k.id !== "diff" && k.id !== "frm");

/** The equation editor's right-click menu. */
export function openEditorMenu(mf: MathfieldElement, e: MouseEvent) {
  // The caret goes where the click was (a selection stays as it is).
  if (mf.selectionIsCollapsed) {
    try {
      const off = mf.getOffsetFromPoint(e.clientX, e.clientY);
      if (off >= 0) mf.position = off;
    } catch {
      // Keep the caret.
    }
  }
  mf.focus();
  const k = kindAt(mf as unknown as KindField);
  const def = k ? KIND_BY_ID.get(k.id) : undefined;
  const at = { clientX: e.clientX, clientY: e.clientY, preventDefault: () => undefined };
  const items: MenuItem[] = [];
  if (def) {
    items.push(
      { label: `${def.name}: edit kind style…`, onSelect: () => void import("./NotationSettings").then((m) => m.openNotationSettings(def.id)) },
      { label: "Convert to plain (hand-styled)", onSelect: () => void convertKindToPlain() },
      { separator: true, label: "" },
    );
  }
  items.push(
    {
      label: mf.selectionIsCollapsed ? "Make the symbol before the cursor a kind…" : "Make the selection a kind…",
      onSelect: () => openMenu(at, makeable().map((x) => ({ label: `Make → ${x.name}`, onSelect: () => void makeKindFromSelection(x.id) }))),
    },
    { label: "Notation settings…", onSelect: () => void import("./NotationSettings").then((m) => m.openNotationSettings(def?.id ?? null)) },
  );
  openMenu(at, items);
}
