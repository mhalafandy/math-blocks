import type { MathNode, MathVariant, Row } from "./ast";
import { isTransposeMark } from "./bold";
import { DEFAULT_PROFILE, KIND_BY_ID, styleOf, type NotationProfile } from "./kinds";

/**
 * Document style: how a document's equations look, kept apart from what they mean.
 *
 * The equation source stores meaning (letters, indices, notation kinds); the style decides at
 * render time whether a letter is drawn italic or upright, how a transpose mark or a differential d
 * looks, and so on. Changing the style redraws equations; it never rewrites their LaTeX. A letter
 * the source styles explicitly (\mathrm{x}, \mathit{x}, \mathbf{x}) keeps that style: "Check
 * style" lists such overrides.
 */

export type Shape = "italic" | "upright";

/** What a single letter means when it is used as an index (classification, per document). */
export type LetterRole = "label" | "counter" | "variable" | "constant";

/**
 * Token kinds' styles (docs/KINDS-MODEL.md §2.1–2.2): every plain symbol has a kind, and its look comes from
 * that kind's style. `variable` has four variants by alphabet.
 */
export interface TokenKindStyles {
  variable: { latinLower: Shape; latinUpper: Shape; greekLower: Shape; greekUpper: Shape };
  /** e, i (when classified as a constant), π, and what a rule makes a constant. */
  constant: Shape;
  /** Function names (sin, cos, det…). */
  function: Shape;
  /** The d of derivatives and integrals (\diff is its explicit form). */
  operator: Shape;
  /** Descriptive index labels: multi-letter subscripts (b, sf, max) and letters classified as labels. */
  label: Shape;
  /** Index variables (letters classified as counters: i, j, k, n…). */
  counter: Shape;
  /** Roman numerals in indices (S_I, S_II, s_1^{IV}). */
  roman: Shape;
  /** Digits, in indices and elsewhere. */
  number: Shape;
  /** Units (\unit{m/s}). */
  unit: Shape;
  /** Text in equations (\text{…}). */
  text: Shape;
  /** Transpose mark (T after a matrix, \T is its explicit form). */
  transpose: "italic" | "upright" | "bold";
}

/**
 * A per-document override (docs/KINDS-MODEL.md §3): "e is a constant", "J is a matrix", "ω is a vector when
 * bold". `text` (and `sub`) is the symbol as the equation tree holds it (the letter "ω", subscript "0").
 */
export interface SymbolRule {
  /** The symbol as LaTeX (shown): "e", "J", "\\omega", "v_0". */
  symbol: string;
  text: string;
  sub?: string;
  when?: { bold?: boolean; where?: "anywhere" | "index" | "base" };
  /** A token kind ("constant") or a wrapper kind ("mat", "pvec", a user kind). */
  kind: string;
  note?: string;
}

export interface MathStyleGlobal {
  /** A bold base's index letters: drawn regular ("base") or bold too ("scripts"). */
  boldScope: "base" | "scripts";
  /** Accents over bold letters drawn in the bold weight. */
  accentsFollowBold: boolean;
  /** Equation size in points. */
  sizePt: number;
  /** Font family (Classic pictures: Times New Roman with Symbol, STIX for what they lack). */
  font: "times";
  /** Notation check (Convert LaTeX): warn when a frame (\\vectrix) has a subscript. */
  frameSubscriptWarning: boolean;
}

/** A document's style (v2: the kinds model). Stored in the document; v1 styles are migrated on reading. */
export interface MathStyle {
  version: 2;
  /** The letters-and-symbols preset this style started from (for display only). */
  preset: string;
  presetName?: string;
  presetDescription?: string;
  /** Token kinds. */
  kinds: TokenKindStyles;
  /** Wrapper kinds: notation preset (Hughes, Schaub, Markley) and per-kind changes. */
  notation: NotationProfile;
  /** Per-document symbol rules (the index-letter classification is kept here too, with where: "index"). */
  symbols: SymbolRule[];
  global: MathStyleGlobal;
  /** Check-style findings kept as deliberate exceptions (their keys). */
  exceptions: string[];
  /** Settings of the list of symbols (docs/SYMBOL-LIST.md). */
  symbolList?: Record<string, unknown>;
}

/**
 * The look of every token kind and the bold settings as one flat record — what a preset sets, and what
 * the drawing code reads (the field names of the v1 style).
 */
export interface Looks {
  labels: Shape;
  counters: Shape;
  romans: Shape;
  numbers: Shape;
  latinLower: Shape;
  latinUpper: Shape;
  greekLower: Shape;
  greekUpper: Shape;
  differential: Shape;
  constants: Shape;
  functions: Shape;
  text: Shape;
  units: Shape;
  transpose: "italic" | "upright" | "bold";
  boldScope: "base" | "scripts";
  accentsFollowBold: boolean;
}

/** The look settings a preset may set (not size, notation, rules or exceptions). */
export const LOOK_KEYS = ["labels", "counters", "romans", "numbers", "latinLower", "latinUpper", "greekLower", "greekUpper", "differential", "constants", "functions", "text", "transpose", "boldScope", "accentsFollowBold", "units"] as const;
export type LookKey = (typeof LOOK_KEYS)[number];

