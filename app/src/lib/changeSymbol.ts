import type { MathNode, MathStyle, Row, SymbolRule } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { definitionSymbol, symbolsIn } from "./symbolList";

/**
 * Change the symbol of a quantity everywhere (pure part; the Word side is changeSymbolRun.ts). A quantity keeps its
 * meaning and unit; only its symbol is replaced — in equations, in its \define marker and in the list of symbols.
 *
 * Symbols are matched by identity, as the list of symbols identifies them (symbolsIn / definitionSymbol): a bold ω
 * made a vector by a document rule and \pvec{\omega} are one symbol; v_0 is not v. Occurrences come in three groups:
 * - exact: the symbol itself;
 * - decorated: the symbol with an index, power, prime, time-derivative dot or frame label (\pvec{\omega}_{ba},
 *   \omega^2, \omega', \dot{\pvec{\omega}}, \pvec[B/N]{\omega}): changed keeping the decoration;
 * - related: the same letter as another kind (\cmat{\omega}, plain \omega when changing \pvec{\omega}): changed only
 *   when asked, by replacing the letter (\cmat{\Omega}, \Omega).
 */

export interface SymbolTarget {
  /** As written (\pvec{\omega}, v_0). */
  latex: string;
  /** Identity (the list of symbols' key). */
  key: string;
  /** The base letter (ω, v), "" when the symbol has none (an abbreviation). */
  letter: string;
  /** The symbol's node without a part-of-the-symbol subscript (\pvec{\omega}; v of v_0). */
  base: MathNode | null;
  /** A subscript that is part of the symbol (the 0 of v_0). */
  partSub?: Row;
}

export type OccurrenceClass = "exact" | "decorated" | "related";
export type Decoration = "index" | "power" | "prime" | "dot" | "frame";

export interface Occurrence {
  /** Order in its equation (stable for the same LaTeX). */
  id: number;
  cls: OccurrenceClass;
  decoration?: Decoration;
  /** Related forms: the related symbol's key and LaTeX (its group in the preview). */
  relatedKey?: string;
  relatedLatex?: string;
  /** The occurrence as written, and as it becomes. */
  before: string;
  after: string;
}

/** A symbol typed by the user (or a definition's symbol) as a target, or null when it names no symbol. */
export function symbolTarget(latex: string, style: MathStyle): SymbolTarget | null {
  const occ = definitionSymbol(latex.trim(), style);
  if (!occ) return null;
  let root: Row;
  try {
    root = parseLatex(latex.trim()).root;
  } catch {
    return null;
  }
  let base: MathNode | null = root.children.length === 1 ? root.children[0]! : null;
  let partSub: Row | undefined;
  if (base && base.kind === "scripts" && base.sub && !base.sup && base.base.children.length === 1) {
    // A subscript that belongs to the symbol (v_0): the definition's key holds it.
    const baseOcc = definitionSymbol(ser([base.base.children[0]!]), style);
    if (baseOcc && baseOcc.key !== occ.key) {
      partSub = base.sub;
      base = base.base.children[0]!;
    }
  }
  return { latex: latex.trim(), key: occ.key, letter: occ.letter, base, ...(partSub ? { partSub } : {}) };
}

const ser = (nodes: MathNode[]) => serializeLatex({ kind: "row", children: nodes });
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const row = (children: MathNode[]): Row => ({ kind: "row", children });
const DOTS = new Set(["dot", "ddot", "dddot"]);

/** The symbol a node is by itself (a letter, a kind object, an accented letter, a text abbreviation), or null. */
function nodeSymbol(n: MathNode, style: MathStyle): { key: string; letter: string } | null {
  if (!["ident", "notation", "accent", "text"].includes(n.kind)) return null;
  if (n.kind === "accent" && (n.body.children.length !== 1 || n.body.children[0]!.kind !== "ident")) return null;
  const o = symbolsIn(ser([n]), style)[0];
  return o ? { key: o.key, letter: o.letter } : null;
}

const isPrimes = (r: Row | undefined) => !!r && r.children.length > 0 && r.children.every((c) => c.kind === "operator" && /^[′″‴]$/.test(c.text));

