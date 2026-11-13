/**
 * Filling a block's slots in the visual editor. An inserted block is wrapped (\class{mbb-<id>}{…}) and
 * each slot occurrence too (\class{mbs-<id>-<k>-<name>}{…}); the wrappers are invisible and never reach
 * the saved LaTeX (stripSlotWrappers). These functions are self-contained (only the field and its model),
 * so the headless check (tools/blocks-check.ts) runs this exact code.
 *
 * - Space: the next slot of the block, in the block's slot order (a repeated slot is visited once);
 *   after the last, the caret leaves the block. Shift+Space: the previous slot.
 * - Typing in a slot that appears more than once updates the other occurrences as you type.
 */

export interface SessionField {
  position: number;
  selectionIsCollapsed: boolean;
  getValue: (a: number, b: number, f: "latex") => string;
  insert: (s: string, o: Record<string, unknown>) => boolean;
}

/** The slot the caret is in: its name and place in the order (null when outside every slot of the session). */
export function currentSlot(field: SessionField, session: string, order: string[]): { name: string; index: number; total: number; empty: boolean } | null {
  type Atom = { type: string; command?: string; args?: unknown[]; parent?: Atom; body?: Atom[] };
  const mf = (field as unknown as { _mathfield?: { model?: { at: (o: number) => Atom } } })._mathfield;
  const model = mf?.model;
  if (!model) return null;
  const prefix = `mbs-${session}-`;
  for (let a: Atom | undefined = model.at(field.position); a; a = a.parent) {
    const cls = a.command === "\\class" ? String(a.args?.[0] ?? "") : "";
    if (cls.startsWith(prefix)) {
      const name = cls.slice(prefix.length).replace(/^\d+-/, "");
      const atoms = (a.body ?? []).filter((x) => x.type !== "first");
      return { name, index: order.indexOf(name), total: order.length, empty: atoms.length === 0 || (atoms.length === 1 && atoms[0]!.type === "placeholder") };
    }
  }
  return null;
}

/**
 * Space (dir 1) / Shift+Space (dir −1) in a block being filled. "moved": to another slot; "done": past the
 * last slot, the caret right after the block; null: the caret is not in this block's slots.
 */
export function sessionMove(field: SessionField, session: string, order: string[], dir: 1 | -1): "moved" | "done" | null {
  type Atom = { type: string; command?: string; args?: unknown[]; parent?: Atom; body?: Atom[] };
  type Model = { at: (o: number) => Atom; offsetOf: (a: Atom) => number; position: number; setSelection: (a: number, b: number) => void; findAtom: (f: (a: Atom) => boolean, o: number, d: string) => Atom | undefined; atoms?: Atom[] };
  const model = (field as unknown as { _mathfield?: { model?: Model } })._mathfield?.model;
  if (!model) return null;
  const prefix = `mbs-${session}-`;
  const clsOf = (a: Atom) => (a.command === "\\class" ? String(a.args?.[0] ?? "") : "");
  let here: Atom | undefined;
  for (let a: Atom | undefined = model.at(field.position); a; a = a.parent) if (clsOf(a).startsWith(prefix)) here = here ?? a;
  if (!here) return null;
  const name = clsOf(here).slice(prefix.length).replace(/^\d+-/, "");
  const i = order.indexOf(name);
  const nextName = order[i + dir];
  const find = (f: (a: Atom) => boolean) => model.findAtom(f, 0, "forward");
  if (nextName === undefined) {
    if (dir < 0) return "moved"; // before the first slot: stay
    const block = find((a) => clsOf(a) === `mbb-${session}`);
    if (block) model.position = model.offsetOf(block);
    return "done";
  }
  // The first occurrence of that slot (its repeats follow it).
  const target = find((a) => clsOf(a).startsWith(prefix) && clsOf(a).slice(prefix.length).replace(/^\d+-/, "") === nextName);
  if (!target) return "done";
  const atoms = (target.body ?? []).filter((x) => x.type !== "first");
  if (atoms.length === 1 && atoms[0]!.type === "placeholder") {
    const o = model.offsetOf(atoms[0]!);
    model.setSelection(o - 1, o);
  } else {
    const all = target.body ?? [];
    model.position = model.offsetOf(all[all.length - 1]!);
  }
  return "moved";
}

