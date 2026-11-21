import { backupIfMany } from "./docOps";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { askConfirm } from "../components/Dialogs";
import { confirmInWord, tell } from "./wordUi";
import { activateEquation, addinSupports, connector } from "./connector";
import { buildInsertion, currentProfile } from "./equation";
import { readEquationXml } from "./readEquation";
import { useApp } from "./store";

/**
 * Working from Word with the keyboard (keys in Settings, defaults in lib/wordKeys.ts): new inline / display equation,
 * edit the equation at the cursor, Toggle LaTeX, reference, number. Also: convert all LaTeX in a
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

/** How many LaTeX spans ($…$, $$…$$, \(…\), \[…\]) a text holds. */
export function countLatexSpans(text: string): number {
  return (text.match(/\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$]+\$/g) ?? []).length;
}

/** The LaTeX text an equation becomes (Toggle LaTeX). */
export function wrapLatex(latex: string, display: boolean) {
  const d = "$";
  return display ? `${d}${d}${latex}${d}${d}` : `${d}${latex}${d}`;
}

/** The equation at the cursor in the floating editor, or a new one there; `newOnly`: always a new one, inline or display. */
export async function editAtCursor(newOnly?: { display: boolean }) {
  if (!ready("selectionInfo")) return;
  try {
    await import("./docStyle").then((m) => m.loadDocumentStyle()).catch(() => undefined);
    const s = await connector.request("selectionInfo", {});
    const rect = s.rect ?? { left: 200, top: 200, width: 0, height: 0 };
    if (!newOnly && s.tag && (s.flatOpc || s.problem)) return activateEquation({ tag: s.tag, flatOpc: s.flatOpc ?? "", number: s.number ?? null, panel: rect, fingerprint: s.fingerprint, problem: s.problem });
    // A new equation at the cursor (selected LaTeX becomes its content).
    const app = useApp.getState();
    const { useLibrary } = await import("./library/useLibrary");
    useLibrary.getState().closeEquation();
    app.setEditing(null);
    const src = s.text ? unwrapLatex(s.text) : null;
    app.setLatex(src?.latex ?? "", "external");
    if (newOnly) app.setDisplay(newOnly.display);
    else if (src) app.setDisplay(src.display);
    const { openPanel } = await import("./panel");
    await openPanel(rect);
  } catch (e) {
    notify(errorText(e), "error");
  }
}

/** The keyboard shortcut of Toggle LaTeX in Word, as set in Settings. */
const toggleKeys = () => useApp.getState().wordKeys.latex || "the Toggle LaTeX button";

/**
 * Toggle LaTeX (ribbon button, its shortcut in Settings): the MathBlocks equation at the cursor, or every one in the selection,
 * becomes its LaTeX text; LaTeX text at the cursor or selected becomes the equation again, with the ID it had and
 * drawn numbered when its paragraph has a number. The number field, its bookmark and the references stay. One Ctrl+Z.
 */
export async function toggleLatexAtCursor() {
  if (!ready("selectionInfo")) return;
  try {
    const s = await connector.request("selectionInfo", {});
    const many = s.selectedTags && s.selectedTags.length > 1 ? s.selectedTags : null;
    if ((many || (s.tag && s.flatOpc)) && addinSupports("equationsToText")) {
      const tags = many ?? [s.tag!];
      const content = new Map<string, { flatOpc?: string; numbered: boolean }>();
      if (many) {
        const inst = (await connector.request("listInstances", { document: s.document, includeContent: true }, 600_000)).documents[0]?.instances ?? [];
        for (const i of inst) content.set(i.tag, { flatOpc: i.flatOpc ?? undefined, numbered: !!i.number });
      } else content.set(s.tag!, { flatOpc: s.flatOpc, numbered: !!s.number });
      const items: { tag: string; text: string }[] = [];
      for (const tag of tags) {
        const c = content.get(tag);
        const read = c?.flatOpc ? readEquationXml(c.flatOpc) : null;
        if (!read) return notify(`Could not read the equation ${tag}; nothing was changed.`, "error");
        items.push({ tag, text: wrapLatex(serializeLatex(read.root), read.display || read.numbered === true || c!.numbered) });
      }
      const r = await connector.request("equationsToText", { document: s.document, items });
      if (r.guardFailed) return notify(`Toggle LaTeX was undone: ${r.guardFailed}`, "error");
      return notify(items.length === 1 ? `Equation turned into LaTeX. Edit it, then press ${toggleKeys()} again.` : `${items.length} equations turned into LaTeX.`);
    }
    if (s.tag && s.flatOpc) {
      const read = readEquationXml(s.flatOpc);
      if (!read) return notify("Could not read that equation.", "error");
      const text = wrapLatex(serializeLatex(read.root), read.display || !!s.number);
      await connector.request("equationToText", { document: s.document, tag: s.tag, text });
      return notify(`Equation turned into LaTeX. Edit it, then press ${toggleKeys()} again.`);
    }
    // Several LaTeX spans selected: each becomes an equation (as Convert LaTeX on the selection).
    if (s.text && s.start !== undefined && s.end !== undefined && countLatexSpans(s.text) > 1) {
      await convertAllLatex(s.document, { fromWord: true, selectionOnly: true });
      return;
    }
    if (s.text && s.start !== undefined && s.end !== undefined) {
      const { latex, display } = unwrapLatex(s.text);
      if (parseLatex(latex).diagnostics.some((d) => d.severity === "error")) return notify("That LaTeX has errors; fix it first.", "error");
      // Back with the ID it had as an equation, and drawn as a numbered equation next to its number.
      const numbered = !!s.numbered && display;
      const { flatOpc } = await buildInsertion(latex, numbered ? false : display, currentProfile(), s.textTag, undefined, display);
      await connector.request("replaceRanges", { document: s.document, items: [{ start: s.start, end: s.end, expect: s.text, flatOpc }], undoLabel: "LaTeX to equation" });
      return notify("LaTeX turned into a MathBlocks equation");
    }
    notify("Put the cursor in a MathBlocks equation, or in LaTeX written between dollar signs (or select the LaTeX).");
  } catch (e) {
    notify(errorText(e), "error");
  }
}

