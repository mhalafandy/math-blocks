import { indexRunRole, isTransposeMark, letterRoles, withSymbolRules, type MathNode, type MathStyle, type Row } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";

/**
 * The list of symbols (docs/SYMBOL-LIST.md): definitions written as \define{symbol}{meaning}[unit], symbols
 * identified by their kind (a bold ω under the rule "ω is a vector when bold" and \pvec{\omega} are the same
 * symbol), sorted and grouped for the table, and the checks. Pure functions: the Word side is symbolListRun.ts.
 */

// ------------------------------------------------------------------ the tag

export interface DefineTag {
  symbol: string;
  meaning: string;
  unit?: string;
}

export interface FoundDefine extends DefineTag {
  /** Offsets in the text: the whole tag. */
  start: number;
  end: number;
  /** The tag as written. */
  text: string;
}

/** Index of the closing delimiter matching the opening one at `open` (`\{` `\}` `\[` `\]` skipped). */
function matching(s: string, open: number, o: string, c: string): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === o) depth++;
    else if (ch === c && --depth === 0) return i;
  }
  return -1;
}

/** Every \define{…}{…}[…] in a text, and the malformed ones (with what is wrong). */
export function findDefines(text: string): { defines: FoundDefine[]; errors: { start: number; end: number; what: string }[] } {
  const defines: FoundDefine[] = [];
  const errors: { start: number; end: number; what: string }[] = [];
  const re = /\\define(?![A-Za-z])/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const start = m.index;
    let i = start + m[0].length;
    const skip = () => {
      while (text[i] === " ") i++;
    };
    skip();
    if (text[i] !== "{") {
      errors.push({ start, end: i, what: "\\define needs {symbol}{meaning} (and optionally [unit])" });
      continue;
    }
    const sEnd = matching(text, i, "{", "}");
    if (sEnd < 0) {
      errors.push({ start, end: text.length, what: "\\define: the symbol's closing } is missing" });
      break;
    }
    const symbol = text.slice(i + 1, sEnd).trim();
    i = sEnd + 1;
    skip();
    if (text[i] !== "{") {
      errors.push({ start, end: i, what: "\\define: the meaning is missing (\\define{symbol}{meaning})" });
      continue;
    }
    const mEnd = matching(text, i, "{", "}");
    if (mEnd < 0) {
      errors.push({ start, end: text.length, what: "\\define: the meaning's closing } is missing" });
      break;
    }
    const meaning = text.slice(i + 1, mEnd).trim();
    i = mEnd + 1;
    let unit: string | undefined;
    const save = i;
    skip();
    if (text[i] === "[") {
      const uEnd = matching(text, i, "[", "]");
      if (uEnd < 0) {
        errors.push({ start, end: text.length, what: "\\define: the unit's closing ] is missing" });
        break;
      }
      unit = text.slice(i + 1, uEnd).trim();
      i = uEnd + 1;
    } else i = save;
    if (!symbol) errors.push({ start, end: i, what: "\\define: the symbol is empty" });
    else if (!meaning) errors.push({ start, end: i, what: "\\define: the meaning is empty" });
    else defines.push({ start, end: i, text: text.slice(start, i), symbol, meaning, ...(unit ? { unit } : {}) });
    re.lastIndex = i;
  }
  return { defines, errors };
}

/** The tag of a definition (what the hidden marker holds). */
export const defineTag = (d: DefineTag) => `\\define{${d.symbol}}{${d.meaning}}${d.unit ? `[${d.unit}]` : ""}`;

/** A definition back from its tag (null when it is not one). */
export function parseDefineTag(tag: string): DefineTag | null {
  const r = findDefines(tag.trim());
  const d = r.defines[0];
  return d && d.start === 0 ? { symbol: d.symbol, meaning: d.meaning, ...(d.unit ? { unit: d.unit } : {}) } : null;
}

// ------------------------------------------------------------------ symbols and their identity

/** One symbol occurrence: its key (identity), the LaTeX to draw it, and what the list groups and sorts it by. */
export interface SymbolOccurrence {
  key: string;
  /** Also matched by a definition with this key (the kind's object with its frame labels). */
  alsoKey?: string;
  latex: string;
  /** First letter of the base (sorting), "" for index labels and abbreviations. */
  letter: string;
  form: "plain" | "bold" | "kind" | "accent" | "indexed";
  /** The kind (wrapper kind id, or "variable"…) for grouping by kind. */
  kind: string;
  group: "latin" | "greek" | "subscripts" | "superscripts" | "abbreviations" | "other";
  /** With alsoKey: the LaTeX of that whole form (σ_max). */
  wholeLatex?: string;
  /** An index label that is part of a symbol (the max of σ_max): not asked for when that symbol is defined. */
  partOf?: string;
}

