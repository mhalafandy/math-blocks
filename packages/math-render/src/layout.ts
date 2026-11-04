/**
 * The typesetting engine: AST → boxes. A simplified TeX: atoms with spacing classes, boxes with
 * width/height/depth in em, glyphs from the text fonts (Times) or the math font (STIX Two Math).
 */
import type { MathNode, MathVariant, Row } from "@mathblocks/math-core";
import { expandNotation, type NotationProfile } from "@mathblocks/math-core";
import { charGlyph, glyphName, namedGlyph, symbolGlyph, type FontSet, type GlyphInfo } from "./fonts";
import type { RenderStyle } from "./style";

// ------------------------------------------------------------------ boxes

export type Item =
  | { k: "g"; g: GlyphInfo; x: number; y: number; s: number; sx?: number; sy?: number; color?: string; slant?: number; thin?: number }
  | { k: "r"; x: number; y: number; w: number; h: number; color?: string }
  /** A filled shape drawn by the engine (accents), in em, y up, relative to (x, y). */
  | { k: "p"; x: number; y: number; pts: [number, number][]; color?: string };

export interface Box {
  w: number;
  h: number;
  d: number;
  items: Item[];
  /** Extra ink right of the advance (italic letters): superscripts go after it. */
  overhang?: number;
  /** A single italic or upright letter (accent placement). */
  char?: { italic: boolean };
  /** Height that scripts are placed against (an accented letter uses the letter's height). */
  scriptH?: number;
}

const empty = (w = 0): Box => ({ w, h: 0, d: 0, items: [] });

function shift(items: Item[], dx: number, dy: number): Item[] {
  return items.map((it) => ({ ...it, x: it.x + dx, y: it.y + dy }));
}

/** Places boxes side by side (x offsets given), returns the union box. */
function combine(parts: { box: Box; x: number; y: number }[], w?: number): Box {
  let h = 0;
  let d = 0;
  let right = 0;
  const items: Item[] = [];
  for (const p of parts) {
    h = Math.max(h, p.box.h + p.y);
    d = Math.max(d, p.box.d - p.y);
    right = Math.max(right, p.x + p.box.w);
    items.push(...shift(p.box.items, p.x, p.y));
  }
  return { w: w ?? right, h, d, items };
}

function glyphBox(g: GlyphInfo, s: number, color?: string, sy = 1): Box {
  return {
    w: g.w * s,
    h: g.h * s * sy,
    d: g.d * s * sy,
    items: [{ k: "g", g, x: 0, y: 0, s, sy: sy !== 1 ? sy : undefined, color }],
    overhang: Math.max(0, (g.xMax - g.w) * s),
  };
}

/** Visible ink of a box: left/right edges and top (em), and the slope of its letters (italic). */
export function inkOf(box: Box): { x0: number; x1: number; top: number; slope: number } {
  let x0 = Infinity;
  let x1 = -Infinity;
  let top = -Infinity;
  let slope = 0;
  for (const it of box.items) {
    if (it.k === "g") {
      const sx = it.sx ?? 1;
      const sy = it.sy ?? 1;
      const k = it.slant ?? 0;
      const h = it.g.h * it.s * sy;
      x0 = Math.min(x0, it.x + it.g.xMin * it.s * sx);
      x1 = Math.max(x1, it.x + it.g.xMax * it.s * sx + k * h);
      top = Math.max(top, it.y + h);
      const angle = (it.g.font as unknown as { tables: { post?: { italicAngle?: number } } }).tables.post?.italicAngle ?? 0;
      slope = Math.max(slope, k || Math.tan((-angle * Math.PI) / 180));
    } else if (it.k === "r") {
      x0 = Math.min(x0, it.x);
      x1 = Math.max(x1, it.x + it.w);
      top = Math.max(top, it.y + it.h);
    } else {
      for (const [px, py] of it.pts) {
        x0 = Math.min(x0, it.x + px);
        x1 = Math.max(x1, it.x + px);
        top = Math.max(top, it.y + py);
      }
    }
  }
  if (!Number.isFinite(x0)) return { x0: 0, x1: box.w, top: box.h, slope: 0 };
  return { x0, x1, top, slope };
}

function rule(x: number, y: number, w: number, h: number): Item {
  return { k: "r", x, y, w, h };
}

// ------------------------------------------------------------------ context

interface Ctx {
  fonts: FontSet;
  st: RenderStyle;
  /** Current size, relative to the base font size. */
  s: number;
  display: boolean;
  /** 0 base, 1 script, 2 script-script. */
  level: number;
  /** Fonts the drawing used (recorded with the picture). */
  used?: Set<GlyphSource>;
}

const script = (c: Ctx): Ctx => ({
  ...c,
  display: false,
  level: Math.min(2, c.level + 1),
  s: c.level === 0 ? c.st.scriptScale : c.st.scriptScriptScale,
});

/** Height of the math axis (centre of the minus sign) at the current size. */
function axis(c: Ctx): number {
  const g = charGlyph(c.fonts.regular, "−") ?? charGlyph(c.fonts.math, "−");
  return g ? ((g.h - g.d) / 2) * c.s : 0.25 * c.s;
}

// ------------------------------------------------------------------ characters

const MATH_ALPHA: Partial<Record<MathVariant, [number, number, number?]>> = {
  // [capital A, small a, digit 0]
  "double-struck": [0x1d538, 0x1d552, 0x1d7d8],
  script: [0x1d49c, 0x1d4b6],
  fraktur: [0x1d504, 0x1d51e],
  "sans-serif": [0x1d5a0, 0x1d5ba, 0x1d7e2],
  monospace: [0x1d670, 0x1d68a, 0x1d7f6],
};
// Letters that have their own code points outside the math alphanumeric block.
const ALPHA_HOLES: Record<number, string> = {
  0x1d53a: "ℂ", 0x1d53f: "ℍ", 0x1d545: "ℕ", 0x1d547: "ℙ", 0x1d548: "ℚ", 0x1d549: "ℝ", 0x1d551: "ℤ",
  0x1d49d: "ℬ", 0x1d4a0: "ℰ", 0x1d4a1: "ℱ", 0x1d4a3: "ℋ", 0x1d4a4: "ℐ", 0x1d4a7: "ℒ", 0x1d4a8: "ℳ", 0x1d4ad: "ℛ",
  0x1d4ba: "ℯ", 0x1d4bc: "ℊ", 0x1d4c4: "ℴ", 0x1d506: "ℭ", 0x1d50b: "ℌ", 0x1d50c: "ℑ", 0x1d515: "ℜ", 0x1d51d: "ℨ",
};

