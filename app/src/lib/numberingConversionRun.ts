/**
 * Convert MathType numbering (one numbering scheme per document): scan → plan (keep, or renumber to
 * chapter.section.equation) → the dialog shows the before → after list and the problems → one write in
 * Word (one Ctrl+Z, backup first, the document stays in front) → what Word shows is checked.
 */
import type { BrokenReference } from "@mathblocks/connector-protocol";
import { addinSupports, bringToFront, connector } from "./connector";
import { backupIfMany } from "./docOps";
import { planNumberingConversion, type NumberingMode, type NumberingOptions, type NumberingPlan, type NumberingScan } from "./numberingConversion";
import { useApp } from "./store";

export interface NumberingResult {
  plan: NumberingPlan;
  /** Numbers that show something else than planned (bookmark, planned, shown). */
  mismatches: { bookmark: string; planned: string; shows: string }[];
  problems: string[];
  ms: number;
  broken?: BrokenReference[];
  undoBrokenAt?: string;
  backup?: string;
  /** The text guard found other text changed and undid the conversion. */
  guardFailed?: string;
  guardRestored?: boolean;
  /** MathType bookmark → MathBlocks bookmark of the same number. */
  aliases?: Record<string, string>;
  /** MathType references now MathBlocks references, and those that do not show their equation's number. */
  referencesConverted?: number;
  referenceMismatches?: { bookmark: string; expected: string; shows: string; snippet: string }[];
  /** MathType bookmarks removed (only when every reference was verified). */
  aliasesRemoved?: number;
  /** MathType numbering fields still in the document after the conversion (none expected). */
  leftovers?: { code: string; snippet: string; start: number }[];
}

/** Scans the document and plans both choices (the dialog switches between them). */
export async function scanNumbering(document?: string): Promise<NumberingScan | null> {
  if (!addinSupports("scanNumbering")) return null;
  return (await connector.request("scanNumbering", document ? { document } : {}, 300_000)) as unknown as NumberingScan;
}

/** Opens the dialog (when the document has MathType numbers). */
export async function openNumberingConversion(o: { document?: string; fromWord?: boolean } = {}) {
  const { useNumberingDialog } = await import("../components/NumberingDialog");
  const scan = await scanNumbering(o.document);
  const app = useApp.getState();
  if (!scan) return app.notify("Restart Word to load the updated MathBlocks add-in first.", "error");
  const numbers = scan.items.filter((i) => i.type === "mtNumber").length;
  if (!numbers) return app.notify(`“${scan.name}” has no MathType equation numbers to convert.`, "info");
  if (o.fromWord) void bringToFront();
  const keep = planNumberingConversion(scan, "keep");
  useNumberingDialog.getState().show(scan, keep.levels < 3 && keep.canRenumber ? "renumber" : "keep");
}

/** Writes a plan; the self-test calls it directly. */
export async function convertNumbering(scan: NumberingScan, mode: NumberingMode, o: NumberingOptions = {}): Promise<NumberingResult> {
  const plan = planNumberingConversion(scan, mode, o);
  const backup = await backupIfMany(scan.fullName, plan.writes.length);
  await connector.request("beginOperation", { document: scan.fullName, title: "Converting MathType numbering", total: plan.writes.length, undoLabel: "Convert MathType numbering" });
  let r: Awaited<ReturnType<typeof requestConvert>>;
  let undoBrokenAt = "";
  let guard: { failed?: string; restored?: boolean } = {};
  try {
    r = await requestConvert(scan, plan);
  } finally {
    const end = await connector.request("endOperation", { done: plan.writes.length }).catch(() => ({ ms: 0, undoBrokenAt: "" }) as { ms: number; undoBrokenAt?: string; guardFailed?: string; guardRestored?: boolean });
    undoBrokenAt = end.undoBrokenAt ?? "";
    if (end.guardFailed) guard = { failed: end.guardFailed, restored: !!end.guardRestored };
  }
  const mismatches = plan.changes
    .filter((c) => c.bookmark && r.shows[c.bookmark] !== undefined && r.shows[c.bookmark]!.replace(/\s+/g, "") !== c.new)
    .map((c) => ({ bookmark: c.bookmark, planned: c.new, shows: r.shows[c.bookmark]! }));
  // Undone by the text guard: nothing changed, the number style stays.
  if (guard.failed) return { plan, mismatches: [], problems: [], ms: r.ms, guardFailed: guard.failed, guardRestored: !!guard.restored, ...(backup ? { backup } : {}) };
  // New numbers in this document (equations numbered later, Convert LaTeX) use the same format.
  const app = useApp.getState();
  useApp.setState({ numberStyle: { ...app.numberStyle, open: "(", close: ")", chapter: plan.format.parts !== "eq", parts: plan.format.parts, separator: ".", restart: plan.format.restart, source: "markers" } });
  return {
    plan,
    mismatches,
    problems: r.problems,
    ms: r.ms,
    ...(r.broken?.length ? { broken: r.broken } : {}),
    ...(undoBrokenAt ? { undoBrokenAt } : {}),
    ...(backup ? { backup } : {}),
    aliases: r.aliases ?? {},
    referencesConverted: r.referencesConverted ?? 0,
    referenceMismatches: r.referenceMismatches ?? [],
    aliasesRemoved: r.aliasesRemoved ?? 0,
    leftovers: r.leftovers ?? [],
  };
}

const requestConvert = (scan: NumberingScan, plan: NumberingPlan) =>
  connector.request("convertNumbering", { document: scan.fullName, items: plan.writes as unknown as Record<string, unknown>[], format: plan.format }, 1_800_000);