/** The flat look of a style. */
export function looksOf(style: MathStyle): Looks {
  const k = style.kinds;
  return {
    labels: k.label,
    counters: k.counter,
    romans: k.roman,
    numbers: k.number,
    latinLower: k.variable.latinLower,
    latinUpper: k.variable.latinUpper,
    greekLower: k.variable.greekLower,
    greekUpper: k.variable.greekUpper,
    differential: k.operator,
    constants: k.constant,
    functions: k.function,
    text: k.text,
    units: k.unit,
    transpose: k.transpose,
    boldScope: style.global.boldScope,
    accentsFollowBold: style.global.accentsFollowBold,
  };
}

/** A style with some looks changed (token kinds and the bold settings). */
export function withLooks(style: MathStyle, l: Partial<Looks>): MathStyle {
  const n: Looks = { ...(style.kinds?.variable ? looksOf(style) : BASE_LOOKS), ...l };
  return {
    ...style,
    kinds: {
      variable: { latinLower: n.latinLower, latinUpper: n.latinUpper, greekLower: n.greekLower, greekUpper: n.greekUpper },
      constant: n.constants,
      function: n.functions,
      operator: n.differential,
      label: n.labels,
      counter: n.counters,
      roman: n.romans,
      number: n.numbers,
      unit: n.units,
      text: n.text,
      transpose: n.transpose,
    },
    global: { ...style.global, boldScope: n.boldScope, accentsFollowBold: n.accentsFollowBold },
  };
}

const BASE_LOOKS: Looks = {
  labels: "italic",
  counters: "italic",
  romans: "upright",
  numbers: "upright",
  latinLower: "italic",
  latinUpper: "italic",
  greekLower: "italic",
  greekUpper: "upright",
  differential: "italic",
  constants: "italic",
  functions: "upright",
  text: "upright",
  units: "upright",
  transpose: "upright",
  boldScope: "base",
  accentsFollowBold: false,
};

const BASE: MathStyle = withLooks(
  {
    version: 2,
    preset: "mathblocks",
    kinds: {} as TokenKindStyles,
    notation: DEFAULT_PROFILE,
    symbols: [],
    global: { boldScope: "base", accentsFollowBold: false, sizePt: 12, font: "times", frameSubscriptWarning: false },
    exceptions: [],
  },
  BASE_LOOKS,
);

// ------------------------------------------------------------------ the index-letter classification (rules)

const ROLES: readonly string[] = ["label", "counter", "variable", "constant"];

/** A rule the v1 classification could express: one letter, no subscript, no condition but the place. */
const isClassification = (r: SymbolRule) => ROLES.includes(r.kind) && !r.sub && r.when?.bold === undefined && [...r.text].length === 1 && (r.when?.where ?? "anywhere") === ((r.kind === "label" || r.kind === "counter") ? "index" : "anywhere");

/** The single-letter classification (what index letters, e and d are), from the rules. */
export function letterRoles(style: Pick<MathStyle, "symbols">): Record<string, LetterRole> {
  const out: Record<string, LetterRole> = {};
  for (const r of style.symbols) if (isClassification(r)) out[r.text] = r.kind as LetterRole;
  return out;
}

/** The rule for one letter's classification (labels and counters apply in indices). */
export const classificationRule = (letter: string, role: LetterRole, symbol = letter): SymbolRule => ({ symbol, text: letter, kind: role, ...(role === "label" || role === "counter" ? { when: { where: "index" as const } } : {}) });

/** A style with the classification replaced (other rules kept). */
export function withLetterRoles(style: MathStyle, letters: Record<string, LetterRole>): MathStyle {
  return { ...style, symbols: [...style.symbols.filter((r) => !isClassification(r)), ...Object.entries(letters).map(([ch, role]) => classificationRule(ch, role))] };
}

/** The rules the classification does not hold (bold conditions, wrapper kinds, subscripts, other kinds). */
export const otherRules = (style: Pick<MathStyle, "symbols">) => style.symbols.filter((r) => !isClassification(r));

export interface StylePreset {
  id: string;
  name: string;
  description: string;
  /** What the preset sets (everything else is kept when it is applied). */
  values: Partial<Looks>;
}