function mathAlpha(ch: string, variant: MathVariant): string | null {
  const base = MATH_ALPHA[variant];
  if (!base) return null;
  const c = ch.codePointAt(0)!;
  let cp: number | null = null;
  if (c >= 65 && c <= 90) cp = base[0] + (c - 65);
  else if (c >= 97 && c <= 122) cp = base[1] + (c - 97);
  else if (c >= 48 && c <= 57 && base[2]) cp = base[2] + (c - 48);
  if (cp === null) return null;
  return ALPHA_HOLES[cp] ?? String.fromCodePoint(cp);
}

const isLatin = (ch: string) => /^[A-Za-z]$/.test(ch);
const isLowerGreek = (ch: string) => /^[α-ωϑϕϖϰϱϵ]$/.test(ch);
const isUpperGreek = (ch: string) => /^[Α-Ω]$/.test(ch);

type FaceName = "regular" | "italic" | "bold" | "boldItalic";

function faceFor(ch: string, variant: MathVariant | undefined, kind: "ident" | "number" | "operator" | "text", c: Ctx): FaceName {
  if (variant === "bold") return "bold";
  if (variant === "bold-italic") return "boldItalic";
  if (variant === "italic") return "italic";
  if (variant === "normal" || kind !== "ident") return "regular";
  if (isLatin(ch)) return "italic";
  if (isLowerGreek(ch)) return c.st.greekItalic ? "italic" : "regular";
  if (isUpperGreek(ch)) return "regular";
  return "regular";
}

/** One character as a box, with font fallback (text face → math font → regular). */
/** Characters MathType takes from the Symbol font (its "Symbol" and Greek styles). */
const SYMBOL_STYLE = new Set([..."+−=<>±×÷≤≥≠≈≡∼≅∝∂∞∇∈∉∋⊂⊃⊆⊇∩∪→←↔⇒⇔⇐↑↓⋅•…′″∀∃¬∧∨⊥∠∅⊗⊕"]);

/** Which font a character is drawn from: Symbol (Classic), the text face, the math font, or the regular face as a last resort. */
export type GlyphSource = "symbol" | "text" | "extra" | "math" | "regular" | "none";

interface Resolved {
  g: GlyphInfo | null;
  source: GlyphSource;
  /** Greek from the Symbol font drawn oblique (italic). */
  slanted?: boolean;
}

/** The font decision for one character; charBox draws what this returns (one source of truth for drawing and audits). */
function resolveGlyph(ch: string, face: FaceName, fonts: FontSet, st: RenderStyle, variant?: MathVariant): Resolved {
  // Classic: Greek and operators from the Symbol font, like MathType.
  const sym = fonts.symbol;
  if (sym && st.useSymbolFont && !variant?.match(/double-struck|script|fraktur|sans-serif|monospace/)) {
    const greek = isLowerGreek(ch) || isUpperGreek(ch) || ch === "ϕ" || ch === "φ";
    if (greek || SYMBOL_STYLE.has(ch)) {
      const g = symbolGlyph(sym, ch);
      if (g) return { g, source: "symbol", slanted: greek && (face === "italic" || face === "boldItalic") };
    }
  }
  const alpha = variant ? mathAlpha(ch, variant) : null;
  if (alpha) {
    const g = charGlyph(fonts.math, alpha);
    if (g) return { g, source: "math" };
  }
  const fromFace = charGlyph(fonts[face], ch);
  if (fromFace) return { g: fromFace, source: "text" };
  // MT Extra (as MathType uses it) for symbols Times lacks; only its Unicode symbol range, never letters.
  if (fonts.extra && st.useExtraFont && (ch.codePointAt(0) ?? 0) >= 0x2000) {
    const g = charGlyph(fonts.extra, ch);
    if (g) return { g, source: "extra" };
  }
  const fromMath = charGlyph(fonts.math, ch);
  if (fromMath) return { g: fromMath, source: "math" };
  const fromRegular = charGlyph(fonts.regular, ch);
  if (fromRegular) return { g: fromRegular, source: "regular" };
  return { g: null, source: "none" };
}

/** Where a character of an identifier/operator with this variant would be drawn from (for audits). */
export function glyphSource(ch: string, kind: "ident" | "number" | "operator" | "text", fonts: FontSet, st: RenderStyle, variant?: MathVariant): GlyphSource {
  const c = { fonts, st, s: 1, display: false, level: 0 } as Ctx;
  return resolveGlyph(ch, faceFor(ch, variant, kind, c), fonts, st, variant).source;
}

/** An empty slot: a small dotted square (one placeholder look everywhere: palette tiles, previews). */
export const PLACEHOLDER = "\u2B1A";

function placeholderBox(c: Ctx): Box {
  const s = c.s;
  const w = 0.5 * s;
  const h = 0.58 * s;
  const y0 = -0.02 * s;
  const dot = 0.045 * s;
  const items: Item[] = [];
  const n = 5;
  const sq = (x: number, y: number) => items.push({ k: "p", x, y, pts: [[0, 0], [dot, 0], [dot, dot], [0, dot]] });
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    sq(0.04 * s + t * (w - 0.08 * s - dot), y0);
    sq(0.04 * s + t * (w - 0.08 * s - dot), y0 + h - dot);
    if (i > 0 && i < n - 1) {
      sq(0.04 * s, y0 + t * (h - dot));
      sq(w - 0.04 * s - dot, y0 + t * (h - dot));
    }
  }
  return { w: w + 0.04 * s, h: y0 + h, d: Math.max(0, -y0), items, char: { italic: false } };
}

function charBox(ch: string, face: FaceName, c: Ctx, variant?: MathVariant): Box {
  if (ch === PLACEHOLDER) return placeholderBox(c);
  const r = resolveGlyph(ch, face, c.fonts, c.st, variant);
  c.used?.add(r.source);
  if (!r.g) return empty(0.5 * c.s);
  if (r.source === "math" && (c.st.fallbackScale !== 1 || c.st.fallbackThin)) {
    // STIX next to Times: a little smaller and, optionally, thinned to Times' stroke weight.
    const b = glyphBox(r.g, c.s * c.st.fallbackScale);
    if (c.st.fallbackThin) b.items[0] = { ...(b.items[0] as Extract<Item, { k: "g" }>), thin: c.st.fallbackThin * c.s };
    b.char = { italic: face === "italic" || face === "boldItalic" };
    return b;
  }
  const b = glyphBox(r.g, c.s);
  if (r.source === "symbol") {
    if (r.slanted) {
      const k = c.st.obliqueSlant;
      b.items[0] = { ...(b.items[0] as Extract<Item, { k: "g" }>), slant: k };
      b.overhang = Math.max(0, (r.g.xMax + k * r.g.h - r.g.w) * c.s);
    }
    b.char = { italic: !!r.slanted };
    return b;
  }
  b.char = { italic: face === "italic" || face === "boldItalic" };
  return b;
}

