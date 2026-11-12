import { backupIfMany } from "./docOps";
import { create } from "zustand";
import type { ConvertResult } from "@mathblocks/mathtype";
import type { ConvertedEquation, PictureData } from "@mathblocks/mathtype";
import type { MathTypeActivatedParams, MathTypeParagraph } from "@mathblocks/connector-protocol";
import { askConfirm } from "../components/Dialogs";
import { addinSupports, connector, isDesktop } from "./connector";
import { currentProfile } from "./equation";
import { useApp } from "./store";

/** Result shown in the conversion report dialog. */
export interface ConversionReport {
  source: string;
  output: string | null;
  result: Omit<ConvertResult, "docx">;
  /** Browser builds: the converted file to download. */
  download?: Blob;
  /** Converted in the open Word document (not a file). */
  inPlace?: boolean;
}

interface ConversionUi {
  busy: boolean;
  progress: string | null;
  report: ConversionReport | null;
  set: (s: Partial<Omit<ConversionUi, "set">>) => void;
}

export const useConversion = create<ConversionUi>((set) => ({
  busy: false,
  progress: null,
  report: null,
  set: (s) => set(s),
}));

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** "C:\\thesis\\ch1.docx" → "C:\\thesis\\ch1 (MathBlocks).docx" */
export function outputPathFor(path: string) {
  return path.replace(/(\.docx|\.docm)?$/i, (ext) => ` (MathBlocks)${ext || ".docx"}`);
}

/**
 * Converts the MathType equations of a Word document into native MathBlocks equations.
 * The original file is never changed: the result is saved as a new document.
 */
export async function convertMathTypeDocument() {
  const notify = useApp.getState().notify;
  const ui = useConversion.getState();
  if (ui.busy) return;
  try {
    let source: string;
    let bytes: Uint8Array;
    if (isDesktop()) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({ title: "Convert MathType equations: choose a Word document", multiple: false, filters: [{ name: "Word document", extensions: ["docx", "docm"] }] });
      if (!picked || Array.isArray(picked)) return;
      source = picked;
      const { invoke } = await import("@tauri-apps/api/core");
      bytes = new Uint8Array(await invoke<ArrayBuffer>("document_read", { path: source }));
    } else {
      const f = await pickFile();
      if (!f) return;
      source = f.name;
      bytes = new Uint8Array(await f.arrayBuffer());
    }

    ui.set({ busy: true });
    // Let the "Converting…" state paint before the (synchronous) conversion runs.
    await new Promise((r) => setTimeout(r, 30));
    const { convertDocx } = await import("@mathblocks/mathtype");
    const { kindTransform } = await import("./kindRules");
    const plan = convertDocx(bytes, { profile: currentProfile(), transform: kindTransform });
    let docx = plan.docx;
    const { docx: _unused, ...result } = plan;
    void _unused;
    if (useApp.getState().look === "classic" && plan.converted) {
      // Classic: typeset every equation, then convert again placing the pictures.
      const pics = await renderAll(plan.equations, (done) => ui.set({ progress: `Typesetting equations… ${done} / ${plan.converted}` }));
      let k = 0;
      // Same IDs as the planning run: each picture's hidden source already carries its ID.
      docx = convertDocx(bytes, { profile: currentProfile(), picture: () => pics[k++] ?? null, tags: plan.equations.map((e) => e.tag), transform: kindTransform }).docx;
    }
    if (result.equations.length === 0) {
      ui.set({ busy: false });
      notify(`No MathType equations found in ${baseName(source)}`);
      return;
    }

    let output: string | null = null;
    let download: Blob | undefined;
    if (result.converted > 0) {
      if (isDesktop()) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        output = await save({ title: "Save the converted document as", defaultPath: outputPathFor(source), filters: [{ name: "Word document", extensions: ["docx"] }] });
        if (output && output.toLowerCase() === source.toLowerCase()) {
          ui.set({ busy: false });
          notify("Please save the converted document under a new name: the original stays as a backup.", "error");
          return;
        }
        if (output) {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("document_write", docx, { headers: { "x-path": encodeURIComponent(output) } });
        }
      } else {
        output = baseName(outputPathFor(source));
        download = new Blob([docx as BlobPart], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      }
      if (!output) {
        ui.set({ busy: false });
        return;
      }
    }
    ui.set({ busy: false, report: { source, output, result, download } });
  } catch (e) {
    ui.set({ busy: false });
    notify(e instanceof Error ? e.message : String(e), "error");
  }
}

