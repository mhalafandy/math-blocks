import type { MathNode, MathVariant, Row } from "./ast";
import { isTransposeMark } from "./bold";
import { DEFAULT_PROFILE, styleOf, type NotationProfile } from "./kinds";

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

export interface MathStyle {
  version: 1;
  /** Preset this style started from (for display only; every field below is the truth). */
  preset: string;
  /** Name and description of that style (shown, exported; "modified" when the look differs from it). */
  presetName?: string;
  presetDescription?: string;
  /** Descriptive index labels: multi-letter subscripts (b, sf, max) and letters classified as labels. */
  labels: Shape;
  /** Index variables (letters classified as counters: i, j, k, n…). */
  counters: Shape;
  /** Digits, in indices and elsewhere. */
  numbers: Shape;
  latinLower: Shape;
  latinUpper: Shape;
  greekLower: Shape;
  greekUpper: Shape;
  /** The d of derivatives and integrals. */
  differential: Shape;
  /** e, i (when classified as a constant) and π. */
  constants: Shape;
  /** Function names (sin, cos, det…). */
  functions: Shape;
  /** Text in equations (\text{…}) and units written as text. */
  text: Shape;
  /** Transpose mark (T after a matrix or \T). */
  transpose: "italic" | "upright" | "bold";
  /** A bold base's index letters: drawn regular ("base") or bold too ("scripts"). */
  boldScope: "base" | "scripts";
  /** Accents over bold letters drawn in the bold weight. */
  accentsFollowBold: boolean;
  /** Equation size in points. */
  sizePt: number;
  /** Font family (Classic pictures: Times New Roman with Symbol, STIX for what they lack). */
  font: "times";
  /** Notation kinds: preset and per-kind changes. */
  notation: NotationProfile;
  /** Per-letter classification of single-letter indices (confirmed by the user). */
  letters: Record<string, LetterRole>;
  /** Check-style findings kept as deliberate exceptions (their keys). */
  exceptions: string[];
}

const BASE: MathStyle = {
  version: 1,
  preset: "mathblocks",
  labels: "italic",
  counters: "italic",
  numbers: "upright",
  latinLower: "italic",
  latinUpper: "italic",
  greekLower: "italic",
  greekUpper: "upright",
  differential: "italic",
  constants: "italic",
  functions: "upright",
  text: "upright",
  transpose: "upright",
  boldScope: "base",
  accentsFollowBold: false,
  sizePt: 12,
  font: "times",
  notation: DEFAULT_PROFILE,
  letters: {},
  exceptions: [],
};

export interface StylePreset {
  id: string;
  name: string;
  description: string;
  /** What the preset sets (everything else is kept when it is applied). */
  values: Partial<Pick<MathStyle, LookKey>>;
}

/** The look settings a preset may set (not size, notation, classification or exceptions). */
export const LOOK_KEYS = ["labels", "counters", "numbers", "latinLower", "latinUpper", "greekLower", "greekUpper", "differential", "constants", "functions", "text", "transpose", "boldScope", "accentsFollowBold"] as const;
export type LookKey = (typeof LOOK_KEYS)[number];

const looks = (s: MathStyle): Pick<MathStyle, LookKey> => Object.fromEntries(LOOK_KEYS.map((k) => [k, s[k]])) as Pick<MathStyle, LookKey>;

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

/** A full style from a stored or imported one (missing fields from the default; unknown values dropped). */
export function normalizeStyle(raw: unknown, fallback: MathStyle = DEFAULT_STYLE): MathStyle {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: MathStyle = { ...fallback, letters: { ...fallback.letters }, exceptions: [...fallback.exceptions] };
  const shape = (v: unknown): Shape | undefined => (v === "italic" || v === "upright" ? v : undefined);
  for (const k of ["labels", "counters", "numbers", "latinLower", "latinUpper", "greekLower", "greekUpper", "differential", "constants", "functions", "text"] as const) {
    const v = shape(o[k]);
    if (v) out[k] = v;
  }
  if (o.transpose === "italic" || o.transpose === "upright" || o.transpose === "bold") out.transpose = o.transpose;
  if (o.boldScope === "base" || o.boldScope === "scripts") out.boldScope = o.boldScope;
  if (typeof o.accentsFollowBold === "boolean") out.accentsFollowBold = o.accentsFollowBold;
  if (typeof o.sizePt === "number" && o.sizePt >= 6 && o.sizePt <= 72) out.sizePt = o.sizePt;
  if (typeof o.preset === "string") out.preset = o.preset;
  if (typeof o.presetName === "string") out.presetName = o.presetName;
  else if (raw && typeof raw === "object" && "preset" in (raw as object)) delete out.presetName;
  if (typeof o.presetDescription === "string") out.presetDescription = o.presetDescription;
  else if (raw && typeof raw === "object" && "preset" in (raw as object)) delete out.presetDescription;
  const n = o.notation as Record<string, unknown> | undefined;
  if (n && typeof n === "object" && typeof n.preset === "string") out.notation = { preset: n.preset as NotationProfile["preset"], overrides: (n.overrides as NotationProfile["overrides"]) ?? {} };
  if (o.letters && typeof o.letters === "object") {
    out.letters = {};
    for (const [ch, role] of Object.entries(o.letters as Record<string, unknown>)) if (role === "label" || role === "counter" || role === "variable" || role === "constant") out.letters[ch] = role;
  }
  if (Array.isArray(o.exceptions)) out.exceptions = o.exceptions.filter((x): x is string => typeof x === "string");
  return out;
}