function textBox(text: string, face: FaceName, c: Ctx, variant?: MathVariant, color?: string): Box {
  const parts: { box: Box; x: number; y: number }[] = [];
  let x = 0;
  let last: Box | null = null;
  for (const ch of text) {
    if (ch === " ") {
      x += 0.25 * c.s;
      continue;
    }
    const b = charBox(ch, face, c, variant);
    if (color) for (const it of b.items) it.color = color;
    parts.push({ box: b, x, y: 0 });
    x += b.w;
    last = b;
  }
  const box = combine(parts, x);
  if (last && parts.length === 1) {
    box.overhang = last.overhang;
    box.char = last.char;
  } else if (last) box.overhang = last.overhang;
  return box;
}

// ------------------------------------------------------------------ atoms and spacing

type Cls = "ord" | "op" | "bin" | "rel" | "open" | "close" | "punct" | "inner";

interface Atom {
  box: Box;
  cls: Cls;
}

// TeX's inter-atom spacing: 0 none, 1 thin, 2 medium, 3 thick; negative = only in display/text.
const SPACING: Record<Cls, Record<Cls, number>> = {
  ord: { ord: 0, op: 1, bin: -2, rel: -3, open: 0, close: 0, punct: 0, inner: -1 },
  op: { ord: 1, op: 1, bin: 0, rel: -3, open: 0, close: 0, punct: 0, inner: -1 },
  bin: { ord: -2, op: -2, bin: 0, rel: 0, open: -2, close: 0, punct: 0, inner: -2 },
  rel: { ord: -3, op: -3, bin: 0, rel: 0, open: -3, close: 0, punct: 0, inner: -3 },
  open: { ord: 0, op: 0, bin: 0, rel: 0, open: 0, close: 0, punct: 0, inner: 0 },
  close: { ord: 0, op: 1, bin: -2, rel: -3, open: 0, close: 0, punct: 0, inner: -1 },
  punct: { ord: -1, op: -1, bin: 0, rel: -1, open: -1, close: -1, punct: -1, inner: -1 },
  inner: { ord: -1, op: 1, bin: -2, rel: -3, open: -1, close: 0, punct: -1, inner: -1 },
};

function space(a: Cls, b: Cls, c: Ctx): number {
  const v = SPACING[a][b];
  if (v === 0 || (v < 0 && c.level > 0)) return 0;
  const k = Math.abs(v);
  return (k === 1 ? c.st.thin : k === 2 ? c.st.medium : c.st.thick) * c.s;
}

const OPEN = new Set(["(", "[", "{", "⟨", "⌊", "⌈"]);
const CLOSE = new Set([")", "]", "}", "⟩", "⌋", "⌉"]);

/** Lays out a row: atoms with TeX spacing. */
export function layoutRow(r: Row, c: Ctx, opts: { leadingOrd?: boolean } = {}): Box {
  const atoms: Atom[] = [];
  if (opts.leadingOrd) atoms.push({ box: empty(), cls: "ord" });
  for (const n of r.children) atomsOf(n, c, atoms);
  // Binary operators in a unary position act as ordinary symbols (−μ, a = −b).
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i]!;
    if (a.cls !== "bin") continue;
    const prev = atoms[i - 1]?.cls;
    const next = atoms[i + 1]?.cls;
    if (!prev || ["bin", "op", "rel", "open", "punct"].includes(prev) || !next || ["rel", "close", "punct"].includes(next)) a.cls = "ord";
  }
  const parts: { box: Box; x: number; y: number }[] = [];
  let x = 0;
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i]!;
    if (i > 0) x += space(atoms[i - 1]!.cls, a.cls, c);
    parts.push({ box: a.box, x, y: 0 });
    x += a.box.w;
  }
  const box = combine(parts, x);
  if (atoms.length === 1) {
    box.overhang = atoms[0]!.box.overhang;
    box.char = atoms[0]!.box.char;
    box.scriptH = atoms[0]!.box.scriptH;
  } else if (atoms.length) box.overhang = atoms[atoms.length - 1]!.box.overhang;
  return box;
}

function atomsOf(n: MathNode, c: Ctx, out: Atom[]) {
  switch (n.kind) {
    case "row":
      out.push({ box: layoutRow(n, c), cls: "ord" });
      return;
    case "ident":
      out.push({ box: textBox(n.text, faceFor(n.text, n.variant, "ident", c), c, n.variant), cls: "ord" });
      return;
    case "number":
      out.push({ box: textBox(n.text, faceFor(n.text, n.variant, "number", c), c, n.variant), cls: "ord" });
      return;
    case "text":
      out.push({ box: textBox(n.text, "regular", c), cls: "ord" });
      return;
    case "operator": {
      const cls: Cls =
        n.opClass === "binary" ? "bin" : n.opClass === "relation" ? "rel" : n.opClass === "punctuation" ? "punct" : OPEN.has(n.text) ? "open" : CLOSE.has(n.text) ? "close" : "ord";
      out.push({ box: textBox(n.text, "regular", c), cls });
      return;
    }
    case "space": {
      const w = { thin: c.st.thin, medium: c.st.medium, thick: c.st.thick, quad: 1, qquad: 2, negthin: -c.st.thin, nbsp: 0.25 }[n.width];
      out.push({ box: empty(w * c.s), cls: "ord" });
      return;
    }
    case "fraction":
      out.push({ box: fraction(n, c), cls: "inner" });
      return;
    case "scripts":
      out.push({ box: scripts(layoutRow(n.base, c), n.sub, n.sup, c), cls: classOfRow(n.base) });
      return;
    case "prescripts":
      out.push({ box: prescripts(n.base, n.sub, n.sup, c), cls: "ord" });
      return;
    case "radical":
      out.push({ box: radical(n.body, n.index, c), cls: "ord" });
      return;
    case "nary":
      out.push({ box: nary(n.op, n.sub, n.sup, n.limits, c), cls: "op" });
      for (const b of n.body.children) atomsOf(b, c, out);
      return;
    case "function": {
      const name = textBox(n.name, "regular", c);
      const limits = n.limits && c.display;
      out.push({ box: limits ? underOver(name, n.sub, n.sup, c) : n.sub || n.sup ? scripts(name, n.sub, n.sup, c) : name, cls: "op" });
      for (const b of n.arg.children) atomsOf(b, c, out);
      return;
    }
    case "delimited":
      out.push({ box: delimited(n.open, n.close, n.parts, n.separator, c), cls: "inner" });
      return;
    case "accent":
      out.push({ box: accent(n.accent, n.body, c), cls: "ord" });
      return;
    case "stack": {
      const body = layoutRow(n.body, c);
      out.push({ box: stack(body, n.annotation, n.position, n.brace, c), cls: "ord" });
      return;
    }
    case "boxed":
      out.push({ box: boxed(layoutRow(n.body, c), c), cls: "ord" });
      return;
    case "matrix":
      out.push({ box: matrix(n.matrixKind, n.rows, c), cls: "inner" });
      return;
    case "cases":
      out.push({ box: cases(n.rows, c), cls: "inner" });
      return;
    case "aligned":
      out.push({ box: aligned(n.rows, c), cls: "ord" });
      return;
    case "notation":
      for (const x of expandNotation({ kind: "row", children: [n] }).children) atomsOf(x, c, out);
      return;
    case "raw":
      out.push({ box: textBox(n.latex, "regular", c, undefined, "#c0392b"), cls: "ord" });
      return;
  }
}