/** Puts the caret in a slot (the first occurrence of `name`): its placeholder selected, or at its end. */
export function enterFirstSlot(field: SessionField, session: string, name: string): boolean {
  type Atom = { type: string; command?: string; args?: unknown[]; body?: Atom[] };
  type Model = { offsetOf: (a: Atom) => number; position: number; setSelection: (a: number, b: number) => void; findAtom: (f: (a: Atom) => boolean, o: number, d: string) => Atom | undefined };
  const model = (field as unknown as { _mathfield?: { model?: Model } })._mathfield?.model;
  if (!model) return false;
  const prefix = `mbs-${session}-`;
  const t = model.findAtom((a) => a.command === "\\class" && String(a.args?.[0] ?? "").startsWith(prefix) && String(a.args?.[0]).slice(prefix.length).replace(/^\d+-/, "") === name, 0, "forward");
  if (!t) return false;
  const atoms = (t.body ?? []).filter((x) => x.type !== "first");
  if (atoms.length === 1 && atoms[0]!.type === "placeholder") {
    const o = model.offsetOf(atoms[0]!);
    model.setSelection(o - 1, o);
  } else model.position = model.offsetOf((t.body ?? [])[(t.body ?? []).length - 1]!);
  return true;
}

/**
 * After typing in a slot used more than once: its other occurrences take the same contents (without
 * adding undo steps; the caret stays where it was in the slot being typed in).
 */
export function syncRepeats(field: SessionField, session: string): number {
  type Atom = { type: string; command?: string; args?: unknown[]; parent?: Atom; body?: Atom[] };
  type Model = { at: (o: number) => Atom; offsetOf: (a: Atom) => number; position: number; setSelection: (a: number, b: number) => void; findAtom: (f: (a: Atom) => boolean, o: number, d: string) => Atom | undefined };
  const mf = (field as unknown as { _mathfield?: { model?: Model; undoManager?: { recording: boolean } } })._mathfield;
  const model = mf?.model;
  if (!model) return 0;
  const prefix = `mbs-${session}-`;
  const clsOf = (a: Atom) => (a.command === "\\class" ? String(a.args?.[0] ?? "") : "");
  const nameOf = (a: Atom) => clsOf(a).slice(prefix.length).replace(/^\d+-/, "");
  let here: Atom | undefined;
  for (let a: Atom | undefined = model.at(field.position); a; a = a.parent) if (clsOf(a).startsWith(prefix)) here = here ?? a;
  if (!here) return 0;
  const name = nameOf(here);
  const hereCls = clsOf(here);
  const body = (a: Atom) => {
    const all = a.body ?? [];
    return field.getValue(model.offsetOf(all[0]!), model.offsetOf(all[all.length - 1]!), "latex");
  };
  const content = body(here);
  const caretFromEnd = model.offsetOf((here.body ?? [])[(here.body ?? []).length - 1]!) - field.position;
  // Every other occurrence of the same slot (found again after each change: offsets move).
  const others: string[] = [];
  for (let k = 0; k < 64; k++) {
    const cls = `${prefix}${k}-${name}`;
    if (cls !== hereCls && model.findAtom((a) => clsOf(a) === cls, 0, "forward")) others.push(cls);
  }
  let changed = 0;
  const undo = mf?.undoManager;
  const was = undo?.recording;
  if (undo) undo.recording = false;
  try {
    for (const cls of others) {
      const t = model.findAtom((a) => clsOf(a) === cls, 0, "forward");
      if (!t || body(t) === content) continue;
      const all = t.body ?? [];
      model.setSelection(model.offsetOf(all[0]!), model.offsetOf(all[all.length - 1]!));
      field.insert(content || "\\placeholder{}", { insertionMode: "replaceSelection", selectionMode: "after", silenceNotifications: true, format: "latex" });
      changed++;
    }
  } finally {
    if (undo) undo.recording = was ?? true;
  }
  if (changed) {
    const h = model.findAtom((a) => clsOf(a) === hereCls, 0, "forward");
    if (h) {
      const all = h.body ?? [];
      model.position = model.offsetOf(all[all.length - 1]!) - caretFromEnd;
    }
  }
  return changed;
}
