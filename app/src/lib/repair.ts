import { parseTag } from "@mathblocks/ooxml";
import { addinSupports, connector } from "./connector";
import { backupIfMany } from "./docOps";
import { useLibrary } from "./library/useLibrary";
import { readRegistry, writeBlock, writeRegistry } from "./linking";
import { useApp } from "./store";

/**
 * Repair equations: after copy, cut and paste a MathBlocks equation can lose its identity.
 * The add-in puts floating pictures back in line, converts older wrapped Classic equations to
 * titled pictures, identifies pictures that still carry MathBlocks data (EMF source / alt text),
 * gives copies (not originals) new instance ids, and bookmarks numbered copies. The app
 * then carries over what lives in the document registry: the source of native equations with
 * notation kinds (to the new id), and the definition of linked copies (from the library), or
 * makes a copy unlinked when its definition is nowhere.
 */

export interface RepairReport {
  /** Where Word closed the single undo record early (diagnosis); absent when one Ctrl+Z undoes it all. */
  undoBrokenAt?: string;
  /** Floating MathBlocks pictures put back in line with the text. */
  inlined: number;
  /** Wrappers that held several equations, text or nested wrappers, split into one per equation. */
  split: number;
  /** Older wrapped Classic equations converted to titled pictures (no wrapper). */
  converted: number;
  /** Untouched: native Word equations and MathType objects. */
  native: number;
  mathType: number;
  /** Baselines restored. */
  lowered: number;
  /** Classic pictures converted to embedded MathBlocks objects (same ID, numbers and references kept). */
  toObjects: number;
  /** Copied objects whose own data held another ID, redrawn with their own. */
  idRewrites: number;
  /** All redrawn equations (toObjects + idRewrites, as replaced in Word). */
  redrawn: number;
  /** Time the repair took (ms). */
  ms: number;
  /** Numbered equation paragraphs that got their style (MTDisplayEquation) back. */
  styled: number;
  renamed: number;
  wrapped: number;
  fromAlt: number;
  bookmarks: number;
  linkedAdded: number;
  unlinked: number;
  otherPictures: number;
  backup?: string;
}

export async function repairDocument(document?: string, o: { quiet?: boolean; fromWord?: boolean } = {}): Promise<RepairReport | null> {
  if (!addinSupports("repairEquations")) return null;
  const target = document ? { document } : {};
  await import("./docStyle").then((m) => m.loadDocumentStyle(document)).catch(() => undefined);
  const dry = await connector.request("repairEquations", { ...target, dryRun: true }, 120_000);
  const changes = (dry.inlined ?? 0) + (dry.split?.length ?? 0) + (dry.converted ?? 0) + (dry.styled ?? 0) + (dry.lowered ?? 0) + (dry.redraw?.length ?? 0) + dry.renamed.length + dry.wrapped.length + dry.bookmarks;
  const report: RepairReport = { inlined: 0, split: 0, converted: 0, lowered: 0, toObjects: 0, idRewrites: 0, redrawn: 0, ms: 0, styled: 0, native: dry.native ?? 0, mathType: dry.mathType ?? 0, renamed: 0, wrapped: 0, fromAlt: 0, bookmarks: 0, linkedAdded: 0, unlinked: 0, otherPictures: dry.otherPictures };
  if (changes > 0) {
    report.backup = await backupIfMany(dry.document, changes);
    // One operation, one undo step: the add-in's repair, the registry follow-up and the redraw of
    // every Classic picture (and mis-identified copy) as an embedded object all run inside it.
    const { replaceInDocument } = await import("./docOps");
    const t0 = performance.now();
    // Reading Word's XML ends an open undo record, so everything is read before the operation opens
    // its record (the dry run, the redraw packages, the checks of each equation); inside it Repair only
    // writes: the plan's baselines, then the redraws.
    const planned = dry.lowerings !== undefined;
    const items = await redrawItems(dry.redraw ?? []);
    const skip: ("inline" | "split" | "convert" | "identify")[] = [];
    if (!dry.inlined) skip.push("inline");
    if (!dry.split?.length) skip.push("split");
    if (!dry.converted) skip.push("convert");
    if (!dry.wrapped.length) skip.push("identify");
    const op = await replaceInDocument({
      document: dry.document,
      title: "Repairing MathBlocks equations",
      undoLabel: "Repair MathBlocks equations",
      items: planned ? items : undefined,
      total: dry.redraw?.length ?? 0,
      noBackup: true,
      prepare: async () => {
        const r = await connector.request("repairEquations", planned ? { ...target, lowerings: dry.lowerings, skip } : target, 300_000);
        report.inlined = r.inlined ?? 0;
        report.split = r.split?.length ?? 0;
        report.converted = r.converted ?? 0;
        report.lowered = r.lowered ?? 0;
        report.native = r.native ?? report.native;
        report.mathType = r.mathType ?? report.mathType;
        report.renamed = r.renamed.length;
        report.wrapped = r.wrapped.length;
        report.fromAlt = r.wrapped.filter((w) => w.source === "alt").length;
        report.bookmarks = r.bookmarks;
        report.toObjects = planned ? dry.toObjects ?? 0 : r.toObjects ?? 0;
        report.styled = r.styled ?? 0;
        report.idRewrites = planned ? dry.idRewrites ?? 0 : r.idRewrites ?? 0;
        await carryOverRegistry(r.document, r.renamed, r.wrapped.map((w) => w.tag), report);
        return planned ? items : redrawItems(r.redraw ?? []);
      },
    });
    report.redrawn = op.replaced;
    if (op.undoBrokenAt) report.undoBrokenAt = op.undoBrokenAt;
    report.ms = Math.round(op.ms || performance.now() - t0);
  }
  if (!o.quiet || changes > 0) {
    const { tell } = await import("./wordUi");
    tell(describeRepair(report), "info", !!o.fromWord);
  }
  return report;
}