/** Replaces the first letter `from` inside a node by `to` (related forms: \cmat{\omega} → \cmat{\Omega}). */
function withLetter(n: MathNode, from: string, to: string): MathNode {
  const out = clone(n);
  let done = false;
  const visit = (x: unknown) => {
    if (done || !x || typeof x !== "object") return;
    if (Array.isArray(x)) return x.forEach(visit);
    const m = x as { kind?: string; text?: string };
    if (m.kind === "ident" && m.text === from) {
      m.text = to;
      done = true;
      return;
    }
    for (const [k, v] of Object.entries(m)) if (k !== "meta" && k !== "frames") visit(v);
  };
  visit(out);
  return out;
}

/**
 * Rewrites the occurrences of `target` in an equation's LaTeX as `to`, for the occurrences `accept` takes. Returns
 * the new LaTeX (the same string when nothing changed) and every occurrence found (taken or not).
 */
export function changeInLatex(latex: string, target: SymbolTarget, to: SymbolTarget, style: MathStyle, accept: (o: Occurrence) => boolean = (o) => o.cls !== "related"): { latex: string; changed: boolean; occurrences: Occurrence[] } {
  let root: Row;
  try {
    root = parseLatex(latex).root;
  } catch {
    return { latex, changed: false, occurrences: [] };
  }
  const occurrences: Occurrence[] = [];
  let changed = false;
  const relatedAllowed = !target.partSub && !!target.letter && !!to.letter && !to.partSub;

  // The replacement of a symbol node: exact → the new symbol (frames kept on a kind); related → the letter replaced.
  const replacement = (n: MathNode, related: boolean): MathNode[] => {
    if (related) return [withLetter(n, target.letter, to.letter)];
    const frames = n.kind === "notation" ? n.frames : undefined;
    if (!to.base) return [];
    const base = clone(to.base);
    if (frames && base.kind === "notation") base.frames = clone(frames);
    return to.partSub ? [{ kind: "scripts", base: row([base]), sub: clone(to.partSub) }] : [base];
  };

  // A node that is the target (exact), or a related form of it; null otherwise.
  const match = (n: MathNode): { related: boolean; key: string } | null => {
    if (target.partSub) return null;
    const s = nodeSymbol(n, style);
    if (!s) return null;
    if (s.key === target.key) return { related: false, key: s.key };
    if (relatedAllowed && s.letter === target.letter && s.key !== target.key && nodeLetterCount(n) === 1) return { related: true, key: s.key };
    return null;
  };

  const record = (o: Omit<Occurrence, "id">): boolean => {
    const occ = { ...o, id: occurrences.length };
    occurrences.push(occ);
    const take = accept(occ);
    if (take) changed = true;
    return take;
  };

  const mapRow = (r: Row): Row => ({ ...r, children: r.children.flatMap(mapNode) });
  const mapInside = (n: MathNode): MathNode => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n)) out[k] = mapValue(v);
    return out as unknown as MathNode;
  };
  const mapValue = (v: unknown): unknown => {
    if (!v || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(mapValue);
    const o = v as { kind?: string };
    if (o.kind === "row") return mapRow(o as Row);
    if (o.kind) return mapInside(o as MathNode);
    return v;
  };

  // A scripts node whose base is decided (left as it is): its index and power are still looked into.
  const keepBase = (n: MathNode): MathNode => {
    if (n.kind !== "scripts") return n;
    return { ...n, ...(n.sub ? { sub: mapRow(n.sub) } : {}), ...(n.sup ? { sup: mapRow(n.sup) } : {}) } as MathNode;
  };

  const mapNode = (n: MathNode): MathNode[] => {
    if (n.kind === "scripts" && n.base.children.length === 1) {
      const b = n.base.children[0]!;
      if (target.partSub) {
        // v_0 (with or without a power): the whole indexed symbol.
        if (n.sub) {
          const whole = definitionSymbol(ser([{ ...n, sup: undefined } as MathNode]), style);
          if (whole && whole.key === target.key) {
            const after: MathNode[] = replacement(b, false).map((x) => (n.sup ? attachSup(x, mapRow(n.sup)) : x));
            const take = record({ cls: n.sup ? "decorated" : "exact", ...(n.sup ? { decoration: isPrimes(n.sup) ? "prime" : "power" } : {}), before: ser([n]), after: ser(after) });
            return take ? after : [keepBase(n)];
          }
        }
      } else {
        const m = match(b);
        // A subscript that belongs to the symbol makes it another symbol (v_0 is not v).
        const partOfSymbol = !!n.sub && (() => {
          const whole = symbolsIn(ser([{ ...n, sup: undefined } as MathNode]), style)[0];
          const alone = nodeSymbol(b, style);
          return !!whole && !!alone && whole.key !== alone.key;
        })();
        if (m && !partOfSymbol) {
          const decoration: Decoration = n.sub ? "index" : isPrimes(n.sup) ? "prime" : "power";
          const base = replacement(b, m.related);
          const after: MathNode = { ...n, base: row(base), ...(n.sub ? { sub: mapRow(n.sub) } : {}), ...(n.sup ? { sup: mapRow(n.sup) } : {}) } as MathNode;
          const take = record({ cls: m.related ? "related" : "decorated", decoration, ...(m.related ? { relatedKey: m.key, relatedLatex: ser([b]) } : {}), before: ser([n]), after: ser([after]) });
          return take ? [after] : [keepBase(n)];
        }
        // Another symbol (v_0 when changing v): its base stays; only its power is looked into.
        if (partOfSymbol) return [keepBase(n)];
      }
    }
    if (n.kind === "accent" && DOTS.has(n.accent) && n.body.children.length === 1) {
      const inner = n.body.children[0]!;
      const m = match(inner);
      // \dot{\omega} is an accented letter (its own symbol) unless the letter inside is the target or a kind.
      if (m && (inner.kind !== "ident" || m.key === target.key)) {
        const after: MathNode = { ...n, body: row(replacement(inner, m.related)) };
        const take = record({ cls: m.related ? "related" : "decorated", decoration: "dot", ...(m.related ? { relatedKey: m.key, relatedLatex: ser([inner]) } : {}), before: ser([n]), after: ser([after]) });
        return take ? [after] : [n];
      }
    }
    const m = match(n);
    if (m) {
      const framed = n.kind === "notation" && !!n.frames;
      const after = replacement(n, m.related);
      const take = record({ cls: m.related ? "related" : framed ? "decorated" : "exact", ...(framed ? { decoration: "frame" as const } : {}), ...(m.related ? { relatedKey: m.key, relatedLatex: ser([n]) } : {}), before: ser([n]), after: ser(after) });
      return take ? after : [n];
    }
    return [mapInside(n)];
  };

  const next = mapRow(root);
  return { latex: changed ? serializeLatex(next) : latex, changed, occurrences };
}

