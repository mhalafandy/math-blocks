import { backupIfMany } from "./docOps";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { askConfirm } from "../components/Dialogs";
import { activateEquation, addinSupports, connector } from "./connector";
import { buildInsertion, currentProfile } from "./equation";
import { readEquationXml } from "./readEquation";
import { useApp } from "./store";

/**
 * Working from Word with the keyboard: Ctrl+Alt+M edit/new equation at the cursor, Ctrl+Alt+L
 * equation ↔ LaTeX, Ctrl+Alt+R reference, Ctrl+Alt+N number. Also: convert all LaTeX in a
 * document into MathBlocks equations.
 */

const notify = (text: string, kind: "info" | "error" = "info") => useApp.getState().notify(text, kind);
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function ready(method: string) {
  if (!useApp.getState().connector.connected) {
    notify("Word is not connected.", "error");
    return false;
  }
  if (!addinSupports(method)) {
    notify("The MathBlocks add-in loaded in Word is too old for this. Close Word completely and start it again.", "error");
    return false;
  }
  return true;
}

const DISPLAY_DOLLARS = /^\$\$([\s\S]+)\$\$$/;
const DISPLAY_BRACKETS = /^\\\[([\s\S]+)\\\]$/;
const INLINE_DOLLAR = /^\$([\s\S]+)\$$/;
const INLINE_PARENS = /^\\\(([\s\S]+)\\\)$/;

/** "$x$" → x (inline); "$$x$$", "\[x\]" → display; anything else is taken as LaTeX as is. */
export function unwrapLatex(text: string): { latex: string; display: boolean } {
  const t = text.trim();
  let m = DISPLAY_DOLLARS.exec(t) ?? DISPLAY_BRACKETS.exec(t);
  if (m) return { latex: m[1]!.trim(), display: true };
  m = INLINE_DOLLAR.exec(t) ?? INLINE_PARENS.exec(t);
  if (m) return { latex: m[1]!.trim(), display: false };
  return { latex: t, display: false };
}

/** The LaTeX text an equation becomes (Ctrl+Alt+L). */
export function wrapLatex(latex: string, display: boolean) {
  const d = "$";
  return display ? `${d}${d}${latex}${d}${d}` : `${d}${latex}${d}`;
}

/** Ctrl+Alt+M: the equation at the cursor in the floating editor, or a new one there. */
export async function editAtCursor() {
  if (!ready("selectionInfo")) return;
  try {
    const s = await connector.request("selectionInfo", {});
    const rect = s.rect ?? { left: 200, top: 200, width: 0, height: 0 };
    if (s.tag && s.flatOpc) return activateEquation({ tag: s.tag, flatOpc: s.flatOpc, number: s.number ?? null, panel: rect });
    // A new equation at the cursor (selected LaTeX becomes its content).
    const app = useApp.getState();
    const { useLibrary } = await import("./library/useLibrary");
    useLibrary.getState().closeEquation();
    app.setEditing(null);
    const src = s.text ? unwrapLatex(s.text) : null;
    app.setLatex(src?.latex ?? "", "external");
    if (src) app.setDisplay(src.display);
    const { openPanel } = await import("./panel");
    await openPanel(rect);
  } catch (e) {
    notify(errorText(e), "error");
  }
}

/** Ctrl+Alt+L: a MathBlocks equation becomes its LaTeX text; LaTeX text becomes an equation. */
export async function toggleLatexAtCursor() {
  if (!ready("selectionInfo")) return;
  try {
    const s = await connector.request("selectionInfo", {});
    if (s.tag && s.flatOpc) {
      const read = readEquationXml(s.flatOpc);
      if (!read) return notify("Could not read that equation.", "error");
      const text = wrapLatex(serializeLatex(read.root), read.display || !!s.number);
      await connector.request("equationToText", { document: s.document, tag: s.tag, text });
      return notify("Equation turned into LaTeX. Edit it, then press Ctrl+Alt+L again.");
    }
    if (s.text && s.start !== undefined && s.end !== undefined) {
      const { latex, display } = unwrapLatex(s.text);
      if (parseLatex(latex).diagnostics.some((d) => d.severity === "error")) return notify("That LaTeX has errors; fix it first.", "error");
      const { flatOpc } = await buildInsertion(latex, display, currentProfile(), undefined, undefined, display);
      await connector.request("replaceRanges", { document: s.document, items: [{ start: s.start, end: s.end, expect: s.text, flatOpc }], undoLabel: "LaTeX to equation" });
      return notify("LaTeX turned into a MathBlocks equation");
    }
    notify("Put the cursor in a MathBlocks equation, or in LaTeX written between dollar signs (or select the LaTeX).");
  } catch (e) {
    notify(errorText(e), "error");
  }
}

