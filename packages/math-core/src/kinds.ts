import type { AccentKind, MathNode, MathVariant, Notation, Row } from "./ast";

/**
 * Notation kinds (docs/NOTATION-KINDS.md): each kind of object — physical vector, DCM, dyadic… —
 * is stored as a semantic node and drawn in the style of the thesis's notation profile.
 * `expandNotation` turns kinds into ordinary nodes for drawing (Classic, Word, export);
 * `peelKind` recognises an expanded object again (what the visual editor gives back).
 */

export type KindAccent =
  | "none" | "harpoon" | "arrow" | "hat" | "bar" | "double-bar" | "double-arrow" | "tilde"
  | "under-bar" | "double-under-bar" | "under-tilde";
export type FramePosition = "sub" | "sup" | "pre-sup" | "pre-sub" | "none";

export interface KindStyle {
  weight: "regular" | "bold";
  /** Bold on the base only, or on its frame labels too. */
  boldScope: "base" | "scripts";
  shape: "italic" | "upright";
  letters: "serif" | "sans" | "calligraphic" | "blackboard" | "fraktur";
  /** Greek letters when bold: \boldsymbol (bold italic) or like Latin letters. */
  greek: "bold-italic" | "as-latin";
  accent: KindAccent;
  /** The accent drawn in the base's weight (renderer hint; Classic draws accents regular by default). */
  accentWeight: "regular" | "follow";
  frames: { position: FramePosition; separator: "" | "/" | "," };
  wrap: "none" | "brackets" | "braces" | "bars";
  /** Added after the base: "×" as a superscript (Hughes' ω^×) or inside the wrap ([ω×]). */
  suffix?: { text: string; as: "sup" | "inline" };
  /** Fixed symbol of the kind (DCM: C, A; frame: F); empty = the frames are the content ([BN]). */
  symbol?: string;
}

export interface KindDef {
  id: string;
  name: string;
  /** LaTeX macro without the backslash. */
  macro: string;
  /** Number of mandatory arguments. */
  args: number;
  /** What the arguments are, for help and the style editor. */
  argNames: string[];
  /** Snippet trigger (type it, then Tab). */
  snippet: string;
}

export const KINDS: KindDef[] = [
  { id: "pvec", name: "Physical vector", macro: "pvec", args: 1, argNames: ["symbol"], snippet: "pv" },
  { id: "uvec", name: "Unit direction vector", macro: "uvec", args: 1, argNames: ["symbol"], snippet: "uv" },
  { id: "bvec", name: "Basis vector", macro: "bvec", args: 1, argNames: ["symbol"], snippet: "bv" },
  { id: "vectrix", name: "Vectrix (frame)", macro: "vectrix", args: 1, argNames: ["symbol"], snippet: "vx" },
  { id: "cmat", name: "Column matrix", macro: "cmat", args: 1, argNames: ["symbol"], snippet: "cl" },
  { id: "mat", name: "Matrix", macro: "mat", args: 1, argNames: ["symbol"], snippet: "mt" },
  { id: "dcm", name: "Direction cosine matrix", macro: "dcm", args: 2, argNames: ["to frame", "from frame"], snippet: "dc" },
  { id: "crossmat", name: "Cross (skew-symmetric) matrix", macro: "crossmat", args: 1, argNames: ["vector"], snippet: "cx" },
  { id: "dyadic", name: "Dyadic", macro: "dyadic", args: 1, argNames: ["symbol"], snippet: "da" },
  { id: "tens", name: "Tensor", macro: "tens", args: 1, argNames: ["symbol"], snippet: "tn" },
  { id: "quat", name: "Quaternion", macro: "quat", args: 1, argNames: ["symbol"], snippet: "qt" },
  { id: "frm", name: "Reference frame", macro: "frm", args: 1, argNames: ["label"], snippet: "fr" },
  { id: "body", name: "Body / region", macro: "body", args: 1, argNames: ["symbol"], snippet: "bd" },
  { id: "T", name: "Transpose mark", macro: "T", args: 0, argNames: [], snippet: "tp" },
  { id: "diff", name: "Differential", macro: "diff", args: 1, argNames: ["variable"], snippet: "df" },
];
export const KIND_BY_ID = new Map(KINDS.map((k) => [k.id, k]));
export const KIND_BY_MACRO = new Map(KINDS.map((k) => [k.macro, k]));