function classOfRow(r: Row): Cls {
  if (r.children.length !== 1) return "ord";
  const n = r.children[0]!;
  if (n.kind === "operator") return n.opClass === "binary" ? "bin" : n.opClass === "relation" ? "rel" : "ord";
  if (n.kind === "nary" || n.kind === "function") return "op";
  return "ord";
}

// ------------------------------------------------------------------ constructions

function fraction(n: Extract<MathNode, { kind: "fraction" }>, c0: Ctx): Box {
  // MathType keeps numerator and denominator at full size; \tfrac and nested levels shrink.
  const c = n.size === "text" ? script(c0) : c0;
  const num = layoutRow(n.num, c);
  const den = layoutRow(n.den, c);
  const st = c0.st;
  const s = c0.s;
  const t = n.bar ? st.rule * s : 0;
  const a = axis(c0);
  const gap = (n.bar ? st.fracGap : st.fracGap * 2) * s;
  const w = Math.max(num.w, den.w) + 2 * st.fracOverhang * s;
  // Fixed baselines (MathType's numerator height / denominator depth), pushed apart by tall parts.
  const up = Math.max(a + t / 2 + st.fracNumHeight * s, a + t / 2 + gap + num.d);
  const down = Math.min(a - t / 2 - st.fracDenDepth * s, a - t / 2 - gap - den.h);
  const box = combine(
    [
      { box: num, x: (w - num.w) / 2, y: up },
      { box: den, x: (w - den.w) / 2, y: down },
    ],
    w,
  );
  if (n.bar) box.items.push(rule(0, a - t / 2, w, t));
  // Thin space on both sides keeps the bar off its neighbours.
  const pad = c0.st.thin * 0.5 * s;
  return { w: w + 2 * pad, h: box.h, d: box.d, items: shift(box.items, pad, 0) };
}

function scripts(base: Box, sub: Row | undefined, sup: Row | undefined, c: Ctx): Box {
  const sc = script(c);
  const st = c.st;
  const subB = sub ? layoutRow(sub, sc) : null;
  const supB = sup ? layoutRow(sup, sc) : null;
  let up = 0;
  let down = 0;
  const baseH = base.scriptH ?? base.h;
  if (supB) up = Math.max(st.supShift * c.s, baseH - 0.5 * supB.h, supB.d + 0.2 * c.s);
  if (subB) down = Math.max(st.subShift * c.s, base.d + 0.4 * subB.h - 0.2 * c.s, subB.h - 0.55 * c.s);
  if (supB && subB) {
    const gap = up - supB.d - (subB.h - down);
    const need = 4 * st.rule * c.s;
    if (gap < need) {
      const extra = need - gap;
      up += extra / 2;
      down += extra / 2;
    }
  }
  const gx = st.scriptGap * c.s;
  const parts = [{ box: base, x: 0, y: 0 }];
  let w = base.w;
  if (supB) {
    const x = base.w + (base.overhang ?? 0) + gx;
    parts.push({ box: supB, x, y: up });
    w = Math.max(w, x + supB.w);
  }
  if (subB) {
    const x = base.w + gx * 0.5;
    parts.push({ box: subB, x, y: -down });
    w = Math.max(w, x + subB.w);
  }
  return combine(parts, w + gx * 0.5);
}

function prescripts(baseRow: Row, sub: Row | undefined, sup: Row | undefined, c: Ctx): Box {
  const base = layoutRow(baseRow, c);
  const sc = script(c);
  const subB = sub ? layoutRow(sub, sc) : null;
  const supB = sup ? layoutRow(sup, sc) : null;
  const pw = Math.max(subB?.w ?? 0, supB?.w ?? 0) + c.st.scriptGap * c.s;
  const parts = [{ box: base, x: pw, y: 0 }];
  if (supB) parts.push({ box: supB, x: pw - c.st.scriptGap * c.s - supB.w, y: Math.max(c.st.supShift * c.s, base.h - 0.5 * supB.h) });
  if (subB) parts.push({ box: subB, x: pw - c.st.scriptGap * c.s - subB.w, y: -Math.max(c.st.subShift * c.s, base.d) });
  return combine(parts, pw + base.w);
}

/** Limits centred above and below a base (sums in display, lim). */
function underOver(base: Box, sub: Row | undefined, sup: Row | undefined, c: Ctx): Box {
  const sc = script(c);
  const subB = sub ? layoutRow(sub, sc) : null;
  const supB = sup ? layoutRow(sup, sc) : null;
  const gap = c.st.limitGap * c.s;
  const w = Math.max(base.w, subB?.w ?? 0, supB?.w ?? 0);
  const parts = [{ box: base, x: (w - base.w) / 2, y: 0 }];
  if (supB) parts.push({ box: supB, x: (w - supB.w) / 2, y: base.h + gap + supB.d });
  if (subB) parts.push({ box: subB, x: (w - subB.w) / 2, y: -(base.d + gap + subB.h) });
  return combine(parts, w);
}

