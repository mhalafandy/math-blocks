import { parseTag } from "@mathblocks/ooxml";
import { addinSupports, connector } from "./connector";
import { backupIfMany } from "./docOps";
import { useLibrary } from "./library/useLibrary";
import { readRegistry, writeBlock, writeRegistry } from "./linking";
import { useApp } from "./store";

/**
 * Repair equations (Bug 1): after copy, cut and paste a MathBlocks equation can lose its identity.
 * The add-in gives duplicated copies new instance ids, wraps pictures that still carry MathBlocks
 * data (EMF comment / alt text) in a new content control, and bookmarks numbered copies. The app
 * then carries over what lives in the document registry: the source of native equations with
 * notation kinds (to the new id), and the definition of linked copies (from the library), or
 * makes a copy unlinked when its definition is nowhere.
 */

export interface RepairReport {
  renamed: number;
  wrapped: number;
  fromAlt: number;
  bookmarks: number;
  linkedAdded: number;
  unlinked: number;
  otherPictures: number;
  backup?: string;
}

export async function repairDocument(document?: string, o: { quiet?: boolean } = {}): Promise<RepairReport | null> {
  if (!addinSupports("repairEquations")) return null;
  const target = document ? { document } : {};
  const dry = await connector.request("repairEquations", { ...target, dryRun: true }, 120_000);
  const changes = dry.renamed.length + dry.wrapped.length + dry.bookmarks;
  const report: RepairReport = { renamed: 0, wrapped: 0, fromAlt: 0, bookmarks: 0, linkedAdded: 0, unlinked: 0, otherPictures: dry.otherPictures };
  if (changes > 0) {
    report.backup = await backupIfMany(dry.document, changes);
    const r = await connector.request("repairEquations", target, 300_000);
    report.renamed = r.renamed.length;
    report.wrapped = r.wrapped.length;
    report.fromAlt = r.wrapped.filter((w) => w.source === "alt").length;
    report.bookmarks = r.bookmarks;
    await carryOverRegistry(r.document, r.renamed, r.wrapped.map((w) => w.tag), report);
  }
  if (!o.quiet || changes > 0) useApp.getState().notify(describeRepair(report));
  return report;
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
  if (r.renamed) parts.push(`${r.renamed} copied equation(s) got their own identity`);
  if (r.wrapped) parts.push(`${r.wrapped} pasted picture(s) became MathBlocks equations again${r.fromAlt ? ` (${r.fromAlt} from their alt text only)` : ""}`);
  if (r.bookmarks) parts.push(`${r.bookmarks} numbered copy/copies got a number bookmark`);
  if (r.linkedAdded) parts.push(`${r.linkedAdded} linked copy/copies registered in this document`);
  if (r.unlinked) parts.push(`${r.unlinked} linked copy/copies kept as unlinked (definition not found)`);
  const head = parts.length ? `Repaired: ${parts.join("; ")}.` : "Every MathBlocks equation is intact.";
  const other = r.otherPictures ? ` ${r.otherPictures} other picture(s) carry no MathBlocks data (ordinary pictures, or equations pasted as "Picture").` : "";
  return head + other + (r.backup ? ` Backup: ${r.backup.split(/[\\/]/).pop()}` : "");
}