const BASE: KindStyle = {
  weight: "regular", boldScope: "base", shape: "italic", letters: "serif", greek: "bold-italic", accent: "none",
  accentWeight: "regular", frames: { position: "sub", separator: "" }, wrap: "none",
};
const S = (over: Partial<KindStyle>): KindStyle => ({ ...BASE, ...over, frames: { ...BASE.frames, ...(over.frames ?? {}) } });
const BOLD: Partial<KindStyle> = { weight: "bold", shape: "upright" };

export type PresetId = "hughes" | "schaub" | "markley";

/** Built-in styles. Hughes defaults follow the thesis census (docs/NOTATION-CENSUS.md). */
export const PRESETS: Record<PresetId, { name: string; kinds: Record<string, KindStyle> }> = {
  hughes: {
    name: "Hughes (vectrix)",
    kinds: {
      pvec: S({ ...BOLD, accent: "harpoon" }),
      uvec: S({ accent: "hat" }),
      bvec: S({ ...BOLD, accent: "hat" }),
      vectrix: S({ ...BOLD, accent: "arrow" }),
      cmat: S(BOLD),
      mat: S(BOLD),
      dcm: S({ ...BOLD, symbol: "C" }),
      crossmat: S({ ...BOLD, suffix: { text: "×", as: "sup" } }),
      dyadic: S({ ...BOLD, accent: "double-arrow" }),
      tens: S({ ...BOLD, letters: "sans" }),
      quat: S(BOLD),
      frm: S({ letters: "calligraphic", shape: "upright", accent: "arrow", symbol: "F" }),
      body: S(BOLD),
      T: S({ shape: "upright" }),
      diff: S({ shape: "upright" }),
    },
  },
  schaub: {
    name: "Schaub & Junkins",
    kinds: {
      pvec: S({ ...BOLD, frames: { position: "pre-sup", separator: "" } }),
      uvec: S({ accent: "hat" }),
      bvec: S({ accent: "hat" }),
      vectrix: S({ wrap: "braces", accent: "hat" }),
      cmat: S({ ...BOLD, frames: { position: "pre-sup", separator: "" } }),
      mat: S({ wrap: "brackets", shape: "upright" }),
      dcm: S({ shape: "upright", wrap: "brackets", symbol: "" }),
      crossmat: S({ accent: "tilde", wrap: "brackets" }),
      dyadic: S({ ...BOLD, letters: "calligraphic" }),
      tens: S({ wrap: "brackets", shape: "upright" }),
      quat: S(BOLD),
      frm: S({ letters: "calligraphic", shape: "upright", symbol: "" }),
      body: S(BOLD),
      T: S({ shape: "italic" }),
      diff: S({ shape: "upright" }),
    },
  },
  markley: {
    name: "Markley & Crassidis",
    kinds: {
      pvec: S(BOLD),
      uvec: S({ ...BOLD, accent: "hat" }),
      bvec: S({ ...BOLD, accent: "hat" }),
      vectrix: S({ ...BOLD, letters: "calligraphic" }),
      cmat: S(BOLD),
      mat: S({ shape: "italic" }),
      dcm: S({ ...BOLD, symbol: "A", frames: { position: "sub", separator: "" } }),
      crossmat: S({ ...BOLD, wrap: "brackets", suffix: { text: "×", as: "inline" } }),
      dyadic: S({ ...BOLD, accent: "double-bar" }),
      tens: S({ ...BOLD, letters: "sans" }),
      quat: S(BOLD),
      frm: S({ letters: "calligraphic", shape: "upright", symbol: "F" }),
      body: S(BOLD),
      T: S({ shape: "italic" }),
      diff: S({ shape: "upright" }),
    },
  },
};

export interface NotationProfile {
  preset: PresetId;
  /** The user's changes on top of the preset, per kind. */
  overrides: Record<string, Partial<KindStyle>>;
}

export const DEFAULT_PROFILE: NotationProfile = { preset: "hughes", overrides: {} };

export function styleOf(profile: NotationProfile, kind: string): KindStyle {
  const base = PRESETS[profile.preset].kinds[kind] ?? BASE;
  const over = profile.overrides[kind];
  return over ? { ...base, ...over, frames: { ...base.frames, ...(over.frames ?? {}) } } : base;
}

// ------------------------------------------------------------------ expansion

const row = (children: MathNode[]): Row => ({ kind: "row", children });
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const GREEK = /^[Α-Ωα-ωϑϕϖϰϱϵς]$/u;