const GREEK_ORDER = "αβγδεϵζηθϑικλμνξοπϖρϱσςτυφϕχψω";
const GREEK_UPPER_ORDER = "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ";
const isGreek = (ch: string) => GREEK_ORDER.includes(ch) || GREEK_UPPER_ORDER.includes(ch);
const isLatin = (ch: string) => /^[A-Za-z]$/.test(ch);

/** A look written on a letter (\mathrm, \mathit) is not part of its identity; bold is (until a rule makes it a kind). */
function normalize<T extends MathNode | Row>(n: T): T {
  const out = JSON.parse(JSON.stringify(n)) as T;
  const visit = (x: unknown) => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) return x.forEach(visit);
    const m = x as { kind?: string; variant?: string; meta?: unknown };
    delete m.meta;
    if ((m.kind === "ident" || m.kind === "number") && (m.variant === "normal" || m.variant === "italic")) delete m.variant;
    for (const v of Object.values(m)) visit(v);
  };
  visit(out);
  return out;
}

const ser = (nodes: MathNode[]) => serializeLatex({ kind: "row", children: nodes });
const firstLetter = (n: MathNode): string => {
  if (n.kind === "ident") return n.text;
  for (const [k, v] of Object.entries(n)) {
    if (k === "meta") continue;
    const rows = Array.isArray(v) ? v : [v];
    for (const r of rows) if (r && typeof r === "object" && (r as Row).kind === "row") for (const c of (r as Row).children) {
      const l = firstLetter(c);
      if (l) return l;
    }
  }
  return "";
};

/** A symbol's occurrence from its node (a letter, an accented letter, a kind object, a text abbreviation). */
function occurrenceOf(n: MathNode, sub?: Row): SymbolOccurrence | null {
  const nn = normalize(n);
  if (nn.kind === "text") {
    const t = nn.text.trim();
    return t ? { key: `\\text{${t}}`, latex: `\\text{${t}}`, letter: "", form: "plain", kind: "text", group: "abbreviations" } : null;
  }
  let form: SymbolOccurrence["form"];
  let kind = "variable";
  let alsoKey: string | undefined;
  let base: MathNode = nn;
  if (nn.kind === "ident") {
    if (!isLatin(nn.text) && !isGreek(nn.text)) return null;
    form = nn.variant === "bold" || nn.variant === "bold-italic" ? "bold" : "plain";
  } else if (nn.kind === "accent") {
    if (nn.body.children.length !== 1 || nn.body.children[0]!.kind !== "ident") return null;
    form = "accent";
  } else if (nn.kind === "notation") {
    if (nn.args.length !== 1 || nn.name === "T" || nn.name === "diff" || nn.name === "unit") return null;
    kind = nn.name;
    form = "kind";
    if (nn.frames) {
      alsoKey = ser([nn]);
      base = { ...nn, frames: undefined } as MathNode;
      delete (base as { frames?: Row }).frames;
    }
  } else return null;
  const letter = firstLetter(base);
  if (!letter) return null;
  const subNorm = sub ? normalize(sub) : undefined;
  const latex = subNorm ? ser([{ kind: "scripts", base: { kind: "row", children: [base] }, sub: subNorm }]) : ser([base]);
  if (alsoKey && subNorm) alsoKey = ser([{ kind: "scripts", base: { kind: "row", children: [nn] }, sub: subNorm }]);
  return { key: latex, ...(alsoKey ? { alsoKey } : {}), latex, letter, form: subNorm ? "indexed" : form, kind, group: isLatin(letter) ? "latin" : isGreek(letter) ? "greek" : "other" };
}

/** An index label on an empty base ({}_{max}, {}^{\T}) as a symbol of its own. */
function labelOccurrence(script: Row, where: "sub" | "sup"): SymbolOccurrence {
  const s = ser(normalize(script).children);
  const latex = where === "sub" ? `{}_{${s}}` : `{}^{${s}}`;
  return { key: latex, latex, letter: "", form: "plain", kind: "label", group: where === "sub" ? "subscripts" : "superscripts" };
}

/**
 * The symbols an equation uses, by identity: letters (with their subscript: v_0 is one symbol), kind objects,
 * accented letters, index words (sf, max: listed as subscripts), the transpose, text abbreviations. Index
 * variables (counters) and numbers are never symbols to define.
 */