export async function openConvertedDocument(path: string) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("document_open", { path });
  } catch (e) {
    useApp.getState().notify(e instanceof Error ? e.message : String(e), "error");
  }
}

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".docx,.docm";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

/** Classic pictures for the converted equations, in order (skipped ones have none). */
async function renderAll(equations: ConvertedEquation[], progress?: (done: number) => void): Promise<PictureData[]> {
  const { renderPicture } = await import("./render");
  const size = useApp.getState().equationSizePt;
  const out: PictureData[] = [];
  for (const e of equations) {
    if (e.status !== "converted" || !e.latex) continue;
    // The ID goes into the hidden source too, so the equation is still known if its alt text is edited.
    const mode = e.display ? (e.number ? "numbered" : "display") : "inline";
    const p = await renderPicture(e.latex, e.display, size, mode, false, { tag: e.tag ?? null });
    // Written as an embedded MathBlocks object (as MathType's were), its data inside.
    const { objectBin } = await import("./equation");
    const { CLASSIC } = await import("@mathblocks/math-render");
    const object = e.tag
      ? objectBin({ version: 1, latex: e.latex, mode, tag: e.tag, depthPt: p.depthPt, widthPt: p.widthPt, heightPt: p.heightPt, sizePt: size, style: CLASSIC.id, block: null })
      : undefined;
    out.push({ emf: p.emf, svg: p.svg, png: p.png, widthPt: p.widthPt, heightPt: p.heightPt, depthPt: p.depthPt, object });
    if (progress && out.length % 10 === 0) progress(out.length);
  }
  return out;
}

// ------------------------------------------------------------------ in the open Word document

const PAGE = 15;
const SLOW = 180_000;