function variantFor(st: KindStyle, ch: string): MathVariant | undefined {
  if (st.letters === "calligraphic") return "script";
  if (st.letters === "blackboard") return "double-struck";
  if (st.letters === "fraktur") return "fraktur";
  if (st.letters === "sans") return "sans-serif";
  if (st.weight === "bold") return GREEK.test(ch) && st.greek === "bold-italic" ? "bold-italic" : st.shape === "upright" ? "bold" : "bold-italic";
  return st.shape === "upright" ? "normal" : undefined;
}

function styleLetters(r: Row, st: KindStyle): Row {
  const visit = (n: MathNode) => {
    if (n.kind === "ident" || n.kind === "number") {
      const v = variantFor(st, n.text);
      if (n.kind === "number" && v === "normal") delete n.variant;
      else if (v) n.variant = v;
      else delete n.variant;
      return;
    }
    for (const [k, v] of Object.entries(n)) {
      if (k === "meta") continue;
      const each = (x: unknown) => {
        if (!x || typeof x !== "object") return;
        if (Array.isArray(x)) return x.forEach(each);
        const o = x as MathNode;
        if (o.kind === "row") o.children.forEach(visit);
        else if (o.kind) visit(o);
      };
      each(v);
    }
  };
  r.children.forEach(visit);
  return r;
}

const ACCENT_NODES: Record<Exclude<KindAccent, "none">, (body: Row) => MathNode> = {
  harpoon: (b) => ({ kind: "accent", accent: "overrightharpoon", body: b }),
  arrow: (b) => ({ kind: "accent", accent: "vec", body: b }),
  hat: (b) => ({ kind: "accent", accent: "hat", body: b }),
  bar: (b) => ({ kind: "accent", accent: "bar", body: b }),
  tilde: (b) => ({ kind: "accent", accent: "tilde", body: b }),
  "double-bar": (b) => ({ kind: "accent", accent: "bar", body: row([{ kind: "accent", accent: "bar", body: b }]) }),
  "double-arrow": (b) => ({ kind: "stack", position: "over", body: b, annotation: row([{ kind: "operator", text: "↔", opClass: "relation" }]), brace: false }),
  "under-bar": (b) => ({ kind: "accent", accent: "underline", body: b }),
  "double-under-bar": (b) => ({ kind: "accent", accent: "underline", body: row([{ kind: "accent", accent: "underline", body: b }]) }),
  "under-tilde": (b) => ({ kind: "stack", position: "under", body: b, annotation: row([{ kind: "operator", text: "∼", opClass: "relation" }]), brace: false }),
};

const WRAPS = { brackets: ["[", "]"], braces: ["{", "}"], bars: ["|", "|"] } as const;

function joinFrames(rows: Row[], sep: string): Row {
  const out: MathNode[] = [];
  rows.forEach((r, i) => {
    if (i && sep) out.push({ kind: "operator", text: sep, opClass: "ordinary" });
    out.push(...clone(r).children);
  });
  return row(out);
}

/** One kind object as ordinary nodes, in its style. */
export function expandKind(n: Notation, st: KindStyle): MathNode[] {
  const def = KIND_BY_ID.get(n.name);
  if (n.name === "T") {
    if (st.shape === "upright" && st.weight === "regular") return [{ kind: "ident", text: "T", variant: "normal" }];
    if (st.weight === "bold") return [{ kind: "ident", text: "T", variant: "bold" }];
    return [{ kind: "ident", text: "T" }];
  }
  if (n.name === "diff") {
    const d: MathNode = st.shape === "upright" ? { kind: "ident", text: "d", variant: "normal" } : { kind: "ident", text: "d" };
    return [d, ...clone(n.args[0] ?? row([])).children];
  }
  // Base: the symbol argument, or the kind's fixed symbol (DCM C, frame ℱ).
  const symbolKind = n.name === "dcm" || n.name === "frm";
  const frameRows = symbolKind ? n.args : n.frames ? [n.frames] : [];
  const sym = st.symbol ?? (n.name === "dcm" ? "C" : n.name === "frm" ? "F" : "");
  let base: Row = symbolKind ? row(sym ? [{ kind: "ident", text: sym }] : []) : clone(n.args[0] ?? row([]));
  let frames = frameRows.length ? joinFrames(frameRows, n.name === "dcm" && !sym ? "" : st.frames.separator) : undefined;
  if (symbolKind && !sym && frames) {
    // [BN]: the frame labels are the content.
    base = frames;
    frames = undefined;
  }
  styleLetters(base, st);
  if (frames && st.boldScope === "scripts") styleLetters(frames, st);
  let nodes: MathNode[] = base.children;
  if (st.accent !== "none" && base.children.length) nodes = [ACCENT_NODES[st.accent](base)];
  if (st.suffix?.as === "inline") nodes = [...nodes, { kind: "operator", text: st.suffix.text, opClass: "binary" }];
  if (st.wrap !== "none") {
    const [o, c] = WRAPS[st.wrap];
    nodes = [{ kind: "delimited", open: o, close: c, parts: [row(nodes)] }];
  }
  const sup = st.suffix?.as === "sup" ? row([{ kind: "operator", text: st.suffix.text, opClass: "binary" }]) : undefined;
  const pos = frames ? st.frames.position : "none";
  const sub = pos === "sub" ? frames : undefined;
  const supAll = pos === "sup" ? (sup ? row([...frames!.children, ...sup.children]) : frames) : sup;
  if (pos === "pre-sup" || pos === "pre-sub") {
    nodes = [{ kind: "prescripts", base: row(nodes), ...(pos === "pre-sup" ? { sup: frames } : { sub: frames }) }];
    if (supAll) nodes = [{ kind: "scripts", base: row(nodes), sup: supAll }];
  } else if (sub || supAll) nodes = [{ kind: "scripts", base: row(nodes), ...(sub ? { sub } : {}), ...(supAll ? { sup: supAll } : {}) }];
  void def;
  return nodes;
}