export function symbolsIn(latex: string, style: MathStyle): SymbolOccurrence[] {
  let root: Row;
  try {
    root = withSymbolRules(parseLatex(latex).root, style);
  } catch {
    return [];
  }
  const letters = letterRoles(style);
  const out: SymbolOccurrence[] = [];
  const add = (o: SymbolOccurrence | null) => o && out.push(o);
  const indexWords = (r: Row, where: "sub" | "sup") => {
    if (isTransposeMark(r)) return add(labelOccurrence({ kind: "row", children: [{ kind: "notation", name: "T", args: [] } as unknown as MathNode] }, "sup"));
    // A word of letters (sf, max) is a label; a single letter is a label only when classified so.
    const run: string[] = [];
    for (const c of r.children) if (c.kind === "ident" && isLatin(c.text) && !c.variant) run.push(c.text);
    if (run.length === r.children.length && run.length > 0 && indexRunRole(run, { letters }) === "label") add(labelOccurrence(r, where));
    else visitRow(r, true);
  };
  const visitRow = (r: Row | undefined, inIndex = false) => {
    if (!r) return;
    for (const n of r.children) visit(n, inIndex);
  };
  const visit = (n: MathNode, inIndex: boolean) => {
    switch (n.kind) {
      case "scripts": {
        const b = n.base.children;
        const single = b.length === 1 ? b[0]! : null;
        if (!b.length) {
          if (n.sub) add(labelOccurrence(n.sub, "sub"));
          if (n.sup) add(labelOccurrence(n.sup, "sup"));
          return;
        }
        // The subscript: an index word (max, sf) is a label of its own and the base is the symbol; counters
        // (x_i) leave the base as the symbol; anything else (v_0, v_{12}) is part of the symbol.
        let subRole: "label" | "counter" | "part" | "none" = "none";
        if (n.sub && !isTransposeMark(n.sub)) {
          const run = n.sub.children.every((c) => c.kind === "ident" && isLatin(c.text) && !c.variant) ? n.sub.children.map((c) => (c as { text: string }).text) : [];
          const role = run.length ? indexRunRole(run, { letters }) : null;
          subRole = role === "label" || role === "roman" ? "label" : role === "counter" ? "counter" : "part";
        }
        let o = single ? occurrenceOf(single, subRole === "part" ? n.sub : undefined) : null;
        let label: SymbolOccurrence | null = null;
        if (o && (subRole === "label" || subRole === "counter")) {
          const whole = occurrenceOf(single!, n.sub);
          if (whole) o = { ...o, alsoKey: whole.key, wholeLatex: whole.latex };
          if (subRole === "label") label = { ...labelOccurrence(n.sub!, "sub"), ...(whole ? { partOf: whole.key } : {}) };
        }
        if (o && !inIndex) {
          add(o);
          if (label) add(label);
          if (n.sub && o.form === "indexed") {
            // The base alone is not a separate symbol (v_0 uses v_0), but an index word in it is a label.
          }
        } else visitRow(n.base, inIndex);
        if (n.sub && subRole !== "label" && subRole !== "counter" && !(o && o.form === "indexed")) indexWords(n.sub, "sub");
        if (n.sup) {
          // A power is an expression; the transpose and index words are labels.
          if (isTransposeMark(n.sup)) indexWords(n.sup, "sup");
          else visitRow(n.sup, inIndex);
        }
        return;
      }
      case "nary":
        // Limits hold summation indices (counters): not symbols to define; the upper limit may be (N).
        visitRow(n.sup, inIndex);
        visitRow(n.body, inIndex);
        return;
      case "ident":
        if (inIndex) {
          // A single letter in an index: a symbol only when classified as a variable or constant.
          const role = letters[n.text];
          if (role === "variable" || role === "constant") add(occurrenceOf(n));
          return;
        }
        add(occurrenceOf(n));
        return;
      case "accent":
      case "notation":
      case "text": {
        const o = occurrenceOf(n);
        if (o) return add(o);
        break;
      }
      default:
        break;
    }
    for (const [k, v] of Object.entries(n)) {
      if (k === "meta") continue;
      const each = (x: unknown) => {
        if (!x || typeof x !== "object") return;
        if (Array.isArray(x)) return x.forEach(each);
        if ((x as MathNode).kind === "row") visitRow(x as Row, inIndex);
      };
      each(v);
    }
  };
  visitRow(root);
  return out;
}