/** How many letters a symbol node holds (related forms are single-letter symbols). */
function nodeLetterCount(n: MathNode): number {
  let count = 0;
  const visit = (x: unknown) => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) return x.forEach(visit);
    const m = x as { kind?: string };
    if (m.kind === "ident") count++;
    for (const [k, v] of Object.entries(m)) if (k !== "meta" && k !== "frames") visit(v);
  };
  visit(n);
  return count;
}

function attachSup(n: MathNode, sup: Row): MathNode {
  if (n.kind === "scripts" && !n.sup) return { ...n, sup };
  return { kind: "scripts", base: row([n]), sup };
}

// ------------------------------------------------------------------ the whole document

export interface DocEquation {
  tag: string;
  latex: string;
  display: boolean;
  numbered: boolean;
  number?: string | null;
  /** The heading it comes under (the preview groups by it). */
  section?: string;
  /** Where it is when not in the main text. */
  story?: string;
}

export interface DocDefinition {
  start: number;
  symbol: string;
  meaning: string;
  unit?: string;
}

export interface PlannedEquation extends DocEquation {
  occurrences: Occurrence[];
}

export interface PlannedDefinition extends DocDefinition {
  /** What it is to the change: the quantity itself, a decorated form or a related form (its key). */
  cls: OccurrenceClass;
  relatedKey?: string;
  /** Its symbol after the change (meaning and unit stay). */
  after: string;
}