/**
 * Equations Repair redraws as embedded objects with the same ID: Classic pictures (the form before
 * objects — converted once; the next Repair finds none) and copied objects whose data held another ID.
 */
async function redrawItems(list: { tag: string; latex: string; mode: "display" | "inline" | "numbered" }[]) {
  const { buildObjectInsertion } = await import("./equation");
  const items = [];
  for (const e of list) {
    // In place: the object's run only, so the paragraph (alignment, tabs, number) stays as it is.
    const { flatOpc } = await buildObjectInsertion(e.latex, e.mode === "display", e.tag, e.mode !== "inline", { keepParagraph: true, mode: e.mode });
    items.push({ tag: e.tag, flatOpc });
  }
  return items;
}

/** Registry follow-up: native sources move to the new ids; linked copies need their definition here. */
async function carryOverRegistry(document: string, renamed: { from: string; to: string }[], wrapped: string[], report: RepairReport) {
  const reg = await readRegistry(document);
  let changed = false;
  for (const { from, to } of renamed) {
    const a = parseTag(from)?.instanceId;
    const b = parseTag(to)?.instanceId;
    const src = a ? reg.sources?.[a] : undefined;
    if (src && b) {
      (reg.sources ??= {})[b] = { ...src, id: b };
      changed = true;
    }
  }
  const lib = useLibrary.getState();
  for (const tag of [...renamed.map((r) => r.to), ...wrapped]) {
    const blockId = parseTag(tag)?.blockId;
    if (!blockId || reg.blocks[blockId]) continue;
    const q = lib.equations.find((e) => e.id === blockId);
    if (q) {
      await writeBlock(document, q, reg);
      report.linkedAdded++;
    } else {
      // Its definition is neither in this document nor in the library: keep it, unlinked.
      const t = parseTag(tag)!;
      await connector.request("retag", { document, tag, newTag: `mb1|-|${t.instanceId}` });
      report.unlinked++;
    }
  }
  if (changed) await writeRegistry(document, reg);
}

export function describeRepair(r: RepairReport): string {
  const parts: string[] = [];
  if (r.inlined) parts.push(`${r.inlined} floating picture(s) put back in line with the text`);
  if (r.split) parts.push(`${r.split} wrapper(s) holding several equations or text split into one per equation (text moved out)`);
  if (r.lowered) parts.push(`${r.lowered} equation baseline(s) restored`);
  if (r.toObjects) parts.push(`${r.toObjects} Classic picture(s) converted to embedded objects (same ID; numbers and references kept)`);
  if (r.styled) parts.push(`${r.styled} numbered equation paragraph(s) got their style back (number at the right margin again)`);
  if (r.idRewrites) parts.push(`${r.idRewrites} copied object(s) given their own ID inside`);
  if (r.redrawn && r.redrawn !== r.toObjects + r.idRewrites) parts.push(`${r.redrawn} of ${r.toObjects + r.idRewrites} redrawn`);
  if (r.converted) parts.push(`${r.converted} Classic equation(s) converted to the new form (picture without wrapper)`);
  if (r.renamed) parts.push(`${r.renamed} copied equation(s) got their own identity`);
  if (r.wrapped) parts.push(`${r.wrapped} pasted picture(s) were identified as MathBlocks equations again${r.fromAlt ? ` (${r.fromAlt} from their alt text only)` : ""}`);
  if (r.bookmarks) parts.push(`${r.bookmarks} numbered copy/copies got a number bookmark`);
  if (r.linkedAdded) parts.push(`${r.linkedAdded} linked copy/copies registered in this document`);
  if (r.unlinked) parts.push(`${r.unlinked} linked copy/copies kept as unlinked (definition not found)`);
  const head = parts.length ? `Repaired: ${parts.join("; ")}.` : "Every MathBlocks equation is intact.";
  const other = r.otherPictures ? ` ${r.otherPictures} other picture(s) carry no MathBlocks data (ordinary pictures, or equations pasted as "Picture").` : "";
  const untouched = r.native || r.mathType ? ` Left untouched: ${r.native} native Word equation(s), ${r.mathType} MathType object(s).` : "";
  const took = r.ms ? ` (${(r.ms / 1000).toFixed(1)} s)` : "";
  return head + took + other + untouched + (r.backup ? ` Backup: ${r.backup.split(/[\\/]/).pop()}` : "");
}