/** The identity of a defined symbol (the first symbol of its LaTeX), or null when it names no symbol. */
export function definitionSymbol(symbol: string, style: MathStyle): SymbolOccurrence | null {
  const all = symbolsIn(symbol, style);
  // \define{{}_{max}}{…}: the label even though one letter (max is a word, x a single letter alike).
  if (!all.length) {
    const m = /^\{\}\s*([_^])\s*\{(.*)\}$/.exec(symbol.trim());
    if (m) {
      try {
        return labelOccurrence(parseLatex(m[2]!).root, m[1] === "_" ? "sub" : "sup");
      } catch {
        return null;
      }
    }
    return null;
  }
  const o = all[0]!;
  // What the definition writes is its identity: \define{\sigma_{max}} is σ_max, \define{\pvec[B/N]{\omega}} keeps its labels.
  return o.alsoKey ? { ...o, key: o.alsoKey, latex: o.wholeLatex ?? o.alsoKey, form: "indexed", alsoKey: undefined } : o;
}

// ------------------------------------------------------------------ settings, sorting, grouping

export type ListGroup = SymbolOccurrence["group"];

export interface SymbolListSettings {
  /** "alphabet": Latin, Greek, then sub- and superscripts (by groups); "name": alphabetical by the letter's name (α with a). */
  sort: "alphabet" | "name";
  /** Within an alphabet: a A b B… or A…Z a…z. */
  caseOrder: "mixed" | "upper-first";
  /** Grouping: none, the groups below, or by kind. */
  grouping: "none" | "groups" | "kind";
  groups: ListGroup[];
  headings: Partial<Record<ListGroup, string>>;
  columns: ("symbol" | "meaning" | "unit" | "first")[];
  /** "First defined" column: the equation number or the page. */
  first: "number" | "page";
  tableStyle: string;
  repeatHeader: boolean;
  unitFormat: "brackets" | "plain";
  /** Symbols never asked for (dummy indices…). */
  ignore: string[];
  columnTitles: { symbol: string; meaning: string; unit: string; first: string };
}

export const DEFAULT_LIST_SETTINGS: SymbolListSettings = {
  sort: "alphabet",
  caseOrder: "mixed",
  grouping: "groups",
  groups: ["latin", "greek", "subscripts", "superscripts", "abbreviations"],
  headings: { latin: "Latin symbols", greek: "Greek symbols", subscripts: "Subscripts", superscripts: "Superscripts", abbreviations: "Abbreviations", other: "Other symbols" },
  columns: ["symbol", "meaning", "unit"],
  first: "number",
  tableStyle: "",
  repeatHeader: true,
  unitFormat: "brackets",
  ignore: [],
  columnTitles: { symbol: "Symbol", meaning: "Meaning", unit: "Unit", first: "First defined" },
};

export function listSettings(raw: unknown): SymbolListSettings {
  const o = raw && typeof raw === "object" ? (raw as Partial<SymbolListSettings>) : {};
  return { ...DEFAULT_LIST_SETTINGS, ...o, headings: { ...DEFAULT_LIST_SETTINGS.headings, ...(o.headings ?? {}) }, columnTitles: { ...DEFAULT_LIST_SETTINGS.columnTitles, ...(o.columnTitles ?? {}) } };
}

const GREEK_NAMES: Record<string, string> = { α: "alpha", β: "beta", γ: "gamma", δ: "delta", ε: "epsilon", ϵ: "epsilon", ζ: "zeta", η: "eta", θ: "theta", ϑ: "theta", ι: "iota", κ: "kappa", λ: "lambda", μ: "mu", ν: "nu", ξ: "xi", ο: "omicron", π: "pi", ϖ: "pi", ρ: "rho", ϱ: "rho", σ: "sigma", ς: "sigma", τ: "tau", υ: "upsilon", φ: "phi", ϕ: "phi", χ: "chi", ψ: "psi", ω: "omega" };
const FORM_RANK: Record<SymbolOccurrence["form"], number> = { plain: 0, bold: 1, kind: 1, accent: 2, indexed: 3 };