const looks = (s: MathStyle): Looks => looksOf(s);

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "mathblocks",
    name: "MathBlocks default",
    description: "As MathBlocks drew equations before document styles: italic letters and lowercase Greek, upright capitals Greek, functions and text.",
    values: looks(BASE),
  },
  {
    id: "mathtype",
    name: "MathType Classic",
    description: "MathType's default styles: italic Latin letters, upright Greek, upright functions, numbers and text.",
    values: { ...looks(BASE), greekLower: "upright", greekUpper: "upright", transpose: "italic" },
  },
  {
    id: "iso",
    name: "ISO 80000-2",
    description: "Upright d, e, i, π, upright descriptive labels and transpose; italic variables and index variables.",
    values: { ...looks(BASE), labels: "upright", differential: "upright", constants: "upright", transpose: "upright" },
  },
  {
    id: "physics",
    name: "Physics / engineering",
    description: "Upright descriptive labels (v_max, σ_sf) and upright d; italic variables, counters and constants.",
    values: { ...looks(BASE), labels: "upright", differential: "upright" },
  },
  {
    id: "pure",
    name: "Pure mathematics",
    description: "Italic everything except function names and text, as in most mathematics texts.",
    values: { ...looks(BASE), greekUpper: "italic", transpose: "italic" },
  },
  {
    id: "chemistry",
    name: "Chemistry-friendly",
    description: "Upright capital letters (element symbols such as H, O, Na) and upright labels; italic lowercase variables.",
    values: { ...looks(BASE), latinUpper: "upright", labels: "upright", differential: "upright", constants: "upright" },
  },
];

export const STYLE_PRESET_BY_ID = new Map(STYLE_PRESETS.map((p) => [p.id, p]));

/** The style a new document starts with when the user has not set a default. */
export const DEFAULT_STYLE: MathStyle = BASE;

const shapeOf = (v: unknown): Shape | undefined => (v === "italic" || v === "upright" ? v : undefined);

/** Looks from a flat record (a v1 style or a preset's values); unknown values dropped. */
export function readLooks(o: Record<string, unknown>): Partial<Looks> {
  const out: Partial<Looks> = {};
  for (const k of ["labels", "counters", "romans", "numbers", "latinLower", "latinUpper", "greekLower", "greekUpper", "differential", "constants", "functions", "text", "units"] as const) {
    const v = shapeOf(o[k]);
    if (v) out[k] = v;
  }
  if (o.transpose === "italic" || o.transpose === "upright" || o.transpose === "bold") out.transpose = o.transpose;
  if (o.boldScope === "base" || o.boldScope === "scripts") out.boldScope = o.boldScope;
  if (typeof o.accentsFollowBold === "boolean") out.accentsFollowBold = o.accentsFollowBold;
  return out;
}

function readRule(x: unknown): SymbolRule | null {
  const r = x as Partial<SymbolRule> | null;
  if (!r || typeof r.text !== "string" || !r.text || typeof r.kind !== "string" || !r.kind) return null;
  const out: SymbolRule = { symbol: typeof r.symbol === "string" ? r.symbol : r.text, text: r.text, kind: r.kind };
  if (typeof r.sub === "string" && r.sub) out.sub = r.sub;
  const w = r.when;
  if (w && typeof w === "object") {
    const when: NonNullable<SymbolRule["when"]> = {};
    if (typeof w.bold === "boolean") when.bold = w.bold;
    if (w.where === "anywhere" || w.where === "index" || w.where === "base") when.where = w.where;
    if (Object.keys(when).length) out.when = when;
  }
  if (typeof r.note === "string" && r.note) out.note = r.note;
  return out;
}

/**
 * A full style from a stored or imported one (missing fields from the fallback; unknown values dropped).
 * A v1 style (flat fields) is migrated: its looks become the token kinds, its classification becomes rules
 * (docs/KINDS-MODEL.md §5, §9); it draws exactly as before.
 */
export function normalizeStyle(raw: unknown, fallback: MathStyle = DEFAULT_STYLE): MathStyle {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const v2 = o.version === 2;
  const g = (v2 && o.global && typeof o.global === "object" ? o.global : o) as Record<string, unknown>;
  // The look: v2 keeps it in kinds (+ global bold settings), v1 flat.
  let looksIn: Partial<Looks>;
  if (v2) {
    const k = (o.kinds && typeof o.kinds === "object" ? o.kinds : {}) as Record<string, unknown>;
    const v = (k.variable && typeof k.variable === "object" ? k.variable : {}) as Record<string, unknown>;
    looksIn = readLooks({
      latinLower: v.latinLower, latinUpper: v.latinUpper, greekLower: v.greekLower, greekUpper: v.greekUpper,
      constants: k.constant, functions: k.function, differential: k.operator, labels: k.label, counters: k.counter,
      romans: k.roman, numbers: k.number, units: k.unit, text: k.text, transpose: k.transpose,
      boldScope: g.boldScope, accentsFollowBold: g.accentsFollowBold,
    });
  } else looksIn = readLooks(o);
  let out: MathStyle = withLooks({ ...fallback, global: { ...fallback.global }, symbols: [...fallback.symbols], exceptions: [...fallback.exceptions] }, looksIn);
  if (typeof g.frameSubscriptWarning === "boolean") out.global.frameSubscriptWarning = g.frameSubscriptWarning;
  if (typeof g.sizePt === "number" && g.sizePt >= 6 && g.sizePt <= 72) out.global.sizePt = g.sizePt;
  if (typeof o.preset === "string") out.preset = o.preset;
  if (typeof o.presetName === "string") out.presetName = o.presetName;
  else if ("preset" in o) delete out.presetName;
  if (typeof o.presetDescription === "string") out.presetDescription = o.presetDescription;
  else if ("preset" in o) delete out.presetDescription;
  const n = o.notation as Record<string, unknown> | undefined;
  if (n && typeof n === "object" && typeof n.preset === "string") out.notation = { preset: n.preset as NotationProfile["preset"], overrides: (n.overrides as NotationProfile["overrides"]) ?? {} };
  if (v2 && Array.isArray(o.symbols)) out.symbols = o.symbols.map(readRule).filter((r): r is SymbolRule => !!r);
  if (!v2 && o.letters && typeof o.letters === "object") {
    const letters: Record<string, LetterRole> = {};
    for (const [ch, role] of Object.entries(o.letters as Record<string, unknown>)) if (role === "label" || role === "counter" || role === "variable" || role === "constant") letters[ch] = role;
    out = withLetterRoles({ ...out, symbols: [] }, letters);
  }
  if (Array.isArray(o.exceptions)) out.exceptions = o.exceptions.filter((x): x is string => typeof x === "string");
  if (v2 && o.symbolList && typeof o.symbolList === "object") out.symbolList = o.symbolList as Record<string, unknown>;
  return out;
}