/** Replaces every kind object by its expansion in the profile's style (a new tree). */
export function expandNotation(root: Row, profile: NotationProfile = DEFAULT_PROFILE): Row {
  const out = clone(root);
  const fix = (r: Row) => {
    r.children = r.children.flatMap((n) => {
      walkRows(n, fix);
      return n.kind === "notation" ? expandKind(n, styleOf(profile, n.name)).map((x) => (walkRows(x, fix), x)) : [n];
    });
  };
  fix(out);
  return out;
}

function walkRows(n: MathNode, f: (r: Row) => void) {
  for (const [k, v] of Object.entries(n)) {
    if (k === "meta") continue;
    const each = (x: unknown) => {
      if (!x || typeof x !== "object") return;
      if (Array.isArray(x)) return x.forEach(each);
      const o = x as MathNode;
      if (o.kind === "row") f(o);
    };
    each(v);
  }
}

/** Whether a tree contains kind objects. */
export function hasNotation(root: Row): boolean {
  let found = false;
  const visit = (r: Row) => {
    for (const n of r.children) {
      if (n.kind === "notation") found = true;
      walkRows(n, visit);
    }
  };
  visit(root);
  return found;
}

// ------------------------------------------------------------------ recognising (peel)

const ACCENT_OF: Partial<Record<Exclude<KindAccent, "none">, AccentKind>> = {
  harpoon: "overrightharpoon", arrow: "vec", hat: "hat", bar: "bar", tilde: "tilde", "under-bar": "underline",
};

/** Splices rows nested directly in rows (\mathrm{ba} parses as a row inside the row). */
function flattenRows(r: Row): Row {
  const out: MathNode[] = [];
  for (const n of r.children) {
    if (n.kind === "row") out.push(...flattenRows(n).children);
    else {
      walkRows(n, (x) => {
        x.children = flattenRows(x).children;
      });
      out.push(n);
    }
  }
  r.children = out;
  return r;
}

/** Strips letter styles (the kind restyles them anyway). */
function plainLetters(r: Row): Row {
  const visit = (n: MathNode) => {
    if (n.kind === "ident" || n.kind === "number") delete n.variant;
    walkRows(n, (x) => x.children.forEach(visit));
  };
  r.children.forEach(visit);
  return r;
}

function single(r: Row | undefined): MathNode | null {
  return r && r.children.length === 1 ? r.children[0]! : null;
}

/**
 * Recognises an expanded kind object (the body of the editor's \class{nk-<kind>}{…} wrapper)
 * and returns the kind node — wrapped in scripts when extra scripts were added inside, e.g. a
 * prime. Null when the structure no longer matches the style (the object becomes hand-styled).
 * Letter styles inside are not checked: they are the kind's, whatever was typed.
 */