async function convertParagraphs(paragraphs: MathTypeParagraph[], equations: ConvertedEquation[]) {
  const { convertFlatOpc } = await import("@mathblocks/mathtype");
  const { kindTransform } = await import("./kindRules");
  const { buildObjectInsertion, buildNativeInsertion } = await import("./equation");
  const profile = currentProfile();
  const classic = useApp.getState().look === "classic";
  const items: MathTypeParagraph[] = [];
  for (const p of paragraphs) {
    // The conversion reads each MathType object (LaTeX, display or inline, its number); what goes into
    // Word is one equation per object, replacing only that object — never the paragraph, whose
    // properties (MTDisplayEquation's tab stops, spacing…) must stay exactly as they are.
    const r = convertFlatOpc(p.flatOpc, { profile, transform: kindTransform });
    const packages: (string | null)[] = [];
    for (const e of r.equations) {
      if (e.status !== "converted" || !e.latex || !e.tag) {
        packages.push(null);
        continue;
      }
      const mode = e.display ? (e.number ? "numbered" : "display") : "inline";
      packages.push(
        classic
          ? (await buildObjectInsertion(e.latex, e.display, e.tag, e.display, { keepParagraph: true, mode })).flatOpc
          : buildNativeInsertion(e.latex, false, profile, e.tag).flatOpc,
      );
    }
    // Where each equation is, for the report: its paragraph's text, or the paragraph before an equation alone in its own.
    const own = [...p.flatOpc.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("").replace(/\s+/g, " ").trim();
    const where = own ? `“${own.length > 70 ? `${own.slice(0, 70)}…` : own}”` : p.before ? `alone in a paragraph after “${p.before}”` : "alone in a paragraph";
    for (const e of r.equations) equations.push({ ...e, index: equations.length + 1, where: e.number ? `${e.number}, ${where}` : where });
    if (packages.some((x) => x)) items.push({ ...p, packages });
  }
  return items;
}

/**
 * Converts every MathType equation of the open Word document in place, in one undo step
 * (Ctrl+Z in Word brings them all back). Numbers, bookmarks and references are kept.
 */
export async function convertOpenDocument(document?: string, o: { quiet?: boolean } = {}) {
  const app = useApp.getState();
  const ui = useConversion.getState();
  if (ui.busy) return;
  if (!app.connector.connected) return app.notify("Word is not connected. Start Word with the MathBlocks add-in.", "error");
  await import("./docStyle").then((m) => m.loadDocumentStyle(document)).catch(() => undefined);
  if (!addinSupports("listMathTypeParagraphs")) return app.notify("The MathBlocks add-in loaded in Word is too old for this. Close Word completely and start it again.", "error");
  try {
    ui.set({ busy: true, progress: "Looking for MathType equations…" });
    const target = document ? { document } : {};
    const first = await connector.request("listMathTypeParagraphs", { ...target, from: 0, limit: PAGE }, SLOW);
    if (first.totalObjects === 0) {
      ui.set({ busy: false, progress: null });
      return app.notify(`No MathType equations in ${first.name}`);
    }
    ui.set({ busy: false, progress: null });
    const ok = o.quiet || await askConfirm(
      "Convert MathType equations",
      `Convert the ${first.totalObjects} MathType equation(s) in “${first.name}” into MathBlocks equations? Numbers and cross-references are kept. You can undo it with one Ctrl+Z in Word; saving a backup copy first is a good idea.`,
      "Convert",
      false,
    );
    if (!ok) return;
    ui.set({ busy: true, progress: `Reading equations… 0 / ${first.totalObjects}` });
    const equations: ConvertedEquation[] = [];
    const items: MathTypeParagraph[] = [];
    let page = first;
    let from = 0;
    let objectsSeen = 0;
    for (;;) {
      items.push(...(await convertParagraphs(page.paragraphs, equations)));
      objectsSeen += page.paragraphs.reduce((n, p) => n + p.objects, 0);
      from += page.paragraphs.length;
      ui.set({ progress: `Converting… ${objectsSeen} / ${first.totalObjects}` });
      if (from >= page.total || page.paragraphs.length === 0) break;
      page = await connector.request("listMathTypeParagraphs", { document: first.fullName, from, limit: PAGE }, SLOW);
    }
    // Pre-flight: equations that cannot be converted stay MathType — listed with where they are, before anything is written.
    const held = equations.filter((e) => e.status !== "converted");
    if (held.length && !o.quiet) {
      ui.set({ busy: false, progress: null });
      const list = held.slice(0, 8).map((e) => `• ${e.where ?? `equation ${e.index}`}: ${e.messages[0] ?? "not converted"}`).join("\n");
      const go = await askConfirm(
        "Convert MathType equations",
        `${held.length} MathType equation(s) cannot be converted and will stay MathType (listed again in the report):\n${list}${held.length > 8 ? `\n… and ${held.length - 8} more` : ""}\n\nConvert the other ${equations.length - held.length} now?`,
        "Convert the others",
        false,
      );
      if (!go) return;
      ui.set({ busy: true });
    }
    ui.set({ progress: `Writing ${items.length} paragraph(s) into Word…` });
    await backupIfMany(first.fullName, items.length);
    const r = items.length ? await connector.request("replaceParagraphs", { document: first.fullName, items, undoLabel: "Convert MathType equations" }, 600_000) : { replaced: 0, skipped: 0 };
    if (r.skipped) {
      app.notify(`${r.skipped} paragraph(s) changed while converting and were left as they were`, "error");
    }
    if ("guardFailed" in r && r.guardFailed) {
      const { guardMessage } = await import("./docOps");
      app.notify(guardMessage("Convert MathType", r.guardFailed, !!r.guardRestored), "error");
      ui.set({ busy: false, progress: null });
      return;
    }
    for (const e of equations) e.messages = e.messages.filter(Boolean);
    const converted = equations.filter((e) => e.status === "converted").length;
    // After: no private-use character in any converted equation, and every MathType object left is one listed above.
    const pua = equations.filter((e) => e.status === "converted" && e.latex && /[\uE000-\uF8FF]/u.test(e.latex));
    const after = await connector.request("listMathTypeParagraphs", { document: first.fullName, from: 0, limit: 1 }, SLOW).catch(() => null);
    const leftInWord = after?.totalObjects ?? 0;
    if (pua.length || leftInWord !== held.length) {
      app.notify(`After converting: ${leftInWord} MathType object(s) left in the document (${held.length} listed as not convertible)${pua.length ? `; ${pua.length} converted equation(s) still hold a private-use character` : ""}. See the report.`, "error");
    }
    ui.set({
      busy: false,
      progress: null,
      report: { source: first.name, output: null, inPlace: true, result: { equations, converted, skipped: equations.length - converted } },
    });
    // One numbering scheme per document: MathType's numbers stay MathType fields until converted.
    if (!o.quiet) {
      const { scanNumbering } = await import("./numberingConversionRun");
      const scan = await scanNumbering(first.fullName).catch(() => null);
      const left = scan?.items.filter((i) => i.type === "mtNumber").length ?? 0;
      if (left) app.notify(`This document still uses MathType's equation numbering (${left} number(s)). Run “Convert numbering” (MathBlocks ribbon or Ctrl+K) so that new equations continue it — keep the numbers or renumber to chapter.section.equation.`, "info");
    }
  } catch (e) {
    ui.set({ busy: false, progress: null });
    app.notify(e instanceof Error ? e.message : String(e), "error");
  }
}

/** Double-click on a MathType equation in Word: convert it (with its paragraph) and edit it here. */
export async function onMathTypeActivated(p: MathTypeActivatedParams) {
  const app = useApp.getState();
  const choice = await askConfirm(
    "MathType equation",
    "Convert this MathType equation into a MathBlocks equation and edit it here? Other MathType equations in the same paragraph are converted too. (Cancel opens it in MathType.)",
    "Convert and edit",
    false,
  );
  try {
    if (!choice) {
      await connector.request("activateObject", { document: p.document, start: p.start, end: p.end, index: p.index });
      return;
    }
    const equations: ConvertedEquation[] = [];
    const items = await convertParagraphs([p], equations);
    const target = equations[p.index];
    if (!items.length || !target || target.status !== "converted" || !target.tag || !target.latex) {
      return app.notify(`This equation could not be converted${target?.messages[0] ? `: ${target.messages[0]}` : ""}`, "error");
    }
    const r = await connector.request("replaceParagraphs", { document: p.document, items, undoLabel: "Convert MathType equation" }, SLOW);
    if (!r.replaced) return app.notify("The paragraph changed in Word; double-click the equation again.", "error");
    const lib = await import("./library/useLibrary");
    lib.useLibrary.getState().closeEquation();
    const { parseLatex, serializeLatex } = await import("@mathblocks/math-latex");
    app.setLatex(serializeLatex(parseLatex(target.latex).root), "external");
    app.setDisplay(target.display || !!target.number);
    app.setNumbered(!!target.number);
    app.setEditing({ tag: target.tag, adopted: true, numbered: !!target.number });
    app.notify(
      target.messages.length ? `Converted from MathType. Please check: ${target.messages.join("; ")}` : "Converted from MathType. Edit it, then press Update in Word (Ctrl+Enter).",
      target.messages.length ? "error" : "info",
    );
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e), "error");
  }
}
