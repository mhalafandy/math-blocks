/**
 * Blocks: reusable chunks of expression with named slots (docs/BLOCKS-DESIGN.md). Pure functions: slots
 * of a body, nested blocks, the editor form with its slot wrappers, Save as block, the export format.
 */

export interface Block {
  id: string;
  name: string;
  description: string;
  /** LaTeX with slots: #name (\# is a literal hash); unnamed #? / #0 are slots 1, 2… */
  body: string;
  /** Slot order (Space order) and labels; defaults pre-fill a slot. */
  slots: BlockSlot[];
  trigger: string;
  groupId: string | null;
  tags: string[];
  display: boolean;
  /** "global" (library) or "document" (stored in the Word document). */
  scope: "global" | "document";
  position: number;
  createdAt: number;
  updatedAt: number;
  useCount: number;
  version: number;
}

export interface BlockSlot {
  name: string;
  label?: string;
  default?: string;
}

export interface BlockGroup {
  id: string;
  parentId: string | null;
  name: string;
  position: number;
}

const SLOT_RE = /(\\*)#([A-Za-z][A-Za-z0-9]*|\?|0)/g;

/** The slot names of a body in reading order of first appearance (unnamed slots numbered 1, 2…). */
export function slotNames(body: string): string[] {
  const out: string[] = [];
  let unnamed = 0;
  for (const m of body.matchAll(SLOT_RE)) {
    if (m[1]!.length % 2 === 1) continue; // \# : a literal hash
    const name = m[2] === "?" || m[2] === "0" ? String(++unnamed) : m[2]!;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/** The slots of a body, keeping labels/defaults of `previous` where the names match; order = body order unless `previous` orders them. */
export function syncSlots(body: string, previous: BlockSlot[] = []): BlockSlot[] {
  const names = slotNames(body);
  const kept = previous.filter((s) => names.includes(s.name));
  return [...kept, ...names.filter((n) => !kept.some((s) => s.name === n)).map((name) => ({ name }))];
}

export class BlockCycleError extends Error {}

/** Index of the brace matching the one at `open`. */
function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return -1;
}

/**
 * Nested blocks expanded: \block{Name}{a}{b} → that block's body with its slots (in order) filled by the
 * arguments given; slots without an argument stay slots of the outer block. A cycle throws.
 */
export function expandNested(body: string, lookup: (name: string) => Block | undefined, stack: string[] = []): string {
  let out = "";
  let i = 0;
  for (;;) {
    const at = body.indexOf("\\block{", i);
    if (at < 0) return out + body.slice(i);
    out += body.slice(i, at);
    const nameOpen = at + 6;
    const nameClose = matchBrace(body, nameOpen);
    if (nameClose < 0) return out + body.slice(at);
    const name = body.slice(nameOpen + 1, nameClose);
    const args: string[] = [];
    let j = nameClose + 1;
    while (body[j] === "{") {
      const close = matchBrace(body, j);
      if (close < 0) break;
      args.push(body.slice(j + 1, close));
      j = close + 1;
    }
    const inner = lookup(name);
    if (!inner) {
      out += body.slice(at, j); // unknown block: left as written (shown as an error by the editor)
      i = j;
      continue;
    }
    if (stack.includes(inner.name)) throw new BlockCycleError(`${[...stack, inner.name].join(" → ")}: a block cannot contain itself`);
    let innerBody = expandNested(inner.body, lookup, [...stack, inner.name]);
    const order = syncSlots(inner.body, inner.slots).map((s) => s.name);
    order.forEach((slot, k) => {
      if (args[k] === undefined) return;
      innerBody = replaceSlot(innerBody, slot, `{${args[k]}}`);
    });
    // Braces only when a script follows the inner block (it must stay one unit).
    out += /^\s*[_^]/.test(body.slice(j)) ? `{${innerBody}}` : innerBody;
    i = j;
  }
}

/** Every occurrence of one slot replaced (unnamed slot k: its k-th unnamed occurrence). */
function replaceSlot(body: string, name: string, by: string): string {
  let unnamed = 0;
  return body.replace(SLOT_RE, (whole, bs: string, n: string) => {
    if (bs.length % 2 === 1) return whole;
    const id = n === "?" || n === "0" ? String(++unnamed) : n;
    return id === name ? bs + by : whole;
  });
}

/** Sentinels standing for slot occurrences while the body goes through the kinds conversion. */
const SENTINELS = [...Array.from({ length: 26 }, (_, i) => String.fromCodePoint(0x24b6 + i)), ...Array.from({ length: 26 }, (_, i) => String.fromCodePoint(0x24d0 + i))];

export interface EditorForm {
  /** The editor's LaTeX with each slot occurrence wrapped: \class{mbs-<k>-<name>}{…}. */
  latex: string;
  /** The slots in Space order (nested blocks' slots included). */
  order: string[];
  /** Slot labels (status line, hints). */
  labels: Record<string, string>;
  /** Occurrences in order: their wrapper class and slot name. */
  occurrences: { cls: string; name: string }[];
}

/**
 * The block as the editor gets it: nested blocks expanded, the body through `convert` (the kinds' editor
 * form), every slot occurrence wrapped so it can be found again (Space, live repeats, hints).
 */
export function editorForm(block: Pick<Block, "body" | "slots" | "name">, convert: (latex: string) => string, lookup: (name: string) => Block | undefined, session: string): EditorForm {
  const body = expandNested(block.body, lookup, [block.name]);
  // The block's own slot order; with blocks inside it, reading order (labels and defaults kept).
  const slots = block.body.includes("\\block{") ? slotNames(body).map((n) => block.slots.find((s) => s.name === n) ?? { name: n }) : syncSlots(body, block.slots);
  const occurrences: { cls: string; name: string; sentinel: string }[] = [];
  let unnamed = 0;
  const withSentinels = body.replace(SLOT_RE, (whole, bs: string, n: string) => {
    if (bs.length % 2 === 1) return whole;
    const name = n === "?" || n === "0" ? String(++unnamed) : n;
    const sentinel = SENTINELS[occurrences.length];
    if (!sentinel) return bs + "#?";
    occurrences.push({ cls: `mbs-${session}-${occurrences.length}-${name}`, name, sentinel });
    return `${bs}${sentinel}`;
  });
  let latex = convert(withSentinels);
  for (const o of occurrences) {
    const def = slots.find((s) => s.name === o.name)?.default;
    latex = latex.split(o.sentinel).join(`\\class{${o.cls}}{${def ? def : "\\placeholder{}"}}`);
  }
  // The whole block wrapped too: after its last slot the caret leaves it.
  return { latex: `\\class{mbb-${session}}{${latex}}`, order: slots.map((s) => s.name), labels: Object.fromEntries(slots.map((s) => [s.name, s.label || s.name])), occurrences: occurrences.map(({ cls, name }) => ({ cls, name })) };
}

/** The block and slot wrappers removed: \class{mbs-…}{X}, \class{mbb-…}{X} → X (an unfilled slot stays an ordinary empty slot). */
export function stripSlotWrappers(latex: string): string {
  let out = "";
  let i = 0;
  for (;;) {
    const a1 = latex.indexOf("\\class{mbs-", i);
    const a2 = latex.indexOf("\\class{mbb-", i);
    const at = a1 < 0 ? a2 : a2 < 0 ? a1 : Math.min(a1, a2);
    if (at < 0) return out + latex.slice(i);
    out += latex.slice(i, at);
    const nameClose = latex.indexOf("}", at);
    const bodyOpen = nameClose + 1;
    const bodyClose = latex[bodyOpen] === "{" ? matchBrace(latex, bodyOpen) : -1;
    if (bodyClose < 0) return out + latex.slice(at);
    const inner = stripSlotWrappers(latex.slice(bodyOpen + 1, bodyClose));
    // Braces only where they keep the meaning: before a script ({a+b}^2), or around nothing.
    const single = /^[A-Za-z0-9]$|^\\[A-Za-z]+$/.test(inner);
    const scriptNext = /^\s*[_^]/.test(latex.slice(bodyClose + 1));
    out += single || (!scriptNext && inner) ? (single && /^\\[A-Za-z]+$/.test(inner) && /^[A-Za-z]/.test(latex.slice(bodyClose + 1)) ? `${inner} ` : inner) : `{${inner}}`;
    i = bodyClose + 1;
  }
}

/**
 * Save as block: chosen parts of an equation become slots. `parts` are LaTeX fragments as they appear
 * in the source (a symbol, a sub-expression); every occurrence becomes the named slot.
 */
export function bodyWithSlots(latex: string, parts: { latex: string; name: string }[]): string {
  let body = latex.replace(/#/g, "\\#");
  // Longer parts first, so a part inside another is not cut.
  for (const p of [...parts].sort((a, b) => b.latex.length - a.latex.length)) {
    if (!p.latex.trim()) continue;
    const esc = p.latex.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // A whole token: not the start of a longer command or letter run (\alpha in \alphabet, x in xy).
    const re = new RegExp(`${esc}(?![A-Za-z])`, "g");
    body = body.replace(re, `#${p.name}`);
  }
  return body;
}

/** A proposed slot name for a symbol: v, omega, F, r1. */
export function slotNameFor(latex: string, taken: string[] = []): string {
  const letters = latex.replace(/\\(?:mathbf|boldsymbol|bm|hat|vec|dot|bar|tilde|pvec|bvec|cmat|vectrix|dyadic|mathrm|mathit)\b/g, "").match(/\\[A-Za-z]+|[A-Za-z0-9]/g) ?? ["s"];
  let base = letters.map((x) => x.replace(/^\\/, "")).join("").slice(0, 12) || "s";
  if (!/^[A-Za-z]/.test(base)) base = `s${base}`;
  let name = base;
  for (let k = 2; taken.includes(name); k++) name = `${base}${k}`;
  return name;
}

// ------------------------------------------------------------------ export / import

export const BLOCKSET_FORMAT = "mathblocks-blocks";

export interface BlockSetFile {
  format: typeof BLOCKSET_FORMAT;
  version: 1;
  groups: BlockGroup[];
  blocks: Omit<Block, "scope" | "useCount">[];
}

export function exportBlockSet(blocks: Block[], groups: BlockGroup[]): BlockSetFile {
  const used = new Set(blocks.map((b) => b.groupId).filter(Boolean));
  return {
    format: BLOCKSET_FORMAT,
    version: 1,
    groups: groups.filter((g) => used.has(g.id) || groups.some((c) => c.parentId === g.id && used.has(c.id))),
    blocks: blocks.map(({ scope: _s, useCount: _u, ...b }) => b),
  };
}

/** Reads a block-set file; throws with a readable message when it is not one. */
export function parseBlockSet(text: string): BlockSetFile {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    throw new Error("Not a MathBlocks block set (the file is not JSON)");
  }
  const f = o as Partial<BlockSetFile>;
  if (f.format !== BLOCKSET_FORMAT || !Array.isArray(f.blocks)) throw new Error("Not a MathBlocks block set");
  for (const b of f.blocks) if (typeof b.name !== "string" || typeof b.body !== "string") throw new Error("A block in the file has no name or body");
  return { format: BLOCKSET_FORMAT, version: 1, groups: Array.isArray(f.groups) ? f.groups : [], blocks: f.blocks };
}

export type ClashChoice = "keep-both" | "replace" | "skip";

/** What importing does: new blocks, replaced ones, skipped ones; names/triggers made unique when both are kept. */
export function planImport(existing: Block[], file: BlockSetFile, choice: (incoming: BlockSetFile["blocks"][number], clash: Block) => ClashChoice): { add: BlockSetFile["blocks"]; replace: { id: string; with: BlockSetFile["blocks"][number] }[]; skipped: string[] } {
  const add: BlockSetFile["blocks"] = [];
  const replace: { id: string; with: BlockSetFile["blocks"][number] }[] = [];
  const skipped: string[] = [];
  const names = new Set(existing.map((b) => b.name.toLowerCase()));
  const triggers = new Set(existing.map((b) => b.trigger).filter(Boolean));
  for (const b of file.blocks) {
    const clash = existing.find((e) => e.name.toLowerCase() === b.name.toLowerCase() || (b.trigger && e.trigger === b.trigger));
    if (!clash) {
      add.push(b);
      names.add(b.name.toLowerCase());
      if (b.trigger) triggers.add(b.trigger);
      continue;
    }
    const c = choice(b, clash);
    if (c === "skip") skipped.push(b.name);
    else if (c === "replace") replace.push({ id: clash.id, with: b });
    else {
      let name = b.name;
      for (let k = 2; names.has(name.toLowerCase()); k++) name = `${b.name} (${k})`;
      let trigger = b.trigger;
      if (trigger) for (let k = 2; triggers.has(trigger); k++) trigger = `${b.trigger}${k}`;
      names.add(name.toLowerCase());
      if (trigger) triggers.add(trigger);
      add.push({ ...b, name, trigger });
    }
  }
  return { add, replace, skipped };
}

/** The block drawn as a tile or preview: nested blocks expanded, each slot an empty box (a default shows). */
/** `slot`: what an empty slot is drawn as (#? for a palette tile: a dotted box). */
export function previewLatex(block: Pick<Block, "body" | "slots">, lookup: (name: string) => Block | undefined = () => undefined, slot = "\\square "): string {
  let body = block.body;
  try {
    body = expandNested(body, lookup);
  } catch {
    // A cycle: draw the body as it is.
  }
  let unnamed = 0;
  return body
    .replace(SLOT_RE, (all, bs: string, n: string) => {
      if (bs.length % 2 === 1) return all;
      const name = n === "?" || n === "0" ? String(++unnamed) : n;
      const d = block.slots.find((s) => s.name === name)?.default;
      return `${bs}${d ? `{${d}}` : slot}`;
    });
}