const INTEGRALS = new Set(["∫", "∬", "∭", "∮", "∯", "∰", "⨌"]);

function nary(op: string, sub: Row | undefined, sup: Row | undefined, limits: "auto" | "limits" | "nolimits", c: Ctx): Box {
  const integral = INTEGRALS.has(op);
  const m = c.fonts.math;
  const fromSymbol = c.fonts.symbol && c.st.useSymbolFont ? symbolGlyph(c.fonts.symbol, op) : null;
  let g = fromSymbol ?? charGlyph(m, op) ?? charGlyph(c.fonts.regular, op);
  if (!g) return textBox(op, "regular", c);
  let size = c.s;
  if ((c.display || fromSymbol) && c.st.bigOpScale > 0) size = c.s * (c.display ? c.st.bigOpScale : 1);
  else if (c.display) {
    const name = g.glyph.name;
    const big = name ? (namedGlyph(m, `${name}.dsp`) ?? namedGlyph(m, `${name}.s1`)) : null;
    if (big) g = big;
  }
  const a = axis(c);
  const opBox = glyphBox(g, size);
  const dy = a - ((g.h - g.d) / 2) * size;
  const centred: Box = { ...opBox, h: opBox.h + dy, d: opBox.d - dy, items: shift(opBox.items, 0, dy) };
  const under = limits === "limits" || (limits === "auto" && !integral && c.display);
  if (under) return underOver(centred, sub, sup, c);
  if (!sub && !sup) return centred;
  // Side limits; integrals are slanted, so the lower limit tucks in under the bottom.
  const sc = script(c);
  const subB = sub ? layoutRow(sub, sc) : null;
  const supB = sup ? layoutRow(sup, sc) : null;
  const parts = [{ box: centred, x: 0, y: 0 }];
  let w = centred.w;
  const gx = c.st.scriptGap * c.s;
  if (supB) {
    const x = (integral ? g.xMax * size + 0.03 * c.s : centred.w) + gx;
    const y = centred.h - supB.h * 0.75;
    parts.push({ box: supB, x, y });
    w = Math.max(w, x + supB.w);
  }
  if (subB) {
    const x = (integral ? centred.w * 0.55 : centred.w) + gx;
    const y = -centred.d + subB.d * 0.5;
    parts.push({ box: subB, x, y });
    w = Math.max(w, x + subB.w);
  }
  return combine(parts, w + gx);
}

// ------------------------------------------------------------------ delimiters

const ASSEMBLY: Record<string, [string, string, string, string?]> = {
  // top, extender, bottom, middle
  "(": ["⎛", "⎜", "⎝"],
  ")": ["⎞", "⎟", "⎠"],
  "[": ["⎡", "⎢", "⎣"],
  "]": ["⎤", "⎥", "⎦"],
  "{": ["⎧", "⎪", "⎩", "⎨"],
  "}": ["⎫", "⎪", "⎭", "⎬"],
  "⌈": ["⎡", "⎢", "⎢"],
  "⌉": ["⎤", "⎥", "⎥"],
  "⌊": ["⎢", "⎢", "⎣"],
  "⌋": ["⎥", "⎥", "⎦"],
};

/** A delimiter at least `size` tall (em, already scaled), centred on the axis. */
export function delimiter(ch: string, size: number, c: Ctx): Box {
  if (!ch) return empty(0.12 * c.s);
  const a = axis(c);
  const centre = (b: Box, g: GlyphInfo, sy = 1): Box => {
    const dy = a - ((g.h - g.d) / 2) * c.s * sy;
    return { w: b.w, h: b.h + dy, d: b.d - dy, items: shift(b.items, 0, dy) };
  };
  if (ch === "|" || ch === "‖" || ch === "∣" || ch === "∥") {
    const textBar = charGlyph(c.fonts.regular, "|");
    const tall = Math.max(size, (textBar ? textBar.h + textBar.d : 1) * c.s);
    const t = c.st.rule * 1.1 * c.s;
    const side = 0.1 * c.s;
    const double = ch === "‖" || ch === "∥";
    const w = side * 2 + t * (double ? 3 : 1);
    const y = a - tall / 2;
    const items = [rule(side, y, t, tall)];
    if (double) items.push(rule(side + 2 * t, y, t, tall));
    return { w, h: y + tall, d: -y, items };
  }
  // Small: the text font's own glyph (matches the letters).
  const text = charGlyph(c.fonts.regular, ch);
  if (text && (text.h + text.d) * c.s >= size * 0.98) return glyphBox(text, c.s);
  const m = c.fonts.math;
  const base = charGlyph(m, ch);
  const name = base?.glyph.name;
  if (name) {
    for (let i = 1; i <= 12; i++) {
      const v = namedGlyph(m, `${name}.s${i}`);
      if (!v) break;
      if ((v.h + v.d) * c.s >= size) return centre(glyphBox(v, c.s), v);
    }
  }
  const parts = ASSEMBLY[ch];
  if (!parts) {
    const g = base ?? text;
    if (!g) return empty(0.2 * c.s);
    const sy = size / ((g.h + g.d) * c.s);
    return centre(glyphBox(g, c.s, undefined, sy), g, sy);
  }
  // Built from pieces: top, extender(s), [middle], bottom.
  const [topC, extC, botC, midC] = parts;
  const top = charGlyph(m, topC)!;
  const ext = charGlyph(m, extC)!;
  const bot = charGlyph(m, botC)!;
  const mid = midC ? charGlyph(m, midC) : null;
  const s = c.s;
  const ht = (g: GlyphInfo) => (g.h + g.d) * s;
  const fixed = ht(top) + ht(bot) + (mid ? ht(mid) : 0);
  const extTotal = Math.max(0, size - fixed);
  const nExt = mid ? 2 : 1;
  const extH = extTotal / nExt;
  const yTop = a + size / 2;
  const items: Item[] = [];
  let y = yTop;
  const put = (g: GlyphInfo, height: number, sy = 1) => {
    // Place so the piece's ink top is at y.
    items.push({ k: "g", g, x: 0, y: y - g.h * s * sy, s, sy: sy !== 1 ? sy : undefined });
    y -= height;
  };
  const overlap = 0.01 * s;
  put(top, ht(top) - overlap);
  const extSy = (extH + 2 * overlap) / ht(ext);
  if (extH > 0) put(ext, extH, extSy);
  if (mid) {
    put(mid, ht(mid) - overlap);
    if (extH > 0) put(ext, extH, extSy);
  }
  put(bot, ht(bot));
  const w = Math.max(top.w, ext.w, bot.w) * s;
  return { w, h: yTop, d: -(yTop - size), items };
}