/** Numbers (or un-numbers) the equation at the cursor (its shortcut in Settings). */
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

/**
 * Converts LaTeX spans (dollars, \( \), \[ \]) into equations: the selection's when the command
 * came from Word with a selection (as MathType's Alt+\), otherwise the whole document. LaTeX that
 * was typed into an equation's wrapper is first moved out of it (Repair equations), then converted.
 * Started from Word, it finishes in Word: the question and the result appear over Word.
 */
export async function convertAllLatex(document?: string, o: { fromWord?: boolean; selectionOnly?: boolean; /** No confirmation (the self-test). */ yes?: boolean } = {}) {
  await import("./docStyle").then((m) => m.loadDocumentStyle(document)).catch(() => undefined);
  // A whole document: the interchange conversion (display paragraphs, numbers, labels, references,
  // numbering markers; pre-flight report first). A selection keeps the simple conversion below.
  if (!o.selectionOnly && addinSupports("scanInterchange")) {
    const { convertLatexDocument } = await import("./latexInterchangeRun");
    await convertLatexDocument({ ...(document ? { document } : {}), ...(o.fromWord ? { fromWord: true } : {}), ...(o.yes ? { yes: true } : {}) });
    return;
  }
  if (!ready("findLatex")) return;
  const fromWord = !!o.fromWord;
  const say = (text: string, kind: "info" | "error" = "info") => tell(text, kind, fromWord);
  try {
    const target = { ...(document ? { document } : {}), ...(o.selectionOnly ? { selectionOnly: true } : {}) };
    let found = await connector.request("findLatex", target, 120_000);
    if (found.insideWrapper) {
      // Text typed at an equation's edge went into its wrapper: give it back to the text first.
      const { repairDocument } = await import("./repair");
      await repairDocument(found.fullName, { quiet: true });
      found = await connector.request("findLatex", target, 120_000);
    }
    const why = [found.skippedInside ? `${found.skippedInside} inside equations or fields` : "", found.notLocated ? `${found.notLocated} that Word could not locate (see connector.log)` : ""].filter(Boolean).join(", ");
    const where = found.selection ? "the selection" : `“${found.name}”`;
    if (!found.items.length) return say(`No LaTeX found in ${where} to convert (expressions between dollar signs, \\( \\) or \\[ \\])${why ? `; skipped: ${why}` : ""}.`, why ? "error" : "info");
    const ok = o.yes || await confirmInWord(
      "Convert LaTeX to equations",
      `Convert ${found.items.length} LaTeX expression(s) in ${where} into MathBlocks equations? One Ctrl+Z in Word undoes it.`,
      "Convert",
      fromWord,
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
    if ("guardFailed" in r && r.guardFailed) {
      const { guardMessage } = await import("./docOps");
      return say(guardMessage("Convert LaTeX", r.guardFailed, !!r.guardRestored), "error");
    }
    say(
      `Converted ${r.replaced} LaTeX expression(s)${bad ? `; ${bad} with errors left as text` : ""}${r.skipped ? `; ${r.skipped} changed meanwhile and were skipped` : ""}${why ? `; skipped: ${why}` : ""}`,
      bad || r.skipped ? "error" : "info",
    );
  } catch (e) {
    say(errorText(e), "error");
  }
}

let started = false;

/** Main window: reacts to the Ctrl+Alt shortcuts pressed in Word (registered by the shell). */
export async function initWordShortcuts() {
  if (started) return;
  started = true;
  const { listen } = await import("@tauri-apps/api/event");
  await listen("shortcut://edit", () => void editAtCursor());
  await listen("shortcut://inline", () => void editAtCursor({ display: false }));
  await listen("shortcut://display", () => void editAtCursor({ display: true }));
  // The set from Settings replaces the shell's defaults (and again whenever it changes).
  const { applyWordKeys } = await import("./wordKeys");
  let last = "";
  const send = (keys: Record<string, string>) => {
    const k = JSON.stringify(keys);
    if (k === last) return;
    last = k;
    void applyWordKeys(keys).then((failed) => {
      if (failed.length) notify(`Some Word shortcuts could not be registered: ${failed.join("; ")}`, "error");
    });
  };
  send(useApp.getState().wordKeys);
  useApp.subscribe((st) => send(st.wordKeys));
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