export function peelKind(kind: string, body: Row, st: KindStyle): MathNode | null {
  const def = KIND_BY_ID.get(kind);
  if (!def) return null;
  const nodes = flattenRows(clone(body)).children;
  if (kind === "T") return nodes.length === 1 && nodes[0]!.kind === "ident" && nodes[0]!.text === "T" ? { kind: "notation", name: "T", args: [] } : null;
  if (kind === "diff") {
    const first = nodes[0];
    if (!first || first.kind !== "ident" || first.text !== "d") return null;
    return { kind: "notation", name: "diff", args: [row(nodes.slice(1))] };
  }
  let cur: MathNode | null = nodes.length === 1 ? nodes[0]! : null;
  if (!cur) {
    // Several nodes: only valid for a bare base (no accent, wrap, scripts) of several letters.
    if (st.accent !== "none" || st.wrap !== "none" || st.suffix || kind === "dcm" || kind === "frm") return null;
    return { kind: "notation", name: kind, args: [plainLetters(row(nodes))] };
  }
  // Outer scripts: frame labels at the style's place, the suffix, and extra scripts (prime…).
  let frames: Row | undefined;
  let extraSup: Row | undefined;
  let extraSub: Row | undefined;
  const pos = st.frames.position;
  if (cur.kind === "scripts") {
    let sup = cur.sup;
    const sub = cur.sub;
    if (st.suffix?.as === "sup" && sup) {
      const last = sup.children[sup.children.length - 1];
      if (last && last.kind === "operator" && last.text === st.suffix.text) sup = sup.children.length > 1 ? row(sup.children.slice(0, -1)) : undefined;
      else return null;
    } else if (st.suffix?.as === "sup") return null;
    if (pos === "sub") [frames, extraSup, extraSub] = [sub, sup, undefined];
    else if (pos === "sup") [frames, extraSup, extraSub] = [sup, undefined, sub];
    else [extraSup, extraSub] = [sup, sub];
    cur = single(cur.base);
    if (!cur) return null;
  } else if (st.suffix?.as === "sup") return null;
  if (cur.kind === "prescripts" && (pos === "pre-sup" || pos === "pre-sub")) {
    frames = pos === "pre-sup" ? cur.sup : cur.sub;
    cur = single(cur.base);
    if (!cur) return null;
  }
  // Wrap and inline suffix.
  let inner: MathNode[];
  if (st.wrap !== "none") {
    if (cur.kind !== "delimited" || cur.open !== WRAPS[st.wrap][0] || cur.close !== WRAPS[st.wrap][1] || cur.parts.length !== 1) return null;
    inner = [...cur.parts[0]!.children];
  } else inner = [cur];
  if (st.suffix?.as === "inline") {
    const last = inner[inner.length - 1];
    if (!last || last.kind !== "operator" || last.text !== st.suffix.text) return null;
    inner = inner.slice(0, -1);
  }
  // Accent.
  let baseRow: Row;
  if (st.accent === "none") baseRow = row(inner);
  else {
    const a = inner.length === 1 ? inner[0]! : null;
    if (!a) return null;
    if (st.accent === "double-bar" || st.accent === "double-under-bar") {
      const k = st.accent === "double-bar" ? "bar" : "underline";
      const innerA = a.kind === "accent" && a.accent === k ? single(a.body) : null;
      if (!innerA || innerA.kind !== "accent" || innerA.accent !== k) return null;
      baseRow = innerA.body;
    } else if (st.accent === "double-arrow" || st.accent === "under-tilde") {
      const want = st.accent === "double-arrow" ? "over" : "under";
      if (a.kind !== "stack" || a.position !== want) return null;
      baseRow = a.body;
    } else {
      const k = ACCENT_OF[st.accent];
      // \vec and \overrightarrow are the same arrow.
      if (a.kind !== "accent" || !(a.accent === k || (k === "vec" && a.accent === "overrightarrow"))) return null;
      baseRow = a.body;
    }
  }
  let node: Notation;
  if (kind === "dcm" || kind === "frm") {
    const sym = st.symbol ?? (kind === "dcm" ? "C" : "F");
    let labels: MathNode[];
    if (sym) {
      const s = single(baseRow);
      if (!s || s.kind !== "ident" || s.text !== sym) return null;
      labels = frames ? plainLetters(clone(frames)).children : [];
      frames = undefined;
    } else labels = plainLetters(clone(baseRow)).children.concat(frames ? plainLetters(clone(frames)).children : []);
    // Upright labels come back as one word (\mathrm{ba}): one label per letter.
    const parts = labels
      .flatMap((l): MathNode[] => (l.kind === "ident" && [...l.text].length > 1 ? [...l.text].map((ch) => ({ kind: "ident", text: ch }) as MathNode) : [l]))
      .filter((l) => !(l.kind === "operator" && (l.text === "/" || l.text === ",")) && l.kind !== "space");
    if (kind === "dcm") {
      if (parts.length < 2) return null;
      node = { kind: "notation", name: "dcm", args: [row([parts[0]!]), row(parts.slice(1))] };
    } else node = { kind: "notation", name: "frm", args: [row(parts)] };
  } else {
    node = { kind: "notation", name: kind, args: [plainLetters(baseRow)] };
    if (frames) node.frames = st.boldScope === "scripts" ? plainLetters(frames) : frames;
  }
  if (extraSup || extraSub) return { kind: "scripts", base: row([node]), ...(extraSub ? { sub: extraSub } : {}), ...(extraSup ? { sup: extraSup } : {}) };
  return node;
}

