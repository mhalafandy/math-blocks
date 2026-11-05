import { askConfirm } from "../components/Dialogs";
import { usesKinds } from "./kindStyles";
import { buildDocumentIndex, rewriteDocument } from "./symbolIndex";
import { useApp } from "./store";

/**
 * Redraws every equation of the open Word document that uses a kind, in the current notation
 * (after a kind's style changed). Safety layer: backup above 10 equations, stored previous XML
 * (Cancel restores), progress window, one undo step. Library equations need nothing: they are
 * drawn from their LaTeX whenever shown.
 */
export async function restyleDocument() {
  const app = useApp.getState();
  if (!app.connector.connected) return app.notify("Word is not connected.", "error");
  try {
    const index = await buildDocumentIndex();
    const eqs = index.equations.filter((e) => usesKinds(e.latex));
    if (!eqs.length) return app.notify(`No equation in “${index.name}” uses a notation kind.`);
    const ok = await askConfirm("Apply the notation to the document", `Redraw the ${eqs.length} equation(s) of “${index.name}” that use notation kinds in the current style? One Ctrl+Z in Word undoes it.`, "Redraw", false);
    if (!ok) return;
    const r = await rewriteDocument(index, eqs, (l) => l, "Apply notation", () => true);
    app.notify(`Redrew ${r.equations} equation(s) in the current notation.${r.note}`);
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e), "error");
  }
}
