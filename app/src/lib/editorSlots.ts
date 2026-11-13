/**
 * Slots and deletion in the visual editor, on MathLive's atom tree (the field's model). Each function is
 * self-contained (no imports, no outer names) so the headless checks (tools/editor-keys-check.ts) run this
 * exact code in a page with the real editor.
 *
 * Space / Shift+Space — the slots of the innermost structure around the caret, in reading order, like Tab
 * in MathType: a fraction's numerator then denominator; a big operator's lower limit, upper limit, then the
 * body (right after the operator); a root's index then its radicand; scripts (subscript, superscript);
 * matrices cell by cell; accents, fences and every other template's body. After the last slot the caret
 * leaves the structure; Shift+Space goes back one slot (and, right after a structure, into its last slot).
 *
 * Backspace — one character at a time. When the next thing to delete is a structure or a notation kind,
 * the first Backspace selects it (highlighted) and the second deletes it. At the start of a later slot it
 * moves to the end of the previous slot; at the start of the first slot it selects the whole structure.
 * Nothing else is ever removed by one key.
 */

export interface SlotField {
  position: number;
  selectionIsCollapsed: boolean;
  executeCommand: (c: unknown) => boolean;
}

/** What a key did: "moved" (slot change), "selected" (a structure is now selected), "deleted", or null (left to the editor). */
export type SlotAction = "moved" | "out" | "selected" | "deleted" | null;

/** Space (dir 1) or Shift+Space (dir −1): to the next / previous slot. Null when the caret is in no structure. */
export function moveSlot(field: SlotField, dir: 1 | -1): SlotAction {
  type Branch = string | [number, number];
  type Atom = {
    type: string;
    command?: string;
    args?: unknown[];
    parent?: Atom;
    parentBranch?: Branch;
    leftSibling?: Atom;
    rightSibling?: Atom;
    branches: string[];
    branch: (n: string) => Atom[] | undefined;
    rows?: (Atom[] | undefined)[][];
  };
  type Model = { at: (o: number) => Atom; offsetOf: (a: Atom) => number; position: number; setSelection: (a: number, b: number) => void };
  const model = (field as unknown as { _mathfield?: { model?: Model } })._mathfield?.model;
  if (!model) return null;
  const isKind = (a: Atom) => a.command === "\\class" && String(a.args?.[0] ?? "").startsWith("nk-");
  const slotsOf = (s: Atom): Branch[] => {
    if (s.rows) {
      const out: Branch[] = [];
      s.rows.forEach((row, r) => row.forEach((cell, c) => cell && out.push([r, c])));
      return out;
    }
    // A root's index comes before its radicand; otherwise body, above, below, then the scripts.
    const order = s.type === "surd" ? ["above", "body", "subscript", "superscript"] : ["body", "above", "below", "subscript", "superscript"];
    return order.filter((n) => s.branches.includes(n));
  };
  const atomsOf = (s: Atom, b: Branch): Atom[] => (typeof b === "string" ? s.branch(b) ?? [] : s.rows?.[b[0]]?.[b[1]] ?? []);
  const same = (a: Branch | undefined, b: Branch) => (typeof b === "string" ? a === b : Array.isArray(a) && a[0] === b[0] && a[1] === b[1]);
  /** Caret into a slot: an empty slot's placeholder selected, otherwise the caret at the slot's end. */
  const enter = (s: Atom, b: Branch, atEnd: boolean) => {
    const atoms = atomsOf(s, b).filter((x) => x.type !== "first");
    if (atoms.length === 1 && atoms[0]!.type === "placeholder") {
      const o = model.offsetOf(atoms[0]!);
      model.setSelection(o - 1, o);
      return;
    }
    const all = atomsOf(s, b);
    model.position = model.offsetOf(atEnd ? all[all.length - 1]! : all[0]!);
  };
  const pos = field.position;
  // (A selected placeholder counts as the caret in its slot.)
  const here = model.at(pos);
  const s = here?.parent;
  // Right after a structure, outside every structure: Shift+Space goes into its last slot.
  if (dir < 0 && here && here.branches.length && !isKind(here) && (!s || s.type === "root")) {
    const slots = slotsOf(here);
    if (slots.length) {
      enter(here, slots[slots.length - 1]!, true);
      return "moved";
    }
  }
  if (!s || s.type === "root" || !here) return null;
  // A block's slot (or the block itself): the block's own order (blocks/session.ts).
  if (s.command === "\\class" && /^mb[sb]-/.test(String(s.args?.[0] ?? ""))) return null;
  // Inside a kind (its frame, its accent): the kind's own rule — its empty slots, then out of the kind.
  for (let p: Atom | undefined = s; p; p = p.parent) if (isKind(p)) return null;
  const slots = slotsOf(s);
  const i = slots.findIndex((b) => same(here!.parentBranch, b));
  if (i < 0) return null;
  const next = i + dir;
  if (next >= 0 && next < slots.length) {
    enter(s, slots[next]!, true);
    return "moved";
  }
  // Past the last slot: right after the structure (a big operator's empty body slot is selected, ready to
  // type); before the first: right before it.
  const after = s.rightSibling;
  if (dir > 0 && after?.type === "placeholder") {
    const o = model.offsetOf(after);
    model.setSelection(o - 1, o);
    return "out";
  }
  model.position = dir > 0 ? model.offsetOf(s) : s.leftSibling ? model.offsetOf(s.leftSibling) : model.offsetOf(s) - 1;
  return "out";
}