/** Applies a preset's look to a style (size, notation, rules and exceptions are kept). */
export function applyPreset(style: MathStyle, preset: StylePreset): MathStyle {
  return { ...withLooks(style, preset.values), preset: preset.id, presetName: preset.name, presetDescription: preset.description };
}

/** Whether a style's look differs from a preset's. */
export function differsFrom(style: MathStyle, preset: StylePreset): boolean {
  const l = looksOf(style);
  return LOOK_KEYS.some((k) => k in preset.values && JSON.stringify(l[k]) !== JSON.stringify(preset.values[k]));
}

/** What a document says about its style: "Thesis style", or "Thesis style, modified" after changes. */
export function styleLabel(style: MathStyle, presets: StylePreset[]): string {
  const p = presets.find((x) => x.id === style.preset);
  const name = style.presetName ?? p?.name ?? "Custom style";
  return p && differsFrom(style, p) ? `${name}, modified` : name;
}

/**
 * Neutral starting values for a new style: LaTeX's own defaults — italic letters (Latin, lowercase
 * Greek, indices), upright digits, Greek capitals, d, e, i, π as variables (italic), upright function
 * names, text and transpose; bold on the base only.
 */
export const BLANK_STYLE_VALUES: StylePreset["values"] = { ...BASE_LOOKS };

/** The look part of a style, as a preset (save / export). */
export function presetFrom(style: MathStyle, id: string, name: string, description = ""): StylePreset {
  return { id, name, description, values: looks(style) };
}

/** A preset read from a file or the user's saved presets (v1 files keep working). */
export function normalizePreset(raw: unknown): StylePreset | null {
  const o = raw as Partial<StylePreset> | null;
  if (!o || typeof o.id !== "string" || typeof o.name !== "string") return null;
  return { id: o.id, name: o.name, description: typeof o.description === "string" ? o.description : "", values: readLooks((o.values ?? {}) as Record<string, unknown>) };
}

/**
 * A short fingerprint of everything that changes a drawing (recorded on each picture). Computed as for v1
 * styles, so a migrated style keeps its fingerprint (pictures drawn before are not "outdated"); what v1 could
 * not express (units, other rules) is added only when it differs from the default.
 */