/** Applies a preset's look to a style (size, notation, classification and exceptions are kept). */
export function applyPreset(style: MathStyle, preset: StylePreset): MathStyle {
  return { ...style, ...preset.values, preset: preset.id, presetName: preset.name, presetDescription: preset.description };
}

/** Whether a style's look differs from a preset's. */
export function differsFrom(style: MathStyle, preset: StylePreset): boolean {
  return LOOK_KEYS.some((k) => k in preset.values && JSON.stringify(style[k]) !== JSON.stringify(preset.values[k]));
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
export const BLANK_STYLE_VALUES: StylePreset["values"] = looks({ ...BASE });

/** The look part of a style, as a preset (save / export). */
export function presetFrom(style: MathStyle, id: string, name: string, description = ""): StylePreset {
  return { id, name, description, values: looks(style) };
}

/** A short fingerprint of everything that changes a drawing (recorded on each picture). */
export function styleHash(style: MathStyle): string {
  const s = JSON.stringify([looks(style), style.sizePt, style.font, style.notation, Object.entries(style.letters).sort()]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** The notation profile the style draws kinds with (its transpose and differential settings included). */
export function styleNotation(style: MathStyle): NotationProfile {
  const t = style.transpose === "bold" ? { weight: "bold" as const, shape: "upright" as const } : { weight: "regular" as const, shape: style.transpose };
  return { preset: style.notation.preset, overrides: { ...style.notation.overrides, T: { ...(style.notation.overrides.T ?? {}), ...t }, diff: { ...(style.notation.overrides.diff ?? {}), shape: style.differential } } };
}

// ------------------------------------------------------------------ classification of letters

const LATIN = /^[A-Za-z]$/;
const GREEK_LOWER = /^[α-ωϑϕϖϰϱϵς]$/u;
const GREEK_UPPER = /^[Α-Ω]$/u;
export const isStyleLetter = (ch: string) => LATIN.test(ch) || GREEK_LOWER.test(ch) || GREEK_UPPER.test(ch);

/** The renderer's own default shape for a letter (italic Latin and lowercase Greek, upright capital Greek). */
const defaultShape = (ch: string): Shape => (GREEK_UPPER.test(ch) || !isStyleLetter(ch) ? "upright" : "italic");

/** How a letter outside indices is drawn by the style. */
function variableShape(style: MathStyle, ch: string): Shape {
  if (GREEK_LOWER.test(ch)) return style.greekLower;
  if (GREEK_UPPER.test(ch)) return style.greekUpper;
  return ch === ch.toLowerCase() ? style.latinLower : style.latinUpper;
}

/** What a run of letters in an index is (null: undecided, drawn as written). */
export type IndexRunRole = "label" | "counter" | "variable" | "constant" | "transpose" | null;

/** Role of a run of index letters: several letters → label (unless all are counters); one letter → its classification. */
export function indexRunRole(letters: string[], style: Pick<MathStyle, "letters">): IndexRunRole {
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
export function styleAst(root: Row, style: MathStyle): Row {
  const out = clone(root);
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

function styleLabelRow(r: Row, style: MathStyle) {
  for (const n of r.children) if (isPlainLetter(n)) shapeLetter(n, style.labels);
}

function styleTranspose(r: Row, style: MathStyle) {
  for (const n of r.children) {
    if (n.kind !== "ident" || n.variant !== undefined || n.text !== "T") continue;
    if (style.transpose === "bold") n.variant = "bold";
    else if (style.transpose === "upright") n.variant = "normal";
  }
}

/** Letters of an index row: runs by role, digits by the numbers setting; a bold base's letters bold when the scope says so. */
function styleIndexRow(r: Row, style: MathStyle, boldBase: boolean) {
  for (const run of letterRuns(r)) {
    const whole = indexRunRole(run.map((l) => l.text), style);
    for (const l of run) {
      const role = whole ?? (run.length > 1 ? indexRunRole([l.text], style) : null);
      // Undecided letters (and letters classified as variables) are drawn like variables.
      const shape = role === "label" ? style.labels : role === "counter" ? style.counters : role === "constant" ? style.constants : null;
      const sh = shape ?? variableShape(style, l.text);
      if (boldBase && style.boldScope === "scripts") l.variant = sh === "upright" ? "bold" : "bold-italic";
      else shapeLetter(l, sh);
    }
  }
  for (const n of r.children) if (n.kind === "number" && n.variant === undefined && style.numbers === "italic") n.variant = "italic";
}