/** Ctrl+Alt+N: numbers (or un-numbers) the equation at the cursor. */
export async function numberAtCursor() {
  if (!ready("selectionInfo")) return;
  try {
    const s = await connector.request("selectionInfo", {});
    const { toggleNumberFromRibbon } = await import("./numbering");
    await toggleNumberFromRibbon({ tag: s.tag, flatOpc: s.flatOpc, numbered: !!s.number });
  } catch (e) {
    notify(errorText(e), "error");
  }
}

/** Converts every LaTeX span (dollars, \( \), \[ \]) of the document into equations. */
export async function convertAllLatex(document?: string) {
  if (!ready("findLatex")) return;
  try {
    const found = await connector.request("findLatex", document ? { document } : {}, 120_000);
    const why = [found.skippedInside ? `${found.skippedInside} inside equations or fields` : "", found.notLocated ? `${found.notLocated} that Word could not locate (see connector.log)` : ""].filter(Boolean).join(", ");
    console.info("convert LaTeX:", found.items.length, "span(s)", why);
    if (!found.items.length) return notify(`No LaTeX found in “${found.name}” to convert (expressions between dollar signs, \\( \\) or \\[ \\])${why ? `; skipped: ${why}` : ""}.`, why ? "error" : "info");
    const ok = await askConfirm(
      "Convert LaTeX to equations",
      `Turn the ${found.items.length} LaTeX expression(s) in “${found.name}” into MathBlocks equations? One Ctrl+Z in Word undoes it.`,
      "Convert",
      false,
    );
    if (!ok) return;
    const profile = currentProfile();
    const items: { start: number; end: number; expect: string; flatOpc: string }[] = [];
    let bad = 0;
    for (const it of found.items) {
      const { latex, display } = unwrapLatex(it.text);
      if (!latex || parseLatex(latex).diagnostics.some((d) => d.severity === "error")) {
        bad++;
        continue;
      }
      // Display LaTeX alone in its paragraph becomes a display equation; elsewhere it stays in the line.
      const { flatOpc } = await buildInsertion(latex, display && it.alone, profile, undefined, undefined, display);
      items.push({ start: it.start, end: it.end, expect: it.text, flatOpc });
    }
    await backupIfMany(found.fullName, items.length);
    const r = items.length ? await connector.request("replaceRanges", { document: found.fullName, items, undoLabel: "Convert LaTeX to equations" }, 600_000) : { replaced: 0, skipped: 0 };
    notify(
      `Converted ${r.replaced} LaTeX expression(s)${bad ? `; ${bad} with errors left as text` : ""}${r.skipped ? `; ${r.skipped} changed meanwhile and were skipped` : ""}`,
      bad || r.skipped ? "error" : "info",
    );
  } catch (e) {
    notify(errorText(e), "error");
  }
}

let started = false;

/** Main window: reacts to the Ctrl+Alt shortcuts pressed in Word (registered by the shell). */
export async function initWordShortcuts() {
  if (started) return;
  started = true;
  const { listen } = await import("@tauri-apps/api/event");
  await listen("shortcut://edit", () => void editAtCursor());
  await listen("shortcut://latex", () => void toggleLatexAtCursor());
  await listen("shortcut://number", () => void numberAtCursor());
  await listen("shortcut://reference", async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    await w.unminimize();
    await w.show();
    await w.setFocus();
    const { openReferencePicker } = await import("./numbering");
    await openReferencePicker();
  });
}
