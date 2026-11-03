import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { readOmml, toOmml, type StyleProfile } from "@mathblocks/math-omml";

/**
 * Pure decisions for linked equations, separated from Word I/O so they can be tested.
 *
 * Equations are compared by mathematical content, not by XML: Word rewrites the XML it is given,
 * so both sides are read back into the AST and compared as normalised LaTeX.
 */

/** Normalised content of an equation as it is in Word (null if it cannot be read). */
export function contentOfWord(flatOpc: string): { latex: string; display: boolean } | null {
  const r = readOmml(flatOpc);
  return r ? { latex: serializeLatex(r.root), display: r.display } : null;
}

/** Normalised content Word would hold after we write `latex` with this profile. */
export function contentOfLatex(latex: string, profile: StyleProfile): string {
  const written = toOmml(parseLatex(latex).root, { display: true, profile, standalone: true });
  const back = readOmml(written);
  return back ? serializeLatex(back.root) : serializeLatex(parseLatex(latex).root);
}

export interface InstanceContent {
  tag: string;
  flatOpc: string;
}

export interface UpdatePlan {
  /** Copies to replace with the new version, with their own display/inline mode. */
  update: { tag: string; display: boolean }[];
  /** Copies already showing the new version. */
  unchanged: string[];
  /** Copies changed directly in Word (neither the previous nor the new version): ask first. */
  conflicts: { tag: string; display: boolean }[];
}

/**
 * Decides what to do with each linked copy of a block when its definition changes from
 * `previousLatex` (what MathBlocks last wrote into this document; null = unknown) to `newLatex`.
 * `profiles` are the style profiles the copies may have been written with (current first).
 */
export function planUpdate(instances: InstanceContent[], previousLatex: string | null, newLatex: string, profiles: StyleProfile[]): UpdatePlan {
  const plan: UpdatePlan = { update: [], unchanged: [], conflicts: [] };
  const expectNew = new Set(profiles.map((p) => contentOfLatex(newLatex, p)));
  const expectOld = previousLatex === null ? null : new Set(profiles.map((p) => contentOfLatex(previousLatex, p)));
  for (const inst of instances) {
    const now = contentOfWord(inst.flatOpc);
    const display = now?.display ?? true;
    if (now && expectNew.has(now.latex)) plan.unchanged.push(inst.tag);
    else if (!now || expectOld === null || expectOld.has(now.latex)) plan.update.push({ tag: inst.tag, display });
    else plan.conflicts.push({ tag: inst.tag, display });
  }
  return plan;
}

/** "mb1|<block>|<instance>" → parts; null for unlinked or foreign tags. */
export function linkOf(tag: string): { blockId: string; instanceId: string } | null {
  const m = /^mb1\|([0-9A-Za-z]{16})\|([0-9A-Za-z]{12})$/.exec(tag);
  return m ? { blockId: m[1]!, instanceId: m[2]! } : null;
}