export interface RelatedGroup {
  key: string;
  latex: string;
  /** The related symbol after the change (\cmat{\Omega}). */
  after: string;
  count: number;
  definition?: DocDefinition;
}

export interface Clash {
  /** The symbol that already exists. */
  key: string;
  latex: string;
  equations: { tag: string; number?: string | null; section?: string }[];
  definitions: DocDefinition[];
}

export interface ChangePlan {
  target: SymbolTarget;
  to: SymbolTarget;
  equations: PlannedEquation[];
  definitions: PlannedDefinition[];
  related: RelatedGroup[];
  counts: { equations: number; inline: number; display: number; numbered: number; exact: number; decorated: number; related: number; definitions: number };
}

/** Everything the change would touch (nothing changed yet): the preview. */
export function planChange(fromLatex: string, toLatex: string, eqs: DocEquation[], defs: DocDefinition[], style: MathStyle): ChangePlan | { error: string } {
  const target = symbolTarget(fromLatex, style);
  if (!target) return { error: `“${fromLatex}” is not a symbol.` };
  const to = symbolTarget(toLatex, style);
  if (!to) return { error: `“${toLatex}” is not a symbol: type the new symbol (a letter, a kind, an indexed letter).` };
  if (to.key === target.key) return { error: "The new symbol is the same symbol." };
  const all = () => true;
  const equations: PlannedEquation[] = [];
  const related = new Map<string, RelatedGroup>();
  for (const e of eqs) {
    const r = changeInLatex(e.latex, target, to, style, all);
    if (!r.occurrences.length) continue;
    equations.push({ ...e, occurrences: r.occurrences });
    for (const o of r.occurrences) {
      if (o.cls !== "related" || !o.relatedKey) continue;
      const g = related.get(o.relatedKey) ?? { key: o.relatedKey, latex: o.relatedLatex ?? o.relatedKey, after: relatedAfter(o.relatedLatex ?? o.relatedKey, target, to, style), count: 0 };
      g.count++;
      related.set(o.relatedKey, g);
    }
  }
  const definitions: PlannedDefinition[] = [];
  for (const d of defs) {
    const r = changeInLatex(d.symbol, target, to, style, all);
    const o = r.occurrences[0];
    if (!o || r.occurrences.length !== 1 || o.before !== serializeLatex(parseLatex(d.symbol).root)) continue;
    definitions.push({ ...d, cls: o.cls, ...(o.relatedKey ? { relatedKey: o.relatedKey } : {}), after: r.latex });
    if (o.relatedKey) {
      const g = related.get(o.relatedKey) ?? { key: o.relatedKey, latex: o.relatedLatex ?? o.relatedKey, after: r.latex, count: 0 };
      g.definition = d;
      related.set(o.relatedKey, g);
    }
  }
  const occ = equations.flatMap((e) => e.occurrences);
  return {
    target,
    to,
    equations,
    definitions,
    related: [...related.values()],
    counts: {
      equations: equations.length,
      inline: equations.filter((e) => !e.display).length,
      display: equations.filter((e) => e.display && !e.numbered).length,
      numbered: equations.filter((e) => e.numbered).length,
      exact: occ.filter((o) => o.cls === "exact").length,
      decorated: occ.filter((o) => o.cls === "decorated").length,
      related: occ.filter((o) => o.cls === "related").length,
      definitions: definitions.length,
    },
  };
}

function relatedAfter(latex: string, target: SymbolTarget, to: SymbolTarget, style: MathStyle): string {
  return changeInLatex(latex, target, to, style, () => true).latex;
}

/** The user's choices in the preview. */
export interface ChangeChoices {
  /** Occurrences left out ("tag#id"); everything else exact/decorated is changed. */
  skip: Set<string>;
  /** Related symbols to change (their keys). */
  related: Set<string>;
  /** Definitions left out (their start). */
  skipDefinitions?: Set<number>;
}

