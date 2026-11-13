import type { SymbolContext } from "@mathblocks/math-core";

/**
 * The editor's view of a letter for "what kind is this?" (docs/KINDS-MODEL.md §7): from the visual editor's
 * model (MathLive atoms): the atom that ends at caret offset `offset`. Self-contained so a headless check
 * can run it.
 */
export function symbolContextAt(field: unknown, offset: number): (SymbolContext & { label: string }) | null {
  type Atom = { id?: string; type?: string; value?: string; command?: string; args?: unknown[]; parent?: Atom; parentBranch?: unknown; style?: { variant?: string; variantStyle?: string; fontSeries?: string }; branch?: (b: string) => Atom[] | undefined; hasEmptyBranch?: (b: string) => boolean };
  const model = (field as { _mathfield?: { model?: { at: (o: number) => Atom | undefined } } })._mathfield?.model;
  if (!model) return null;
  const atom = model.at(offset);
  if (!atom) return null;
  const differential = atom.command === "\\differentialD";
  const text = differential ? "d" : (atom.value ?? "");
  if (!/^[A-Za-zα-ωΑ-Ωϑϕϖϰϱϵς]$/u.test(text) && text !== "π") return null;
  const st = atom.style ?? {};
  const bold = /bold/.test(st.variantStyle ?? "") || st.fontSeries === "b";
  const forced = !bold && (st.variant === "normal" || st.variantStyle === "up" || st.variantStyle === "italic") && !differential;
  let where: "base" | "index" = "base";
  let inKind: string | undefined;
  for (let a: Atom | undefined = atom; a; a = a.parent) {
    if (a.parentBranch === "subscript" || a.parentBranch === "superscript") where = "index";
    const cls = a.command === "\\class" ? String(a.args?.[0] ?? "") : "";
    if (!inKind && cls.startsWith("nk-")) inKind = cls.slice(3);
  }
  // The run of letters around it (an index word: sf, max).
  let indexRun: string[] | undefined;
  if (where === "index" && atom.parent?.branch) {
    const sibs = (atom.parent.branch(String(atom.parentBranch)) ?? []).filter((x) => x.type !== "first");
    const i = sibs.indexOf(atom);
    const isLetter = (x: Atom | undefined) => !!x && x.type === "mord" && /^[A-Za-z]$/.test(x.value ?? "");
    let a = i;
    let b = i;
    while (isLetter(sibs[a - 1])) a--;
    while (isLetter(sibs[b + 1])) b++;
    indexRun = sibs.slice(a, b + 1).map((x) => x.value ?? "");
  }
  // Its scripts: on the atom itself, or on a script atom right after it (MathLive keeps either form).
  const siblings = atom.parent?.branch?.(String(atom.parentBranch))?.filter((x) => x.type !== "first") ?? [];
  const at = siblings.indexOf(atom);
  const next = siblings[at + 1];
  const scriptsOf = (b: string) => {
    const own = atom.branch?.(b)?.filter((x) => x.type !== "first") ?? [];
    if (own.length) return own;
    return next?.type === "subsup" ? (next.branch?.(b)?.filter((x) => x.type !== "first") ?? []) : [];
  };
  const subAtoms = scriptsOf("subscript");
  const sub = subAtoms.length && subAtoms.every((x) => /^[A-Za-z0-9]$/.test(x.value ?? "")) ? subAtoms.map((x) => x.value).join("") : undefined;
  const expBase = text === "e" && scriptsOf("superscript").length > 0;
  // A plain d is a differential where the drawing says so: first in a fraction's part or after a space, before a letter.
  const isLetterAtom = (x: Atom | undefined) => !!x && (x.type === "mord" || x.command === "\\class") && /^[A-Za-zα-ωΑ-Ω]?$/u.test(x.value ?? "");
  const prev = siblings[at - 1];
  const plainD = text === "d" && !differential && isLetterAtom(next) && (at === 0 ? atom.parentBranch === "above" || atom.parentBranch === "below" : prev?.type === "spacing" || prev?.type === "space");
  return { text, sub, bold, forced, where, indexRun, differential: differential || plainD, expBase, inKind, label: sub ? `${text}_${sub}` : text };
}