/** The sort key of a symbol (smaller first). */
function sortKey(o: SymbolOccurrence, s: SymbolListSettings): string {
  const L = o.letter;
  const groupRank = { latin: 0, greek: 1, subscripts: 2, superscripts: 3, abbreviations: 4, other: 5 }[o.group];
  let letterRank: string;
  if (s.sort === "name" && isGreek(L)) {
    const lower = GREEK_UPPER_ORDER.includes(L) ? GREEK_ORDER[GREEK_UPPER_ORDER.indexOf(L)] ?? L : L;
    letterRank = `${GREEK_NAMES[lower] ?? lower}${L === lower ? 0 : 1}`;
  } else if (isLatin(L)) {
    letterRank = s.caseOrder === "mixed" ? `${L.toLowerCase()}${L === L.toLowerCase() ? 0 : 1}` : `${L === L.toUpperCase() ? 0 : 1}${L}`;
  } else if (isGreek(L)) {
    const lowerIndex = GREEK_ORDER.indexOf(L);
    const upperIndex = GREEK_UPPER_ORDER.indexOf(L);
    const i = lowerIndex >= 0 ? lowerIndex : GREEK_ORDER.indexOf(GREEK_ORDER[upperIndex] ?? "");
    letterRank = `${String(i).padStart(2, "0")}${lowerIndex >= 0 ? 0 : 1}`;
  } else letterRank = o.latex;
  const primary = s.sort === "name" && (o.group === "latin" || o.group === "greek") ? 0 : groupRank;
  return `${primary}|${letterRank}|${FORM_RANK[o.form]}|${o.latex}`;
}

// ------------------------------------------------------------------ the document's definitions and equations

export interface DefinitionIn extends DefineTag {
  /** Position in the document and how many equations come before it. */
  start: number;
  equationsBefore: number;
  page?: number;
  context?: string;
}

export interface EquationIn {
  latex: string;
  /** Position in document order (0, 1, 2…). */
  index: number;
  number?: string | null;
  page?: number;
  context?: string;
  tag?: string;
}

export interface ListEntry {
  occ: SymbolOccurrence;
  def: DefinitionIn;
  /** "(2.3)" or "p. 4" when asked. */
  first?: string;
}

/** The rows of the table: group headings and entries, in order. */
export function tableEntries(defs: DefinitionIn[], eqs: EquationIn[], style: MathStyle, s: SymbolListSettings): ({ heading: string } | ListEntry)[] {
  const seen = new Set<string>();
  const entries: ListEntry[] = [];
  const uses = eqs.map((e) => ({ e, keys: new Set(symbolsIn(e.latex, style).flatMap((o) => [o.key, ...(o.alsoKey ? [o.alsoKey] : [])])) }));
  for (const d of defs) {
    const occ = definitionSymbol(d.symbol, style);
    if (!occ || seen.has(occ.key)) continue;
    seen.add(occ.key);
    let first: string | undefined;
    if (s.columns.includes("first")) {
      const numbered = uses.find((u) => u.e.index >= d.equationsBefore && u.e.number && u.keys.has(occ.key));
      first = s.first === "number" && numbered ? (numbered.e.number ?? undefined) : d.page ? `p. ${d.page}` : undefined;
    }
    entries.push({ occ, def: d, ...(first ? { first } : {}) });
  }
  entries.sort((a, b) => (sortKey(a.occ, s) < sortKey(b.occ, s) ? -1 : sortKey(a.occ, s) > sortKey(b.occ, s) ? 1 : 0));
  if (s.grouping === "none") return entries;
  const groupOf = (e: ListEntry) => (s.grouping === "kind" ? e.occ.kind : s.groups.includes(e.occ.group) ? e.occ.group : "other");
  const order = s.grouping === "kind" ? [...new Set(entries.map(groupOf))] : [...s.groups, "other"];
  const out: ({ heading: string } | ListEntry)[] = [];
  for (const g of order) {
    const inG = entries.filter((e) => groupOf(e) === g);
    if (!inG.length) continue;
    out.push({ heading: s.grouping === "kind" ? kindHeading(g) : (s.headings[g as ListGroup] ?? g) });
    out.push(...inG);
  }
  return out;
}

const KIND_HEADINGS: Record<string, string> = { variable: "Scalars", label: "Labels", text: "Abbreviations", pvec: "Vectors", uvec: "Unit vectors", bvec: "Basis vectors", vectrix: "Frames (vectrices)", cmat: "Column matrices", mat: "Matrices", dcm: "Rotation matrices", crossmat: "Cross matrices", dyadic: "Dyadics", tens: "Tensors", quat: "Quaternions", body: "Bodies" };
const kindHeading = (k: string) => KIND_HEADINGS[k] ?? k;

// ------------------------------------------------------------------ checks

export type CheckKind = "undefined" | "unused" | "two-meanings" | "twice" | "two-symbols" | "late";