function delimited(open: string, close: string, parts: Row[], separator: string | undefined, c: Ctx): Box {
  const inner = parts.map((p) => layoutRow(p, c));
  const a = axis(c);
  const h = Math.max(...inner.map((b) => b.h), 0.5 * c.s);
  const d = Math.max(...inner.map((b) => b.d), 0);
  const half = Math.max(h - a, d + a);
  const size = 2 * half + 2 * c.st.delimiterPad * c.s;
  const pieces: Box[] = [delimiter(open, size, c)];
  inner.forEach((b, i) => {
    if (i > 0 && separator) pieces.push(delimiter(separator, size, c));
    pieces.push(b);
  });
  pieces.push(delimiter(close, size, c));
  let x = 0;
  const pad = 0.04 * c.s;
  const placed = pieces.map((b, i) => {
    const p = { box: b, x, y: 0 };
    x += b.w + (i < pieces.length - 1 ? pad : 0);
    return p;
  });
  return combine(placed, x);
}

// ------------------------------------------------------------------ radicals, accents, stacks

function radical(bodyRow: Row, index: Row | undefined, c: Ctx): Box {
  const body = layoutRow(bodyRow, c);
  const m = c.fonts.math;
  const t = c.st.rule * c.s;
  const gap = c.st.radicalGap * c.s;
  const need = body.h + body.d + gap + t;
  let g = charGlyph(m, "√");
  if (!g) return body;
  let sy = 1;
  const variants = [g, ...[1, 2, 3].map((i) => namedGlyph(m, `uni221A.s${i}`)).filter((x): x is GlyphInfo => !!x)];
  const fit = variants.find((v) => (v.h + v.d) * c.s >= need);
  if (fit) g = fit;
  else {
    g = variants[variants.length - 1]!;
    sy = need / ((g.h + g.d) * c.s);
  }
  // Top of the sign = top of the bar.
  const top = body.h + gap + t;
  const y = top - g.h * c.s * sy;
  const signW = g.xMax * c.s;
  const items: Item[] = [{ k: "g", g, x: 0, y, s: c.s, sy: sy !== 1 ? sy : undefined }];
  const bodyX = signW + 0.03 * c.s;
  items.push(rule(signW - 0.01 * c.s, top - t, bodyX - signW + body.w + 0.06 * c.s, t));
  items.push(...shift(body.items, bodyX, 0));
  let box: Box = { w: bodyX + body.w + 0.08 * c.s, h: top, d: Math.max(body.d, -(y - g.d * c.s * sy)), items };
  if (index) {
    const ic = script(script(c));
    const ib = layoutRow(index, ic);
    const raise = y + (g.h * c.s * sy) * 0.55;
    const ix = Math.max(0, signW * 0.55 - ib.w);
    const shiftX = Math.max(0, ib.w - signW * 0.55);
    box = combine([{ box: { ...box }, x: shiftX, y: 0 }, { box: ib, x: ix, y: raise + ib.d }]);
  }
  return box;
}

/** Combining accents (math font): fallback when the text font has no spacing accent. */
const ACCENT_CHAR: Record<string, string> = {
  hat: "\u0302", widehat: "\u0302", check: "\u030C", tilde: "\u0303", widetilde: "\u0303", breve: "\u0306",
  dot: "\u0307", ddot: "\u0308", dddot: "\u20DB", ddddot: "\u20DC", acute: "\u0301", grave: "\u0300", mathring: "\u030A",
};

/** Spacing accents of the text font (Times), as MathType uses them; drawn in regular weight. */
const TEXT_ACCENT: Record<string, string> = {
  hat: "\u02C6", check: "\u02C7", tilde: "\u02DC", breve: "\u02D8", dot: "\u02D9", ddot: "\u00A8",
  acute: "\u00B4", grave: "`", mathring: "\u02DA",
};

/** Arrow-like accents drawn as paths: direction and barbs. */
const ARROWS: Record<string, { left: boolean; barbs: "up" | "both" | "down" }> = {
  overrightharpoon: { left: false, barbs: "up" },
  overleftharpoon: { left: true, barbs: "up" },
  vec: { left: false, barbs: "both" },
  overrightarrow: { left: false, barbs: "both" },
  overleftarrow: { left: true, barbs: "both" },
};

/**
 * Where an accent goes over its base: centred on the visible ink (not the advance box), shifted
 * right on slanted letters by the slant at the ink top, and at least `minGap` above the ink.
 */
function attach(body: Box): { cx: number; top: number; inkW: number; single: boolean } {
  const ink = inkOf(body);
  const single = !!body.char;
  const mid = (ink.x0 + ink.x1) / 2;
  // An italic letter's bounding box centre is at mid-height; its top is further right.
  const cx = single ? mid + (ink.slope * ink.top) / 2 : mid;
  return { cx, top: ink.top, inkW: ink.x1 - ink.x0, single };
}

function accent(kind: string, bodyRow: Row, c: Ctx): Box {
  const body = layoutRow(bodyRow, c);
  const t = c.st.rule * c.s;
  const rules = c.st.accents;
  if (kind === "underline") {
    const y = -body.d - c.st.accentGap * c.s * 2 - t;
    return { ...body, d: -y, items: [...body.items, rule(0, y, body.w, t)] };
  }
  const at = attach(body);
  if (kind === "overline" || (kind === "bar" && !at.single)) {
    const ink = inkOf(body);
    const y = at.top + Math.max(rules.minGap, c.st.accentGap * 2) * c.s;
    return { ...body, h: Math.max(body.h, y + t), items: [...body.items, rule(ink.x0, y, ink.x1 - ink.x0, t)], scriptH: body.scriptH ?? body.h };
  }
  const arrow = ARROWS[kind];
  if (arrow) return arrowAccent(body, at, arrow, c);
  if (kind === "bar") {
    // A bar over a single letter: about the letter's width, centred on its ink.
    const w = Math.max(at.inkW * 0.9, 0.3 * c.s);
    const y = at.top + Math.max(rules.minGap, 0.08) * c.s;
    return { ...body, h: Math.max(body.h, y + t), items: [...body.items, rule(at.cx - w / 2, y, w, t)], scriptH: body.scriptH ?? body.h };
  }
  const wide = kind === "widehat" || kind === "widetilde";
  const text = !wide || at.single ? TEXT_ACCENT[kind] : undefined;
  const g = (text && charGlyph(c.fonts.regular, text)) || (ACCENT_CHAR[kind] ? charGlyph(c.fonts.math, ACCENT_CHAR[kind]!) : null);
  if (kind === "dddot" || kind === "ddddot") {
    const dot = charGlyph(c.fonts.regular, "\u02D9");
    if (dot) return dots(body, at, dot, kind === "dddot" ? 3 : 4, c);
  }
  if (!g) return body;
  let sx = 1;
  if (wide && !at.single) sx = Math.max(1, at.inkW / ((g.xMax - g.xMin) * c.s));
  return placeAccent(body, g, at, c, sx);
}

