/**
 * Convert MathType numbering (one numbering scheme per document): scan → plan (keep, or renumber to
 * chapter.section.equation) → the dialog shows the before → after list and the problems → one write in
 * Word (one Ctrl+Z, backup first, the document stays in front) → what Word shows is checked.
 */
import type { BrokenReference } from "@mathblocks/connector-protocol";
import { addinSupports, bringToFront, connector } from "./connector";
import { backupIfMany } from "./docOps";
import { planNumberingConversion, type NumberingMode, type NumberingPlan, type NumberingScan } from "./numberingConversion";
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
export async function convertNumbering(scan: NumberingScan, mode: NumberingMode): Promise<NumberingResult> {
  const plan = planNumberingConversion(scan, mode);
  const backup = await backupIfMany(scan.fullName, plan.writes.length);
  await connector.request("beginOperation", { document: scan.fullName, title: "Converting MathType numbering", total: plan.writes.length, undoLabel: "Convert MathType numbering" });
  let r: { problems: string[]; shows: Record<string, string>; ms: number; broken?: BrokenReference[] };
  let undoBrokenAt = "";
  try {
    r = await connector.request("convertNumbering", { document: scan.fullName, items: plan.writes as unknown as Record<string, unknown>[], format: plan.format }, 1_800_000);
  } finally {
    const end = await connector.request("endOperation", { done: plan.writes.length }).catch(() => ({ ms: 0, undoBrokenAt: "" }));
    undoBrokenAt = end.undoBrokenAt ?? "";
  }
  const mismatches = plan.changes
    .filter((c) => c.bookmark && r.shows[c.bookmark] !== undefined && r.shows[c.bookmark]!.replace(/\s+/g, "") !== c.new)
    .map((c) => ({ bookmark: c.bookmark, planned: c.new, shows: r.shows[c.bookmark]! }));
  // New numbers in this document (equations numbered later, Convert LaTeX) use the same format.
  const app = useApp.getState();
  useApp.setState({ numberStyle: { ...app.numberStyle, open: "(", close: ")", chapter: plan.format.parts !== "eq", parts: plan.format.parts, separator: ".", restart: plan.format.restart, source: "markers" } });
  return { plan, mismatches, problems: r.problems, ms: r.ms, ...(r.broken?.length ? { broken: r.broken } : {}), ...(undoBrokenAt ? { undoBrokenAt } : {}), ...(backup ? { backup } : {}) };
}