export const occurrenceId = (tag: string, id: number) => `${tag}#${id}`;

/** The decision for one occurrence. */
export function takes(o: Occurrence, tag: string, c: ChangeChoices): boolean {
  if (c.skip.has(occurrenceId(tag, o.id))) return false;
  return o.cls === "related" ? !!o.relatedKey && c.related.has(o.relatedKey) : true;
}

/** The new LaTeX of every equation and definition the choices change. */
export function applyChoices(plan: ChangePlan, c: ChangeChoices, style: MathStyle): { equations: { tag: string; latex: string }[]; definitions: { start: number; symbol: string; meaning: string; unit?: string }[] } {
  const equations: { tag: string; latex: string }[] = [];
  for (const e of plan.equations) {
    const r = changeInLatex(e.latex, plan.target, plan.to, style, (o) => takes(o, e.tag, c));
    if (r.changed && r.latex !== e.latex) equations.push({ tag: e.tag, latex: r.latex });
  }
  const definitions = plan.definitions
    .filter((d) => !c.skipDefinitions?.has(d.start) && (d.cls !== "related" || (!!d.relatedKey && c.related.has(d.relatedKey))))
    .map((d) => ({ start: d.start, symbol: d.after, meaning: d.meaning, ...(d.unit ? { unit: d.unit } : {}) }));
  return { equations, definitions };
}

/**
 * Symbols that would clash: the new symbol (and, when ticked, the related forms' new symbols) already used in an
 * equation or defined.
 */
export function findClashes(plan: ChangePlan, c: ChangeChoices, eqs: DocEquation[], defs: DocDefinition[], style: MathStyle): Clash[] {
  const wanted = new Map<string, string>([[plan.to.key, plan.to.latex]]);
  for (const g of plan.related) {
    if (!c.related.has(g.key)) continue;
    const t = symbolTarget(g.after, style);
    if (t) wanted.set(t.key, g.after);
  }
  const out: Clash[] = [];
  for (const [key, latex] of wanted) {
    const equations = eqs.filter((e) => symbolsIn(e.latex, style).some((o) => o.key === key || o.alsoKey === key)).map((e) => ({ tag: e.tag, number: e.number ?? null, ...(e.section ? { section: e.section } : {}) }));
    const definitions = defs.filter((d) => definitionSymbol(d.symbol, style)?.key === key);
    if (equations.length || definitions.length) out.push({ key, latex, equations, definitions });
  }
  return out;
}

/**
 * The document's symbol rules after the change: a rule that makes the old letter a kind ("ω is a vector when bold")
 * follows the new letter, so a bold Ω is a vector as the bold ω was. Related rules only when that form is ticked.
 */
export function changeRules(rules: SymbolRule[], plan: ChangePlan, c: ChangeChoices): { rules: SymbolRule[]; changed: number } {
  if (!plan.target.letter || !plan.to.letter || plan.target.partSub || plan.to.partSub) return { rules, changed: 0 };
  const kinds = new Set<string>();
  const targetKind = kindOf(plan.target);
  if (targetKind) kinds.add(targetKind);
  for (const g of plan.related) if (c.related.has(g.key)) kinds.add(kindOfKey(g.key) ?? "variable");
  let changed = 0;
  const out = rules.map((r) => {
    if (r.text !== plan.target.letter || !kinds.has(r.kind)) return r;
    changed++;
    return { ...r, text: plan.to.letter, symbol: replaceLetterLatex(r.symbol, plan.target.letter, plan.to.letter) };
  });
  return { rules: out, changed };
}

const kindOf = (t: SymbolTarget) => (t.base?.kind === "notation" ? t.base.name : undefined);
const kindOfKey = (key: string) => /^\\([A-Za-z]+)\{/.exec(key)?.[1];

function replaceLetterLatex(latex: string, from: string, to: string): string {
  try {
    const root = parseLatex(latex).root;
    return serializeLatex(row(root.children.map((n) => withLetter(n, from, to))));
  } catch {
    return latex;
  }
}