/** Puts an accent glyph's ink centred at `at.cx`, its ink bottom a gap above the base's ink. */
function placeAccent(body: Box, g: GlyphInfo, at: { cx: number; top: number }, c: Ctx, sx = 1): Box {
  const s = c.s;
  const inkW = (g.xMax - g.xMin) * s * sx;
  const x = at.cx - inkW / 2 - g.xMin * s * sx;
  const gap = Math.max(c.st.accents.minGap, c.st.accentGap) * s;
  // Glyph ink bottom (−d below its baseline) sits `gap` above the base's ink top.
  const y = at.top + gap + g.d * s;
  const item: Item = { k: "g", g, x, y, s, sx: sx !== 1 ? sx : undefined };
  return { ...body, h: Math.max(body.h, y + g.h * s), items: [...body.items, item], scriptH: body.scriptH ?? body.h };
}

/** Three or four dots (\dddot, \ddddot) from the text font's dot accent. */
function dots(body: Box, at: { cx: number; top: number }, dot: GlyphInfo, n: number, c: Ctx): Box {
  const s = c.s;
  const w = (dot.xMax - dot.xMin) * s;
  const step = w * 1.45;
  const total = step * (n - 1) + w;
  const gap = Math.max(c.st.accents.minGap, c.st.accentGap) * s;
  const y = at.top + gap + dot.d * s;
  const items: Item[] = [...body.items];
  for (let i = 0; i < n; i++) items.push({ k: "g", g: dot, x: at.cx - total / 2 + i * step - dot.xMin * s, y, s });
  return { ...body, h: Math.max(body.h, y + dot.h * s), items, scriptH: body.scriptH ?? body.h };
}

/**
 * Harpoons and arrows as paths (every dimension controlled): MathType's proportions × the style's
 * size and stroke; over one letter a fixed length centred on its ink, over several the ink width.
 */
function arrowAccent(body: Box, at: { cx: number; top: number; inkW: number; single: boolean }, a: { left: boolean; barbs: "up" | "both" | "down" }, c: Ctx): Box {
  const s = c.s;
  const r = c.st.accents;
  const harpoon = a.barbs !== "both";
  const t = 0.029 * r.stroke * s;
  const barb = (harpoon ? 0.08 : 0.0975) * r.size * s;
  const angle = ((harpoon ? r.barbAngle : r.barbAngle - 6) * Math.PI) / 180;
  const adaptive = r.length === "adaptive";
  // Adaptive: ink width + 0.05 em each side, at least 2.6 barb lengths (the barb stays readable).
  const len = at.single
    ? adaptive
      ? Math.max(at.inkW + 0.1 * s, barb * 2.6)
      : Math.max(0.41 * r.size * s, at.inkW)
    : Math.max(at.inkW, adaptive ? barb * 2.6 : 0.41 * r.size * s);
  const gap = Math.max(r.minGap, harpoon ? r.gap : r.gap + 0.03) * s;
  const x0 = at.cx - len / 2;
  const x1 = at.cx + len / 2;
  const raw = arrowOutline(x0, x1, 0, t, barb, angle, a.barbs);
  // The lowest ink (the shaft, or a lower barb) sits `gap` above the base's ink.
  const dy = at.top + gap - Math.min(...raw.map((p) => p[1]));
  const pts = raw.map(([x, y]) => [x, y + dy] as [number, number]);
  const out = a.left ? pts.map(([x, y]) => [x0 + x1 - x, y] as [number, number]).reverse() : pts;
  const top = Math.max(...out.map((p) => p[1]));
  return { ...body, h: Math.max(body.h, top), items: [...body.items, { k: "p", x: 0, y: 0, pts: out }], scriptH: body.scriptH ?? body.h };
}

/**
 * Outline of a right-pointing arrow (counter-clockwise, y up): shaft [yb, yb + t] from x0 to the
 * tip at x1, barbs of length `barb` (along the shaft) at `angle`, as thick as the shaft.
 */
export function arrowOutline(x0: number, x1: number, yb: number, t: number, barb: number, angle: number, barbs: "up" | "both" | "down"): [number, number][] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const L = barb / cos;
  /** Upper barb: outer edge from the tip corner (x1, yTip) up-left; inner edge back to the shaft top. */
  const upper = (yTip: number, yShaftTop: number): [number, number][] => {
    const ex = x1 - L * cos;
    const ey = yTip + L * sin;
    // Inner edge: the outer edge moved by t towards the shaft (normal pointing down-left).
    const fx = ex - t * sin;
    const fy = ey - t * cos;
    const k = Math.max(0, (fy - yShaftTop) / sin);
    const gx = Math.min(x1 - t * 0.5, fx + k * cos);
    return [[x1, yTip], [ex, ey], [fx, fy], [gx, yShaftTop]];
  };
  if (barbs === "up") {
    const u = upper(yb + t, yb + t);
    // Tip: the shaft's top-right corner carries the barb; bottom-right is the point.
    return [[x0, yb], [x1, yb], ...u, [x0, yb + t]];
  }
  // Both barbs: symmetric about the shaft centre line.
  const ym = yb + t / 2;
  const u = upper(ym, yb + t);
  const lower = u.map(([x, y]) => [x, 2 * ym - y] as [number, number]).reverse();
  return [[x0, yb], ...lower, ...u, [x0, yb + t]];
}