// ------------------------------------------------------------------ LaTeX definitions (.tex export)

/** Macros of common packages that MathBlocks' kind macros must not silently replace or be replaced by. */
export const PACKAGE_MACROS: Record<string, string[]> = {
  physics: ["cross", "dyad", "dd", "dv", "pdv", "vb", "va", "vu", "tr", "Tr", "abs", "norm", "grad", "curl", "qty", "mqty"],
  diffcoeff: ["diff", "diffp"],
  commath: ["dif", "od", "pd", "abs", "norm", "set"],
  mathtools: ["coloneqq", "mathclap", "prescript"],
  amsmath: ["text", "tag", "dfrac"],
  bm: ["bm", "hm"],
  latex: ["skew"],
};

/** Kind macros that clash with a package (macro → packages). */
export function macroClashes(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const k of KINDS)
    for (const [pkg, names] of Object.entries(PACKAGE_MACROS)) if (names.includes(k.macro)) out.set(k.macro, [...(out.get(k.macro) ?? []), pkg]);
  return out;
}

/**
 * A \newcommand for a kind in its style (generated by expanding the kind with marker arguments).
 * Optional frame labels use a TeX test for an empty argument. `name` renames the macro.
 */
export function kindNewcommand(kind: string, st: KindStyle, serialize: (r: Row) => string, name = KIND_BY_ID.get(kind)?.macro ?? kind): string {
  const def = KIND_BY_ID.get(kind)!;
  const M1 = "①";
  const M2 = "②";
  const M3 = "③";
  const id = (t: string): Row => row([{ kind: "ident", text: t }]);
  const subst = (s: string, map: Record<string, string>) => {
    let out = s;
    for (const [m, v] of Object.entries(map)) out = out.split(m).join(v);
    // Arguments may be several tokens (P/O): always brace them in scripts.
    out = out.replace(/([_^])(#\d)/g, "$1{$2}");
    // \mathbf on an argument that may be Greek: bold upright for letters, \boldsymbol for commands.
    return out.replace(/\\mathbf\{(#\d)\}/g, st.greek === "bold-italic" ? "\\mbbold{$1}" : "\\mathbf{$1}");
  };
  if (def.args === 0) return `\\newcommand{\\${name}}{${serialize(row(expandKind({ kind: "notation", name: kind, args: [] }, st)))}}`;
  if (kind === "dcm" || kind === "frm") {
    const args = kind === "dcm" ? [id(M1), id(M2)] : [id(M1)];
    const body = serialize(row(expandKind({ kind: "notation", name: kind, args }, st)));
    return `\\newcommand{\\${name}}[${def.args}]{${subst(body, { [M1]: "#1", [M2]: "#2" })}}`;
  }
  if (kind === "diff") return `\\newcommand{\\${name}}[1]{${subst(serialize(row(expandKind({ kind: "notation", name: kind, args: [id(M1)] }, st))), { [M1]: "#1" })}}`;
  // [#1] frame labels (optional), #2 the symbol.
  const without = serialize(row(expandKind({ kind: "notation", name: kind, args: [id(M2)] }, st)));
  const withFr = serialize(row(expandKind({ kind: "notation", name: kind, args: [id(M2)], frames: id(M3) }, st)));
  const a = subst(without, { [M2]: "#2" });
  const b = subst(withFr, { [M2]: "#2", [M3]: "#1" });
  return `\\newcommand{\\${name}}[2][]{\\ifx\\relax#1\\relax ${a}\\else ${b}\\fi}`;
}

/** Helper used by the generated definitions (bold upright Latin, bold italic Greek). */
export const MBBOLD_DEFINITION = "\\newcommand{\\mbbold}[1]{\\ifcat\\noexpand#1a\\mathbf{#1}\\else\\boldsymbol{#1}\\fi}";
