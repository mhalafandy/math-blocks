import { addinSupports, connector } from "./connector";
import { useApp } from "./store";

/**
 * Document-wide replacements (restyle, Change notation, Normalize bold…), made safe:
 * - more than BACKUP_ABOVE equations: a backup copy of the whole document first;
 * - every equation's previous XML is kept; Cancel restores the ones already replaced from it
 *   (not only Word's undo) and reports what was restored;
 * - batches inside one undo record, with a progress window owned by Word's window (the
 *   document cannot be clicked meanwhile);
 * - the time per equation is measured and reported (and logged by the add-in).
 */

export const BACKUP_ABOVE = 10;
const BATCH = 10;

export interface ReplaceItem {
  tag: string;
  flatOpc: string;
  /** The equation's XML before the change (restored on Cancel). */
  previous?: string;
}

export interface OperationResult {
  replaced: number;
  missing: string[];
  cancelled: boolean;
  restored: number;
  ms: number;
  backup?: string;
}

export async function replaceInDocument(o: { document: string; title: string; undoLabel: string; items: ReplaceItem[] }): Promise<OperationResult> {
  const result: OperationResult = { replaced: 0, missing: [], cancelled: false, restored: 0, ms: 0 };
  if (!o.items.length) return result;
  const t0 = performance.now();
  const safe = addinSupports("beginOperation");
  if (o.items.length > BACKUP_ABOVE && addinSupports("backupDocument")) {
    result.backup = (await connector.request("backupDocument", { document: o.document }, 120_000)).path;
  }
  if (!safe) {
    // Older add-in: one request, one undo step, no progress window.
    const r = await connector.request("replaceMany", { document: o.document, items: o.items.map(({ tag, flatOpc }) => ({ tag, flatOpc })), undoLabel: o.undoLabel }, 300_000);
    return { ...result, replaced: r.replaced, missing: r.missing, ms: performance.now() - t0 };
  }
  await connector.request("beginOperation", { document: o.document, title: o.title, total: o.items.length, undoLabel: o.undoLabel });
  const done: ReplaceItem[] = [];
  try {
    for (let i = 0; i < o.items.length; i += BATCH) {
      const batch = o.items.slice(i, i + BATCH);
      const r = await connector.request("replaceMany", { document: o.document, items: batch.map(({ tag, flatOpc }) => ({ tag, flatOpc })), undoLabel: o.undoLabel }, 300_000);
      result.replaced += r.replaced;
      result.missing.push(...r.missing);
      done.push(...batch.filter((b) => !r.missing.includes(b.tag)));
      const p = await connector.request("operationProgress", { done: Math.min(o.items.length, i + BATCH), text: `${Math.min(o.items.length, i + BATCH)} / ${o.items.length} equations` });
      if (p.cancelled && i + BATCH < o.items.length) {
        result.cancelled = true;
        break;
      }
    }
  } catch (e) {
    result.cancelled = true;
    useApp.getState().notify(`Stopped: ${e instanceof Error ? e.message : String(e)}. Restoring the equations already changed…`, "error");
  }
  if (result.cancelled) result.restored = await restore(o.document, done, o.undoLabel);
  const end = await connector.request("endOperation", { done: result.replaced }).catch(() => ({ ms: 0 }));
  result.ms = end.ms || performance.now() - t0;
  console.info(`[MathBlocks] ${o.title}: ${result.replaced} equation(s) in ${Math.round(result.ms)} ms (${Math.round(result.ms / Math.max(1, result.replaced))} ms each)${result.cancelled ? `, cancelled, ${result.restored} restored` : ""}`);
  return result;
}

/** Puts back the stored XML of equations already replaced. */
async function restore(document: string, done: ReplaceItem[], undoLabel: string): Promise<number> {
  const back = done.filter((d) => d.previous);
  let restored = 0;
  for (let i = 0; i < back.length; i += BATCH) {
    const batch = back.slice(i, i + BATCH);
    const r = await connector.request("replaceMany", { document, items: batch.map((b) => ({ tag: b.tag, flatOpc: b.previous! })), undoLabel }, 300_000);
    restored += r.replaced;
  }
  return restored;
}

/** One line for the user: what happened, how long it took, where the backup is. */
export function describeOperation(r: OperationResult, what: string): string {
  const each = r.replaced ? ` (${Math.round(r.ms / r.replaced)} ms each)` : "";
  const backup = r.backup ? ` Backup: ${r.backup.split(/[\\/]/).pop()}` : "";
  if (r.cancelled) return `Cancelled: ${r.restored} equation(s) restored to their previous version.${backup}`;
  return `${what}: ${r.replaced} equation(s) in ${(r.ms / 1000).toFixed(1)} s${each}.${backup}`;
}

/** A backup copy before an operation on many equations (convert MathType/LaTeX). Returns its path. */
export async function backupIfMany(document: string, count: number): Promise<string | undefined> {
  if (count <= BACKUP_ABOVE || !addinSupports("backupDocument")) return undefined;
  return (await connector.request("backupDocument", { document }, 120_000)).path;
}