export interface ListCheck {
  kind: CheckKind;
  message: string;
  key: string;
  latex: string;
  /** Where: an equation (its index) or a definition (its position). */
  equation?: EquationIn;
  definitions?: DefinitionIn[];
}

const normMeaning = (m: string) => m.toLowerCase().replace(/\$[^$]*\$/g, (x) => x.replace(/\s+/g, "")).replace(/^(?:the|a|an)\s+/, "").replace(/[.,;:]+$/, "").replace(/\s+/g, " ").trim();

/** Used but not defined, defined but not used, one symbol with two meanings, one meaning with two symbols, defined after use. */
export function checkList(defs: DefinitionIn[], eqs: EquationIn[], style: MathStyle, s: SymbolListSettings): ListCheck[] {
  const out: ListCheck[] = [];
  const ignore = new Set(s.ignore);
  const defined = new Map<string, { occ: SymbolOccurrence; defs: DefinitionIn[] }>();
  for (const d of defs) {
    const occ = definitionSymbol(d.symbol, style);
    if (!occ) continue;
    const e = defined.get(occ.key) ?? { occ, defs: [] };
    e.defs.push(d);
    defined.set(occ.key, e);
  }
  const firstUse = new Map<string, { occ: SymbolOccurrence; eq: EquationIn }>();
  for (const eq of [...eqs].sort((a, b) => a.index - b.index))
    for (const o of symbolsIn(eq.latex, style))
      for (const k of [o.key, ...(o.alsoKey ? [o.alsoKey] : [])]) if (!firstUse.has(k)) firstUse.set(k, { occ: o, eq });
  // Used but not defined (by the plain key: a definition with frame labels covers only those).
  const reported = new Set<string>();
  for (const [k, u] of firstUse) {
    if (u.occ.key !== k || ignore.has(k) || reported.has(k)) continue;
    if (defined.has(k) || (u.occ.alsoKey && defined.has(u.occ.alsoKey)) || (u.occ.partOf && defined.has(u.occ.partOf))) continue;
    reported.add(k);
    out.push({ kind: "undefined", key: k, latex: u.occ.latex, message: `${u.occ.latex} is used but not defined`, equation: u.eq });
  }
  for (const [k, d] of defined) {
    if (!firstUse.has(k)) out.push({ kind: "unused", key: k, latex: d.occ.latex, message: `${d.occ.latex} is defined but not used in any equation`, definitions: d.defs });
    const meanings = new Set(d.defs.map((x) => `${normMeaning(x.meaning)}|${x.unit ?? ""}`));
    // The same definition twice (a pasted copy of its paragraph): reported, the meanings agree.
    if (meanings.size === 1 && d.defs.length > 1) out.push({ kind: "twice", key: k, latex: d.occ.latex, message: `${d.occ.latex} is defined ${d.defs.length} times (with the same meaning)`, definitions: d.defs });
    if (meanings.size > 1) out.push({ kind: "two-meanings", key: k, latex: d.occ.latex, message: `${d.occ.latex} has ${meanings.size} meanings: ${d.defs.map((x) => `“${x.meaning}”${x.unit ? ` [${x.unit}]` : ""}`).join(", ")}`, definitions: d.defs });
    const use = firstUse.get(k);
    const firstDef = d.defs.reduce((a, b) => (a.start < b.start ? a : b));
    if (use && firstDef.equationsBefore > use.eq.index) out.push({ kind: "late", key: k, latex: d.occ.latex, message: `${d.occ.latex} is defined after its first use`, equation: use.eq, definitions: [firstDef] });
  }
  const byMeaning = new Map<string, { keys: Set<string>; defs: DefinitionIn[] }>();
  for (const [k, d] of defined)
    for (const x of d.defs) {
      const m = normMeaning(x.meaning);
      const e = byMeaning.get(m) ?? { keys: new Set<string>(), defs: [] };
      e.keys.add(k);
      e.defs.push(x);
      byMeaning.set(m, e);
    }
  for (const [m, e] of byMeaning) if (e.keys.size > 1) out.push({ kind: "two-symbols", key: `meaning:${m}`, latex: [...e.keys].join(", "), message: `“${e.defs[0]!.meaning}” is the meaning of ${e.keys.size} symbols: ${[...e.keys].join(", ")}`, definitions: e.defs });
  return out;
}

/** The unit as written in the table. */
export const unitText = (u: string | undefined, s: SymbolListSettings) => (u ? (s.unitFormat === "brackets" ? `[${u}]` : u) : "");