export function styleHash(style: MathStyle): string {
  const { units, ...lk } = looksOf(style) as Partial<Looks>;
  // Added later: left out at its default so documents drawn before keep their fingerprint.
  if (lk.romans === "upright") delete lk.romans;
  const parts: unknown[] = [lk, style.global.sizePt, style.global.font, style.notation, Object.entries(letterRoles(style)).sort()];
  if (units !== "upright") parts.push({ units });
  const others = otherRules(style);
  if (others.length) parts.push(others.map((r) => [r.text, r.sub ?? "", r.kind, r.when?.bold ?? null, r.when?.where ?? "anywhere"]));
  const s = JSON.stringify(parts);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** The notation profile the style draws kinds with (the transpose, the differential and the explicit token forms included). */
export function styleNotation(style: MathStyle): NotationProfile {
  const k = style.kinds;
  const t = k.transpose === "bold" ? { weight: "bold" as const, shape: "upright" as const } : { weight: "regular" as const, shape: k.transpose };
  const o = style.notation.overrides;
  const tok = (id: string, shape: Shape) => ({ ...(o[id] ?? {}), shape });
  return {
    preset: style.notation.preset,
    overrides: {
      ...o,
      T: { ...(o.T ?? {}), ...t },
      diff: { ...(o.diff ?? {}), shape: k.operator },
      unit: tok("unit", k.unit),
      const: tok("const", k.constant),
      var: tok("var", k.variable.latinLower),
      op: tok("op", k.operator),
      lbl: tok("lbl", k.label),
      ctr: tok("ctr", k.counter),
    },
  };
}

// ------------------------------------------------------------------ classification of letters

const LATIN = /^[A-Za-z]$/;
const GREEK_LOWER = /^[α-ωϑϕϖϰϱϵς]$/u;
const GREEK_UPPER = /^[Α-Ω]$/u;
export const isStyleLetter = (ch: string) => LATIN.test(ch) || GREEK_LOWER.test(ch) || GREEK_UPPER.test(ch);

/** The renderer's own default shape for a letter (italic Latin and lowercase Greek, upright capital Greek). */
const defaultShape = (ch: string): Shape => (GREEK_UPPER.test(ch) || !isStyleLetter(ch) ? "upright" : "italic");

/** What the drawing reads: the flat looks, the classification and the wrapper kinds' profile. */
type Drawn = Looks & { letters: Record<string, LetterRole>; notation: NotationProfile };

/** The shape a token kind gives (null: not a token kind with a shape of its own). */
function tokenShape(style: Drawn, kind: string, ch: string): Shape | null {
  switch (kind) {
    case "variable":
      return variableShape(style, ch);
    case "constant":
      return style.constants;
    case "function":
      return style.functions;
    case "operator":
      return style.differential;
    case "label":
      return style.labels;
    case "counter":
      return style.counters;
    case "roman":
      return style.romans;
    case "number":
      return style.numbers;
    case "unit":
      return style.units;
    case "text":
      return style.text;
    default:
      return null;
  }
}

/**
 * The symbol rules the classification does not hold (docs/KINDS-MODEL.md §3): a rule naming a wrapper kind
 * draws the symbol as that kind (J as a matrix; a bold ω as a vector when the rule says "when bold"), a rule
 * naming a token kind gives its shape; conditions on bold and place, and a subscript (v_0), are matched.
 * The source is never rewritten: this is the drawing.
 */
function applySymbolRules(root: Row, rules: SymbolRule[], style: Drawn): Row {
  if (!rules.length) return root;
  const subText = (r: Row | undefined) => (r ? r.children.map((c) => (c.kind === "ident" || c.kind === "number" ? c.text : "\u0000")).join("") : "");
  const find = (n: Letter, sub: Row | undefined, where: "base" | "index") =>
    rules.find((r) => {
      if (r.text !== n.text) return false;
      if ((r.sub ?? "") !== (r.sub ? subText(sub) : "")) return false;
      const w = r.when?.where ?? "anywhere";
      if (w !== "anywhere" && w !== where) return false;
      const bold = isBold(n.variant);
      if (r.when?.bold !== undefined ? r.when.bold !== bold : n.variant !== undefined && !bold) return false;
      return true;
    });
  const apply = (n: Letter, rule: SymbolRule): MathNode => {
    const def = KIND_BY_ID.get(rule.kind);
    if (def && !def.token) {
      // A wrapper kind: the letter (without its bold, which the kind decides) becomes the kind's argument.
      const plain: Letter = { kind: "ident", text: n.text };
      return { kind: "notation", name: rule.kind, args: [{ kind: "row", children: [plain] }] } as MathNode;
    }
    const shape = tokenShape(style, def?.token ?? rule.kind, n.text);
    if (shape && n.variant === undefined) n.variant = shape === "upright" ? "normal" : "italic";
    return n;
  };
  const visitRow = (r: Row, where: "base" | "index") => {
    r.children = r.children.map((n) => {
      if (n.kind === "ident" && isStyleLetter(n.text)) {
        const rule = find(n, undefined, where);
        return rule ? apply(n, rule) : n;
      }
      if (n.kind === "scripts" && n.base.children.length === 1 && n.base.children[0]!.kind === "ident") {
        const b = n.base.children[0] as Letter;
        const rule = n.sub ? find(b, n.sub, where) : undefined;
        if (rule) {
          n.base.children = [apply(b, rule)];
          if (n.sup) visitRow(n.sup, "index");
          return n;
        }
      }
      if (n.kind === "scripts" || n.kind === "prescripts") {
        visitRow(n.base, where);
        if (n.sub) visitRow(n.sub, "index");
        if (n.sup) visitRow(n.sup, "index");
        return n;
      }
      if (n.kind === "notation") return n;
      for (const [k, v] of Object.entries(n)) {
        if (k === "meta") continue;
        const each = (x: unknown) => {
          if (!x || typeof x !== "object") return;
          if (Array.isArray(x)) return x.forEach(each);
          if ((x as MathNode).kind === "row") visitRow(x as Row, (n.kind === "nary" || n.kind === "function") && (k === "sub" || k === "sup") ? "index" : where);
        };
        each(v);
      }
      return n;
    });
  };
  visitRow(root, "base");
  return root;
}

/** How a letter outside indices is drawn by the style. */
function variableShape(style: Drawn, ch: string): Shape {
  if (GREEK_LOWER.test(ch)) return style.greekLower;
  if (GREEK_UPPER.test(ch)) return style.greekUpper;
  return ch === ch.toLowerCase() ? style.latinLower : style.latinUpper;
}

/** What a run of letters in an index is (null: undecided, drawn as written). */
export type IndexRunRole = "label" | "counter" | "variable" | "constant" | "transpose" | "roman" | null;

/** I, II, III, IV, V … XXXIX: capital Roman numerals as written in indices. */
const ROMAN = /^(?=[IVX])X{0,3}(?:IX|IV|V?I{0,3})$/;
export const isRomanNumeral = (letters: string) => ROMAN.test(letters);

/** Role of a run of index letters: several letters → label (unless all are counters); one letter → its classification. */
export function indexRunRole(letters: string[], style: { letters: Record<string, LetterRole> }): IndexRunRole {
  // A Roman numeral (S_I, S_II, s_1^{IV}) is a label: a single I is not a variable unless the user said so.
  if (isRomanNumeral(letters.join(""))) return letters.length === 1 && style.letters[letters[0]!] ? style.letters[letters[0]!]! : "roman";
  if (letters.length >= 2) {
    if (letters.every((l) => style.letters[l] === "counter")) return "counter";
    // A word of Latin letters (sf, max, eff) is a label; a run with Greek letters is an expression.
    return letters.every((l) => LATIN.test(l)) ? "label" : null;
  }
  const ch = letters[0];
  return ch ? (style.letters[ch] ?? null) : null;
}

type Letter = Extract<MathNode, { kind: "ident" }>;
const isPlainLetter = (n: MathNode): n is Letter => n.kind === "ident" && n.variant === undefined && isStyleLetter(n.text);
const isBold = (v: MathVariant | undefined) => v === "bold" || v === "bold-italic";

/** Sets a letter's variant for a shape, only where it differs from the renderer's default (so the default style changes nothing). */
function shapeLetter(n: Letter, shape: Shape) {
  if (shape === defaultShape(n.text)) return;
  n.variant = shape === "upright" ? "normal" : "italic";
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

/** Each maximal run of adjacent plain letters in a row. */
function letterRuns(r: Row): Letter[][] {
  const runs: Letter[][] = [];
  let cur: Letter[] = [];
  for (const n of r.children) {
    if (isPlainLetter(n)) cur.push(n);
    else {
      if (cur.length) runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);
  return runs;
}

function rowAllBold(r: Row): boolean {
  let any = false;
  let all = true;
  for (const n of r.children) {
    if (n.kind === "ident" || n.kind === "number") {
      any = true;
      if (!isBold(n.variant)) all = false;
    } else if (n.kind === "accent" || n.kind === "notation") return false;
  }
  return any && all;
}

/** Whether a "d" at position i of a row is a differential (dx, d\theta, \frac{d}{dt}, …dx after an integral). */
export function isDifferentialAt(r: Row, i: number, ctx: { inFraction: boolean; afterIntegral: boolean }): boolean {
  const n = r.children[i];
  if (!n || n.kind !== "ident" || n.text !== "d") return false;
  let j = i + 1;
  while (r.children[j]?.kind === "space") j++;
  const next = r.children[j];
  const prev = r.children[i - 1];
  const nextOk = !next ? ctx.inFraction && i === 0 : next.kind === "ident" || next.kind === "accent" || next.kind === "notation" || (next.kind === "scripts" && next.base.children.some((c) => c.kind === "ident" || c.kind === "accent" || c.kind === "notation"));
  if (!nextOk) return false;
  if (ctx.inFraction && (i === 0 || prev?.kind === "space")) return true;
  if (ctx.afterIntegral) return true;
  return prev?.kind === "space" && (prev.width === "thin" || prev.width === "medium");
}

/**
 * The tree as the style draws it: letters, digits and marks get the variant the style gives them.
 * Explicitly styled letters are left as written. Runs before notation kinds are expanded (frame
 * labels are labels). Returns a new tree.
 */
export function styleAst(root: Row, ms: MathStyle): Row {
  const style: Drawn = { ...looksOf(ms), letters: letterRoles(ms), notation: ms.notation };
  const out = applySymbolRules(clone(root), otherRules(ms), style);
  const visitRow = (r: Row | undefined, ctx: { inScript: boolean; inFraction: boolean; afterIntegral: boolean; boldBase: boolean; script?: "sub" | "sup" }) => {
    if (!r) return;
    if (ctx.inScript) styleIndexRow(r, style, ctx.boldBase);
    let afterIntegral = ctx.afterIntegral;
    r.children.forEach((n, i) => {
      if (n.kind === "nary" && /[∫∬∭∮∯∰]/.test(n.op)) afterIntegral = true;
      if (!ctx.inScript) {
        if (n.kind === "ident" && n.variant === undefined) {
          if (n.text === "d" && style.letters.d !== "variable" && isDifferentialAt(r, i, { inFraction: ctx.inFraction, afterIntegral })) n.variant = style.differential === "upright" ? "normal" : undefined;
          else if (n.text === "π" || style.letters[n.text] === "constant") shapeLetter(n, style.constants);
          else if (isStyleLetter(n.text)) shapeLetter(n, variableShape(style, n.text));
        } else if (n.kind === "number" && n.variant === undefined && style.numbers === "italic") n.variant = "italic";
      }
      visitNode(n, { ...ctx, afterIntegral });
    });
  };
  const visitNode = (n: MathNode, ctx: { inScript: boolean; inFraction: boolean; afterIntegral: boolean; boldBase: boolean; script?: "sub" | "sup" }) => {
    const plain = { inScript: ctx.inScript, inFraction: false, afterIntegral: false, boldBase: false, script: ctx.script };
    switch (n.kind) {
      case "scripts":
      case "prescripts": {
        // e^{x}: the exponential's e is a constant, and its exponent an expression (not an index).
        const b = n.base.children;
        const e0 = b.length === 1 && b[0]!.kind === "ident" && b[0]!.text === "e" ? (b[0] as Letter) : null;
        const exp = n.kind === "scripts" && !!n.sup && !!e0 && (e0.variant === undefined || e0.variant === "normal") && style.letters.e !== "variable";
        if (exp && e0 && !ctx.inScript && e0.variant === undefined) shapeLetter(e0, style.constants);
        visitRow(n.base, { ...ctx, inFraction: false });
        if (exp && n.sup && !isTransposeMark(n.sup)) {
          if (n.sub) visitRow(n.sub, { ...plain, inScript: true, boldBase: false, script: "sub" });
          visitRow(n.sup, { ...plain, inScript: ctx.inScript });
          return;
        }
        const boldBase = rowAllBold(n.base);
        if (n.sub) visitRow(n.sub, { ...plain, inScript: true, boldBase, script: "sub" });
        if (n.sup) {
          if (isTransposeMark(n.sup)) styleTranspose(n.sup, style);
          else visitRow(n.sup, { ...plain, inScript: true, boldBase, script: "sup" });
        }
        return;
      }
      case "nary":
        visitRow(n.sub, { ...plain, inScript: true, script: "sub" });
        visitRow(n.sup, { ...plain, inScript: true, script: "sup" });
        visitRow(n.body, { ...ctx, inFraction: false, afterIntegral: /[∫∬∭∮∯∰]/.test(n.op) });
        return;
      case "function":
        visitRow(n.sub, { ...plain, inScript: true, script: "sub" });
        visitRow(n.sup, { ...plain, inScript: true, script: "sup" });
        visitRow(n.arg, { ...ctx, inFraction: false });
        return;
      case "fraction":
        visitRow(n.num, { ...ctx, inFraction: true, afterIntegral: false });
        visitRow(n.den, { ...ctx, inFraction: true, afterIntegral: false });
        return;
      case "notation":
        // Frame labels are labels; the arguments are drawn by the kind (frames of a DCM are labels too).
        {
          // A kind may set its own frame-label shape (C_AB with italic labels while other labels are upright).
          const own = styleOf(style.notation, n.name).frames.shape;
          const labels = own ? { ...style, labels: own } : style;
          if (n.frames) styleLabelRow(n.frames, labels);
          if (n.name === "dcm" || n.name === "frm") n.args.forEach((a) => styleLabelRow(a, labels));
          else n.args.forEach((a) => visitRow(a, { ...ctx, inFraction: false }));
        }
        return;
      default:
        for (const [k, v] of Object.entries(n)) {
          if (k === "meta") continue;
          const each = (x: unknown) => {
            if (!x || typeof x !== "object") return;
            if (Array.isArray(x)) return x.forEach(each);
            if ((x as MathNode).kind === "row") visitRow(x as Row, { ...ctx, inFraction: false });
          };
          each(v);
        }
    }
  };
  visitRow(out, { inScript: false, inFraction: false, afterIntegral: false, boldBase: false });
  return out;
}

/** Frame labels: their letters are labels; a frame's own index (S_I, S_{II}) is drawn as an index. */
function styleLabelRow(r: Row, style: Drawn) {
  for (const n of r.children) {
    if (isPlainLetter(n)) shapeLetter(n, style.labels);
    else if (n.kind === "scripts") {
      styleLabelRow(n.base, style);
      if (n.sub) styleIndexRow(n.sub, style, false);
      if (n.sup) styleIndexRow(n.sup, style, false);
    }
  }
}

function styleTranspose(r: Row, style: Drawn) {
  for (const n of r.children) {
    if (n.kind !== "ident" || n.variant !== undefined || n.text !== "T") continue;
    if (style.transpose === "bold") n.variant = "bold";
    else if (style.transpose === "upright") n.variant = "normal";
  }
}

/** Letters of an index row: runs by role, digits by the numbers setting; a bold base's letters bold when the scope says so. */
function styleIndexRow(r: Row, style: Drawn, boldBase: boolean) {
  for (const run of letterRuns(r)) {
    const whole = indexRunRole(run.map((l) => l.text), style);
    for (const l of run) {
      const role = whole ?? (run.length > 1 ? indexRunRole([l.text], style) : null);
      // Undecided letters (and letters classified as variables) are drawn like variables.
      const shape = role === "roman" ? style.romans : role === "label" ? style.labels : role === "counter" ? style.counters : role === "constant" ? style.constants : null;
      const sh = shape ?? variableShape(style, l.text);
      if (boldBase && style.boldScope === "scripts") l.variant = sh === "upright" ? "bold" : "bold-italic";
      else shapeLetter(l, sh);
    }
  }
  for (const n of r.children) if (n.kind === "number" && n.variant === undefined && style.numbers === "italic") n.variant = "italic";
}

// ------------------------------------------------------------------ explaining a symbol's kind (editor hover)

/** Where a letter sits, as the editor sees it (docs/KINDS-MODEL.md §4, §7). */
export interface SymbolContext {
  text: string;
  /** Its subscript, when it is the base of one (v_0 → "0"). */
  sub?: string;
  bold: boolean;
  /** A font written in the source (\mathrm{x}, \mathit{x}). */
  forced: boolean;
  where: "base" | "index";
  /** The run of index letters it belongs to (sf for the s of σ_sf). */
  indexRun?: string[];
  /** The d of a derivative or integral. */
  differential?: boolean;
  /** The e of e^{…}. */
  expBase?: boolean;
  /** The wrapper kind it is written in (\pvec{…}). */
  inKind?: string;
}

const ALPHABET = (ch: string) => (GREEK_LOWER.test(ch) ? "lowercase Greek letter" : GREEK_UPPER.test(ch) ? "capital Greek letter" : ch === ch.toLowerCase() ? "lowercase Latin letter" : "capital Latin letter");

/**
 * A symbol's kind and why (the order of docs/KINDS-MODEL.md §4): an explicit macro, a rule of the document,
 * the context rules, the alphabet default. The same data the drawing uses (rules, classification).
 */
export function explainSymbol(c: SymbolContext, ms: MathStyle): { kind: string; reason: string } {
  const named = (id: string) => KIND_BY_ID.get(id)?.name.toLowerCase() ?? id;
  if (c.inKind) {
    const def = KIND_BY_ID.get(c.inKind);
    return { kind: def?.token ?? c.inKind, reason: `written as \\${def?.macro ?? c.inKind}` };
  }
  if (c.forced) return { kind: "variable", reason: "a font is written in the source: drawn as written (Check style lists it)" };
  const letters = letterRoles(ms);
  const others = otherRules(ms);
  const rule = others.find((r) => r.text === c.text && (r.sub ?? "") === (r.sub ? (c.sub ?? "") : "") && (r.when?.where ?? "anywhere") !== (c.where === "index" ? "base" : "index") && (r.when?.bold === undefined || r.when.bold === c.bold));
  if (rule) {
    const cond = rule.when?.bold ? " when bold" : rule.when?.bold === false ? " when not bold" : "";
    return { kind: rule.kind, reason: `rule in this document: ${rule.symbol} is a ${named(rule.kind)}${cond}` };
  }
  if (c.bold) return { kind: "variable", reason: "bold written in the source (no rule makes it a kind: Check style can propose one)" };
  if (c.where === "index") {
    const run = c.indexRun?.length ? c.indexRun : [c.text];
    const role = indexRunRole(run, { letters }) ?? (run.length > 1 ? indexRunRole([c.text], { letters }) : null);
    if (role === "roman") return { kind: "roman", reason: "a Roman numeral in an index" };
    if (role === "label") return { kind: "label", reason: run.length > 1 && !letters[c.text] ? `part of the index word “${run.join("")}”` : "classified as a label in this document" };
    if (role === "counter") return { kind: "counter", reason: "classified as an index variable in this document" };
    if (role === "constant") return { kind: "constant", reason: "classified as a constant in this document" };
    if (role === "variable") return { kind: "variable", reason: "classified as a variable in this document" };
    return { kind: "variable", reason: "an index letter not classified yet: drawn as a variable (Document style → Symbols)" };
  }
  if (c.text === "d" && c.differential && letters.d !== "variable") return { kind: "operator", reason: "the d of a derivative or integral" };
  if (c.text === "π") return { kind: "constant", reason: "π is a constant" };
  if (letters[c.text] === "constant") return { kind: "constant", reason: "classified as a constant in this document" };
  if (c.text === "e" && c.expBase && letters.e !== "variable") return { kind: "constant", reason: "e as the base of a power" };
  if (letters[c.text] === "variable") return { kind: "variable", reason: "classified as a variable in this document" };
  return { kind: "variable", reason: `a ${ALPHABET(c.text)}` };
}

/** The name of a kind as shown to the user ("constant", "physical vector"). */
export function kindDisplayName(id: string): string {
  const tokens: Record<string, string> = { variable: "variable", constant: "constant", function: "function", operator: "operator", label: "label", counter: "counter", roman: "Roman numeral", number: "number", unit: "unit", text: "text", transpose: "transpose" };
  return tokens[id] ?? KIND_BY_ID.get(id)?.name.toLowerCase() ?? id;
}

/**
 * The tree with the document's symbol rules applied and nothing else (a rule naming a wrapper kind makes the
 * symbol that kind's object): what a symbol *is* in this document, for the list of symbols (SYMBOL-LIST.md §3).
 */
export function withSymbolRules(root: Row, ms: MathStyle): Row {
  const style: Drawn = { ...looksOf(ms), letters: letterRoles(ms), notation: ms.notation };
  return applySymbolRules(clone(root), otherRules(ms), style);
}