function stack(body: Box, annotation: Row | undefined, position: "over" | "under", brace: boolean, c: Ctx): Box {
  const s = c.s;
  const gap = c.st.limitGap * s;
  const ann = annotation ? layoutRow(annotation, script(c)) : null;
  const parts = [{ box: body, x: 0, y: 0 }];
  let w = Math.max(body.w, ann?.w ?? 0);
  const bx = (w - body.w) / 2;
  parts[0]!.x = bx;
  let yEdge = position === "over" ? body.h + gap : -(body.d + gap);
  if (brace) {
    const g = charGlyph(c.fonts.math, position === "over" ? "⏞" : "⏟");
    if (g) {
      const sx = body.w / ((g.xMax - g.xMin) * s);
      const bb: Box = { w: body.w, h: g.h * s, d: g.d * s, items: [{ k: "g", g, x: -g.xMin * s * sx, y: 0, s, sx }] };
      const y = position === "over" ? yEdge + bb.d : yEdge - bb.h;
      parts.push({ box: bb, x: bx, y });
      yEdge = position === "over" ? y + bb.h + gap : y - bb.d - gap;
    }
  }
  if (ann) parts.push({ box: ann, x: (w - ann.w) / 2, y: position === "over" ? yEdge + ann.d : yEdge - ann.h });
  w = Math.max(w, body.w);
  return combine(parts, w);
}

function boxed(body: Box, c: Ctx): Box {
  const p = 0.15 * c.s;
  const t = c.st.rule * c.s;
  const w = body.w + 2 * p + 2 * t;
  const top = body.h + p + t;
  const bottom = -(body.d + p + t);
  const items = [...shift(body.items, p + t, 0), rule(0, bottom, w, t), rule(0, top - t, w, t), rule(0, bottom, t, top - bottom), rule(w - t, bottom, t, top - bottom)];
  return { w, h: top, d: -bottom, items };
}

// ------------------------------------------------------------------ arrays

interface Grid {
  box: Box;
}

/**
 * Lays out rows of cells. align[j]: "c" | "l" | "r" per column; gaps[j]: space after column j.
 * The grid is centred on the math axis.
 */
function grid(rows: Row[][], c: Ctx, align: (j: number) => "c" | "l" | "r", gapAfter: (j: number) => number, leadingOrd?: (j: number) => boolean): Grid {
  const cells = rows.map((r) => r.map((cell, j) => layoutRow(cell, c, { leadingOrd: leadingOrd?.(j) })));
  const nCols = Math.max(1, ...cells.map((r) => r.length));
  const colW = Array.from({ length: nCols }, (_, j) => Math.max(0, ...cells.map((r) => r[j]?.w ?? 0)));
  const rowH = cells.map((r) => Math.max(0.6 * c.s, ...r.map((b) => b.h)));
  const rowD = cells.map((r) => Math.max(0.2 * c.s, ...r.map((b) => b.d)));
  const baselines: number[] = [];
  let y = 0;
  cells.forEach((_, i) => {
    if (i > 0) y -= Math.max(c.st.minBaselineSkip * c.s, rowD[i - 1]! + c.st.rowGap * c.s + rowH[i]!);
    baselines.push(y);
  });
  const xs: number[] = [];
  let x = 0;
  for (let j = 0; j < nCols; j++) {
    xs.push(x);
    x += colW[j]! + (j < nCols - 1 ? gapAfter(j) : 0);
  }
  const parts: { box: Box; x: number; y: number }[] = [];
  cells.forEach((r, i) =>
    r.forEach((b, j) => {
      const al = align(j);
      const dx = al === "c" ? (colW[j]! - b.w) / 2 : al === "r" ? colW[j]! - b.w : 0;
      parts.push({ box: b, x: xs[j]! + dx, y: baselines[i]! });
    }),
  );
  const top = rowH[0]!;
  const bottom = baselines[baselines.length - 1]! - rowD[rowD.length - 1]!;
  const centre = (top + bottom) / 2;
  const dy = axis(c) - centre;
  const box = combine(parts.map((p) => ({ ...p, y: p.y + dy })), x);
  box.h = top + dy;
  box.d = -(bottom + dy);
  return { box };
}

const MATRIX_DELIMS: Record<string, [string, string]> = {
  matrix: ["", ""],
  pmatrix: ["(", ")"],
  bmatrix: ["[", "]"],
  Bmatrix: ["{", "}"],
  vmatrix: ["|", "|"],
  Vmatrix: ["‖", "‖"],
  smallmatrix: ["", ""],
};

function matrix(kind: string, rows: Row[][], c0: Ctx): Box {
  const c = kind === "smallmatrix" ? script(c0) : c0;
  const g = grid(rows, c, () => "c", () => c.st.colGap * c.s).box;
  const [open, close] = MATRIX_DELIMS[kind] ?? ["", ""];
  if (!open && !close) return g;
  return wrapDelims(g, open, close, c0);
}

function wrapDelims(inner: Box, open: string, close: string, c: Ctx): Box {
  const a = axis(c);
  const half = Math.max(inner.h - a, inner.d + a);
  const size = 2 * half + 2 * c.st.delimiterPad * c.s;
  const l = delimiter(open, size, c);
  const r = delimiter(close, size, c);
  const pad = 0.12 * c.s;
  return combine([
    { box: l, x: 0, y: 0 },
    { box: inner, x: l.w + pad, y: 0 },
    { box: r, x: l.w + pad + inner.w + pad, y: 0 },
  ]);
}

function cases(rows: Row[][], c: Ctx): Box {
  const g = grid(rows, c, () => "l", () => 1 * c.s).box;
  const a = axis(c);
  const half = Math.max(g.h - a, g.d + a);
  const l = delimiter("{", 2 * half + 2 * c.st.delimiterPad * c.s, c);
  return combine([
    { box: l, x: 0, y: 0 },
    { box: g, x: l.w + 0.15 * c.s, y: 0 },
  ]);
}

function aligned(rows: Row[][], c: Ctx): Box {
  return grid(
    rows,
    c,
    (j) => (j % 2 === 0 ? "r" : "l"),
    (j) => (j % 2 === 0 ? 0 : 1.5 * c.s),
    (j) => j % 2 === 1,
  ).box;
}

// ------------------------------------------------------------------ entry

export interface LayoutOptions {
  fonts: FontSet;
  style: RenderStyle;
  display: boolean;
  /** Notation profile for kind objects; default: Hughes. */
  notation?: NotationProfile;
  /** Collects the fonts the drawing used. */
  used?: Set<GlyphSource>;
}

export function layout(root: Row, o: LayoutOptions): Box {
  root = expandNotation(root, o.notation);
  return layoutRow(root, { fonts: o.fonts, st: o.style, s: 1, display: o.display, level: 0, used: o.used });
}

// Re-exported for tests.
export { glyphName };
