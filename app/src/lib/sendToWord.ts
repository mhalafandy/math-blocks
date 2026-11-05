import type { StyleProfile } from "@mathblocks/math-omml";
import { connector } from "./connector";
import { buildInsertion } from "./equation";
import { isDirty, useLibrary } from "./library/useLibrary";
import { insertLinked } from "./linking";
import { numberInWord, unnumberInWord } from "./numbering";
import { useApp } from "./store";

/**
 * "Insert into Word" / "Update in Word" (Ctrl+Enter, and Apply in the floating editor). With an
 * equation opened from Word, it updates that equation — verified by the fingerprint it had when
 * opened — and the edit target then ends, so the next press inserts a new equation.
 */
export async function setNumberOf(tag: string, latex: string, numbered: boolean, display: boolean, expect?: string) {
  const st = useApp.getState();
  if (numbered) {
    const r = await numberInWord(tag, latex, expect);
    if (r) st.notify(`Numbered ${r.number}`);
  } else {
    await unnumberInWord(tag, latex, display, expect);
    st.notify("Number removed");
  }
  const ed = useApp.getState().editing;
  if (ed?.tag === tag) st.setEditing({ ...ed, numbered });
};

export async function sendToWord(o: { errors: number; profile: StyleProfile }) {
  const profile = o.profile;
    const { connector: c, latex, display, notify, editing, setEditing } = useApp.getState();
    if (!c.available) return notify("Sending to Word works in the desktop app.", "error");
    if (!c.connected) return notify("Word is not connected. Start Word with the MathBlocks add-in installed.", "error");
    if (o.errors > 0) return notify("Fix the LaTeX errors first.", "error");
    try {
      const lib = useLibrary.getState();
      const libEq = lib.open ? lib.equations.find((q) => q.id === lib.open!.id) : undefined;
      const dirty = isDirty(lib.open, latex, display);
      const { numbered } = useApp.getState();
      const shape = display && !numbered; // display paragraph; numbered equations are inline math
      if (editing?.blockId && libEq) {
        // A linked copy: save a new library version; every copy (this one included) follows.
        if (dirty) await lib.saveCurrent();
        else if (!!editing.numbered === numbered) notify("No changes: the linked copies already show this version");
        if (!!editing.numbered !== numbered) await setNumberOf(editing.tag, latex, numbered, display, editing.fingerprint);
        // The edit is done: the next press inserts a new equation (no stale target).
        setEditing(null);
      } else if (editing) {
        if (!!editing.numbered !== numbered) {
          await setNumberOf(editing.tag, latex, numbered, display, editing.fingerprint);
        } else {
          const { flatOpc } = await buildInsertion(latex, shape, profile, editing.tag, undefined, display);
          const r = await connector.request("replaceEquation", { tag: editing.tag, flatOpc, undoLabel: "Update equation", expect: editing.fingerprint });
          if (useApp.getState().look === "native") void import("./nativeSources").then((m) => m.recordNativeSources(undefined, [{ tag: editing.tag, latex }]));
          notify(r.found === 1 ? "Equation updated in Word" : `Updated, but found ${r.found} copies of its tag`);
        }
        // The edit is done: the next press inserts a new equation (no stale target).
        setEditing(null);
      } else if (libEq && !dirty) {
        const found = await insertLinked(libEq);
        notify(found === 1 ? `Inserted a linked copy of “${libEq.name}”` : `Inserted, but found ${found} copies of its tag`);
        void lib.markUsed(libEq.id);
      } else {
        const { tag, flatOpc } = await buildInsertion(latex, shape, profile, undefined, undefined, display);
        const r = await connector.request("insertEquation", { tag, flatOpc, display: shape, undoLabel: "Insert equation" });
        if (useApp.getState().look === "native") void import("./nativeSources").then((m) => m.recordNativeSources(undefined, [{ tag, latex }]));
        let numberText = "";
        if (numbered) numberText = (await numberInWord(tag, latex))?.number ?? "";
        notify(
          libEq
            ? "Inserted as an unlinked copy because of unsaved changes. Save (Ctrl+S) first to insert a linked copy."
            : r.found === 1 ? `Inserted into Word${numberText ? ` as ${numberText}` : ""}` : `Inserted, but found ${r.found} copies of its tag`,
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      notify(message, "error");
      // Not the same equation any more (or gone): never retry against it.
      if (editing && /no longer in the document|Not changed:/.test(message)) setEditing(null);
    }
}