/** Backspace (dir −1) or Delete (dir 1) with the new rule. Null: an ordinary one-character deletion (left to the editor). */
export function deleteStep(field: SlotField, dir: -1 | 1): SlotAction {
  type Branch = string | [number, number];
  type Atom = {
    type: string;
    command?: string;
    args?: unknown[];
    parent?: Atom;
    parentBranch?: Branch;
    leftSibling?: Atom;
    rightSibling?: Atom;
    branches: string[];
    branch: (n: string) => Atom[] | undefined;
    rows?: (Atom[] | undefined)[][];
  };
  type Model = {
    at: (o: number) => Atom;
    offsetOf: (a: Atom) => number;
    position: number;
    setSelection: (a: number, b: number) => void;
    selection: unknown;
    getAtoms: (s: unknown) => Atom[];
    deferNotifications: (o: unknown, f: () => void) => boolean;
  };
  const mathfield = (field as unknown as { _mathfield?: { model?: Model; snapshot?: (op: string) => void } })._mathfield;
  const model = mathfield?.model;
  if (!model) return null;
  if (!field.selectionIsCollapsed) {
    // A selection inside one slot (a structure selected by the first Backspace, or the user's own): exactly
    // those atoms go and the slot stays, empty. (The editor's own delete widens a selection that fills a
    // slot to the structure around it — a fence, a fraction — and, at the top, to the whole equation.)
    const atoms = model.getAtoms(model.selection).filter((x) => x.type !== "first");
    const p = atoms[0]?.parent;
    const pb = atoms[0]?.parentBranch;
    const sameSlot = atoms.length > 0 && atoms.every((x) => x.parent === p && JSON.stringify(x.parentBranch) === JSON.stringify(pb));
    if (!sameSlot || !p) return null;
    const left = atoms[0]!.leftSibling;
    model.deferNotifications({ content: true, selection: true, type: dir < 0 ? "deleteContentBackward" : "deleteContentForward" }, () => {
      for (const x of atoms) (p as unknown as { removeChild: (c: Atom) => void }).removeChild(x);
      if (left) model.position = model.offsetOf(left);
    });
    mathfield?.snapshot?.("delete");
    return "deleted";
  }
  const isKind = (a: Atom) => a.command === "\\class" && String(a.args?.[0] ?? "").startsWith("nk-");
  /** A structure: anything with slots of its own (fraction, root, matrix, fence, accent, big operator with limits…) or a kind. */
  const isStructure = (a: Atom) => isKind(a) || !!a.rows || a.branches.some((b) => b === "body" || b === "above" || b === "below");
  const onlyScripts = (a: Atom) => !isStructure(a) && a.branches.length > 0;
  const select = (a: Atom) => {
    const start = a.leftSibling ? model.offsetOf(a.leftSibling) : model.offsetOf(a) - 1;
    model.setSelection(start, model.offsetOf(a));
    return "selected" as const;
  };
  /** The innermost kind around an atom (a kind is deleted whole, never letter by letter from inside its frame). */
  const kindAround = (a: Atom | undefined): Atom | null => {
    for (let p = a?.parent; p; p = p.parent) if (isKind(p)) return p;
    return null;
  };
  const pos = field.position;
  const here = model.at(pos);
  if (!here) return null;
  if (dir < 0) {
    if (here.type === "first") {
      const s = here.parent;
      if (!s || s.type === "root") return "moved"; // start of the equation: nothing to delete
      const kind = isKind(s) ? s : kindAround(here);
      if (kind) return select(kind);
      // At the start of a later slot: to the end of the previous one; at the first slot: the structure is selected.
      const slots: Branch[] = s.rows
        ? s.rows.flatMap((row, r) => row.map((cell, c) => (cell ? ([r, c] as Branch) : null)).filter((x): x is Branch => x !== null))
        : (s.type === "surd" ? ["above", "body", "subscript", "superscript"] : ["body", "above", "below", "subscript", "superscript"]).filter((n) => s.branches.includes(n));
      const pb = here.parentBranch;
      const i = slots.findIndex((b) => (typeof b === "string" ? pb === b : Array.isArray(pb) && pb[0] === b[0] && pb[1] === b[1]));
      if (i > 0) {
        const b = slots[i - 1]!;
        const atoms = typeof b === "string" ? s.branch(b) ?? [] : s.rows?.[b[0]]?.[b[1]] ?? [];
        model.position = model.offsetOf(atoms[atoms.length - 1]!);
        return "moved";
      }
      return select(s);
    }
    if (isKind(here)) return select(here);
    const kind = kindAround(here);
    if (kind) {
      // Inside a kind: a letter of its base or frame labels goes one by one while others remain (a typo
      // fixed); the last one would leave the kind empty, so the kind is selected instead.
      const pb = here.parentBranch;
      const p = here.parent!;
      const sibs = (typeof pb === "string" ? p.branch(pb) ?? [] : p.rows?.[pb![0]]?.[pb![1]] ?? []).filter((x) => x.type !== "first");
      if (!isStructure(here) && !onlyScripts(here) && sibs.length > 1) return null;
      return select(kind);
    }
    if (isStructure(here)) return select(here);
    if (onlyScripts(here)) {
      // x² ← : into the script, so the next Backspace deletes its last character.
      const b = here.branches.includes("superscript") ? "superscript" : "subscript";
      const atoms = here.branch(b) ?? [];
      model.position = model.offsetOf(atoms[atoms.length - 1]!);
      return "moved";
    }
    return null;
  }
  // Delete: the thing after the caret.
  const next = here.rightSibling;
  if (!next) return null;
  if (isKind(next) || isStructure(next)) return select(next);
  return null;
}
