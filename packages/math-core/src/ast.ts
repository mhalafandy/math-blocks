/**
 * MathBlocks presentation AST.
 *
 * This is the canonical internal representation of a mathematical expression.
 * Every input format (LaTeX, OMML, MathType) is parsed INTO this tree, and every
 * output format (LaTeX, OMML, MathML, SVG) is produced FROM it. No module other
 * than a converter should ever need to know about a specific external format.
 *
 * Design rules:
 *  - The tree is plain, serialisable JSON (stored in SQLite and inside .docx files).
 *  - It describes *presentation structure* (what is drawn where), not computation.
 *    Optional semantic annotations (Tier 3 dependency manager) hang off `meta`.
 *  - Characters are stored as Unicode (e.g. "−" U+2212 for minus, "α" for \alpha),
 *    so converters never need a LaTeX lookup to know what a node displays.
 */

/** Font variant of an identifier or number, matching Unicode math alphabets. */
export type MathVariant =
  | "normal"
  | "italic"
  | "bold"
  | "bold-italic"
  | "double-struck"
  | "script"
  | "fraktur"
  | "sans-serif"
  | "monospace";

/** Optional semantic metadata. Reserved for the Tier 3 dependency manager. */
export interface NodeMeta {
  /** Normalised symbol key, e.g. "v_0" or "vec(v)". */
  symbolKey?: string;
  /** Semantic role of the node within its equation. */
  role?: "definition" | "usage";
}

interface Base {
  meta?: NodeMeta;
}

/** An ordered sequence of nodes. Every slot (numerator, script, cell…) is a Row. */
export interface Row extends Base {
  kind: "row";
  children: MathNode[];
}

/** A variable or symbol letter such as x, α, ∂ or ∞. */
export interface Ident extends Base {
  kind: "ident";
  text: string;
  /** Undefined means "default" (italic for single Latin/Greek letters, upright otherwise). */
  variant?: MathVariant;
}

export interface NumberNode extends Base {
  kind: "number";
  text: string;
  variant?: MathVariant;
}

export type OperatorClass = "binary" | "relation" | "punctuation" | "ordinary";

/** Operators, relations, punctuation and plain (non-stretchy) brackets. */
export interface Operator extends Base {
  kind: "operator";
  text: string;
  opClass: OperatorClass;
}

/** Upright prose text inside an equation (\text{…}). */
export interface TextNode extends Base {
  kind: "text";
  text: string;
}

export type SpaceWidth = "thin" | "medium" | "thick" | "quad" | "qquad" | "negthin" | "nbsp";

export interface Space extends Base {
  kind: "space";
  width: SpaceWidth;
}

export interface Fraction extends Base {
  kind: "fraction";
  num: Row;
  den: Row;
  /** false for binomial-style stacked fractions without a bar. */
  bar: boolean;
  /** Forced size: \dfrac = "display", \tfrac = "text". */
  size?: "display" | "text";
}

/** Base with subscript and/or superscript. */
export interface Scripts extends Base {
  kind: "scripts";
  base: Row;
  sub?: Row;
  sup?: Row;
}

/** Scripts written BEFORE the base (tensor notation, isotopes): {}^{a}_{b}X. */
export interface PreScripts extends Base {
  kind: "prescripts";
  base: Row;
  sub?: Row;
  sup?: Row;
}

export interface Radical extends Base {
  kind: "radical";
  /** nth-root index; undefined for a square root. */
  index?: Row;
  body: Row;
}

/** Placement of limits on large operators. "auto": integrals at the side, others above/below. */
export type LimitsPlacement = "auto" | "limits" | "nolimits";

/** Large operators: ∑ ∏ ∫ ∬ ∮ ⋃ … with an operand (body). */
export interface NAry extends Base {
  kind: "nary";
  op: string;
  sub?: Row;
  sup?: Row;
  limits: LimitsPlacement;
  body: Row;
}

/** Stretchy delimiters (\left … \middle … \right). An empty string means "no delimiter". */
export interface Delimited extends Base {
  kind: "delimited";
  open: string;
  close: string;
  /** Separator drawn between parts (\middle|). */
  separator?: string;
  /** parts.length is always ≥ 1; separators sit between consecutive parts. */
  parts: Row[];
}

/** Named function: sin, cos, log, lim, det, \operatorname{…}. */
export interface FunctionApp extends Base {
  kind: "function";
  name: string;
  sub?: Row;
  sup?: Row;
  /** true when `sub` is placed under the name in display style (lim, max, min…). */
  limits: boolean;
  arg: Row;
}

export type AccentKind =
  | "hat"
  | "widehat"
  | "bar"
  | "vec"
  | "overrightarrow"
  | "overleftarrow"
  | "dot"
  | "ddot"
  | "dddot"
  | "tilde"
  | "widetilde"
  | "check"
  | "breve"
  | "overline"
  | "underline";

export interface Accent extends Base {
  kind: "accent";
  accent: AccentKind;
  body: Row;
}

/** Annotation placed over/under a body: \overset, \underset, \overbrace, \underbrace. */
export interface Stack extends Base {
  kind: "stack";
  position: "over" | "under";
  body: Row;
  annotation?: Row;
  /** Draw a horizontal brace between body and annotation. */
  brace: boolean;
}

export interface Boxed extends Base {
  kind: "boxed";
  body: Row;
}

export type MatrixKind = "matrix" | "pmatrix" | "bmatrix" | "Bmatrix" | "vmatrix" | "Vmatrix" | "smallmatrix";

export interface Matrix extends Base {
  kind: "matrix";
  matrixKind: MatrixKind;
  /** rows[r][c]; rows may be ragged after parsing, converters pad to the widest row. */
  rows: Row[][];
}

/** Piecewise definition: each row is [value] or [value, condition]. */
export interface Cases extends Base {
  kind: "cases";
  rows: Row[][];
}

export type AlignedEnv = "aligned" | "align" | "gathered" | "split";

/**
 * Multi-line aligned equations (derivations, systems).
 * rows[r] are the &-separated cells; alignment points sit between cells.
 */
export interface Aligned extends Base {
  kind: "aligned";
  env: AlignedEnv;
  rows: Row[][];
}

/** Input that could not be understood. Kept verbatim so nothing is ever silently lost. */
export interface Raw extends Base {
  kind: "raw";
  latex: string;
  message: string;
}

export type MathNode =
  | Row
  | Ident
  | NumberNode
  | Operator
  | TextNode
  | Space
  | Fraction
  | Scripts
  | PreScripts
  | Radical
  | NAry
  | Delimited
  | FunctionApp
  | Accent
  | Stack
  | Boxed
  | Matrix
  | Cases
  | Aligned
  | Raw;

export type MathNodeKind = MathNode["kind"];

/** A complete expression as stored in the library and in documents. */
export interface MathExpression {
  /** AST format version, bumped on breaking changes (migrations live in math-core). */
  version: 1;
  root: Row;
  /** Display (own line) or inline (inside a text line). */
  display: boolean;
}
