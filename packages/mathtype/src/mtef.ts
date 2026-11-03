/**
 * MTEF v5 reader (MathType 4–7 equation data), producing a record tree.
 * Format reference: Design Science / WIRIS "MathType Equation Format (MTEF) version 5".
 */

export class MtefError extends Error {}

export type MtNode =
  | { t: "line"; isNull: boolean; items: MtNode[] }
  | { t: "char"; typeface: number; code: number | null; embells: number[]; funcStart: boolean }
  | { t: "tmpl"; selector: number; variation: number; options: number; items: MtNode[] }
  | { t: "pile"; halign: number; valign: number; lines: MtNode[] }
  | { t: "matrix"; valign: number; hjust: number; vjust: number; rows: number; cols: number; cells: MtNode[] };

export interface MtefEquation {
  version: number;
  product: string;
  /** Top-level object list (usually one LINE or PILE). */
  items: MtNode[];
  /** TeX translation MathType stores alongside (lossy; used only as a fallback). */
  tex: string | null;
  /** MathType's equation preferences (sizes, spacing, character styles), when present. */
  prefs: MtPrefs | null;
}

/** A dimension from MathType's preferences: value and unit. */
export interface MtDim {
  value: number;
  unit: "in" | "cm" | "pt" | "pc" | "%";
}

export interface MtStyle {
  font: string | null;
  italic: boolean;
  bold: boolean;
}

export interface MtPrefs {
  /** Full, subscript, sub-subscript, symbol, sub-symbol, user 1, user 2… */
  sizes: MtDim[];
  /** MathType's "Define Spacing" values, in order. */
  spacing: MtDim[];
  /** Text, function, variable, LC Greek, UC Greek, symbol, vector, number… (typeface 1, 2, …). */
  styles: MtStyle[];
}

// Record tags
const END = 0, LINE = 1, CHAR = 2, TMPL = 3, PILE = 4, MATRIX = 5, EMBELL = 6, RULER = 7, FONT_STYLE_DEF = 8, SIZE = 9;
const FULL = 10, SUB = 11, SUB2 = 12, SYM = 13, SUBSYM = 14, COLOR = 15, COLOR_DEF = 16, FONT_DEF = 17, EQN_PREFS = 18, ENCODING_DEF = 19;

// Option flags
const OPT_NUDGE = 0x08;
const OPT_CHAR_EMBELL = 0x01, OPT_CHAR_FUNC_START = 0x02, OPT_CHAR_ENC_CHAR_8 = 0x04, OPT_CHAR_ENC_CHAR_16 = 0x10, OPT_CHAR_ENC_NO_MTCODE = 0x20;
const OPT_LINE_NULL = 0x01, OPT_LP_RULER = 0x02, OPT_LINE_LSPACE = 0x04;
const OPT_COLOR_CMYK = 0x01, OPT_COLOR_NAME = 0x04;

class Reader {
  pos = 0;
  constructor(private readonly b: Uint8Array) {}
  get done() {
    return this.pos >= this.b.length;
  }
  u8() {
    if (this.pos >= this.b.length) throw new MtefError("Unexpected end of MTEF data");
    return this.b[this.pos++]!;
  }
  u16() {
    return this.u8() | (this.u8() << 8);
  }
  /** MTEF5 variable-length unsigned: one byte < 255, else 0xFF then 16 bits. */
  uint() {
    const v = this.u8();
    return v === 255 ? this.u16() : v;
  }
  cstr() {
    let s = "";
    for (let c = this.u8(); c !== 0; c = this.u8()) s += String.fromCharCode(c);
    return s;
  }
  skip(n: number) {
    this.pos += n;
  }
  /** Nibble-encoded dimension arrays: unit nibble, digits (0xA point, 0xB minus), 0xF end. */
  nibbleValues(count: number): MtDim[] {
    let high = true;
    let byte = 0;
    const nibble = () => {
      if (high) {
        byte = this.u8();
        high = false;
        return byte >> 4;
      }
      high = true;
      return byte & 0x0f;
    };
    const units: MtDim["unit"][] = ["in", "cm", "pt", "pc", "%"];
    const out: MtDim[] = [];
    for (let i = 0; i < count; i++) {
      const unit = units[nibble()] ?? "%";
      let txt = "";
      for (let n = nibble(); n !== 0x0f; n = nibble()) txt += n === 0x0a ? "." : n === 0x0b ? "-" : String(n);
      out.push({ value: Number(txt) || 0, unit });
    }
    return out;
  }
  skipNibbleValues(count: number) {
    let high = true;
    let byte = 0;
    const nibble = () => {
      if (high) {
        byte = this.u8();
        high = false;
        return byte >> 4;
      }
      high = true;
      return byte & 0x0f;
    };
    for (let i = 0; i < count; i++) while (nibble() !== 0x0f);
  }
}

export function readMtef(data: Uint8Array): MtefEquation {
  const r = new Reader(data);
  const version = r.u8();
  if (version !== 5) throw new MtefError(`Unsupported MTEF version ${version} (MathType 4 or newer is needed)`);
  r.u8(); // platform
  r.u8(); // product
  const pv = r.u8();
  const ps = r.u8();
  const app = r.cstr();
  r.u8(); // equation options
  let tex: string | null = null;
  const ctx: ReadCtx = { fonts: [], prefs: null };
  const items = list(r, (label, value) => {
    if (label === "TeX Input Language") tex = value;
  }, ctx);
  return { version, product: `${app} ${pv}.${ps}`, items, tex, prefs: resolvePrefs(ctx) };
}

function nudge(r: Reader, opts: number) {
  if (opts & OPT_NUDGE) {
    const dx = r.u8();
    const dy = r.u8();
    if (dx === 128 && dy === 128) r.skip(4);
  }
}

/** Reads records until END (or end of data), returning content nodes and skipping formatting. */
interface ReadCtx {
  fonts: string[];
  prefs: { sizes: MtDim[]; spacing: MtDim[]; styles: { fontIndex: number; flags: number }[] } | null;
}

function resolvePrefs(ctx: ReadCtx): MtPrefs | null {
  if (!ctx.prefs) return null;
  return {
    sizes: ctx.prefs.sizes,
    spacing: ctx.prefs.spacing,
    styles: ctx.prefs.styles.map((s) => ({ font: s.fontIndex > 0 ? (ctx.fonts[s.fontIndex - 1] ?? null) : null, italic: !!(s.flags & 1), bold: !!(s.flags & 2) })),
  };
}

function list(r: Reader, onFuture?: (label: string, value: string) => void, ctx?: ReadCtx): MtNode[] {
  const out: MtNode[] = [];
  while (!r.done) {
    const tag = r.u8();
    if (tag === END) break;
    const node = record(r, tag, onFuture, ctx);
    if (node) out.push(node);
  }
  return out;
}

function record(r: Reader, tag: number, onFuture?: (label: string, value: string) => void, ctx?: ReadCtx): MtNode | null {
  switch (tag) {
    case LINE: {
      const o = r.u8();
      nudge(r, o);
      if (o & OPT_LINE_LSPACE) r.u16();
      if (o & OPT_LP_RULER) ruler(r);
      return { t: "line", isNull: !!(o & OPT_LINE_NULL), items: o & OPT_LINE_NULL ? [] : list(r) };
    }
    case CHAR: {
      const o = r.u8();
      nudge(r, o);
      const typeface = r.u8() - 128;
      let code: number | null = null;
      if (!(o & OPT_CHAR_ENC_NO_MTCODE)) code = r.u16();
      if (o & OPT_CHAR_ENC_CHAR_8) r.u8();
      if (o & OPT_CHAR_ENC_CHAR_16) r.u16();
      const embells: number[] = [];
      if (o & OPT_CHAR_EMBELL) {
        while (!r.done) {
          const t = r.u8();
          if (t === END) break;
          if (t !== EMBELL) {
            record(r, t);
            continue;
          }
          const eo = r.u8();
          nudge(r, eo);
          embells.push(r.u8());
        }
      }
      return { t: "char", typeface, code, embells, funcStart: !!(o & OPT_CHAR_FUNC_START) };
    }
    case TMPL: {
      const o = r.u8();
      nudge(r, o);
      const selector = r.u8();
      let variation = r.u8();
      if (variation & 0x80) variation = (variation & 0x7f) | (r.u8() << 7);
      const options = r.u8();
      return { t: "tmpl", selector, variation, options, items: list(r) };
    }
    case PILE: {
      const o = r.u8();
      nudge(r, o);
      const halign = r.u8();
      const valign = r.u8();
      if (o & OPT_LP_RULER) ruler(r);
      return { t: "pile", halign, valign, lines: list(r) };
    }
    case MATRIX: {
      const o = r.u8();
      nudge(r, o);
      const valign = r.u8();
      const hjust = r.u8();
      const vjust = r.u8();
      const rows = r.u8();
      const cols = r.u8();
      r.skip(Math.ceil(((rows + 1) * 2) / 8));
      r.skip(Math.ceil(((cols + 1) * 2) / 8));
      return { t: "matrix", valign, hjust, vjust, rows, cols, cells: list(r) };
    }
    case EMBELL: {
      const o = r.u8();
      nudge(r, o);
      r.u8();
      return null;
    }
    case RULER:
      ruler(r);
      return null;
    case FONT_STYLE_DEF:
      r.u8();
      r.u8();
      return null;
    case SIZE: {
      const lsize = r.u8();
      if (lsize === 101) r.u16();
      else if (lsize === 100) {
        r.u8();
        r.u16();
      } else r.u8();
      return null;
    }
    case FULL:
    case SUB:
    case SUB2:
    case SYM:
    case SUBSYM:
      return null;
    case COLOR:
      r.u8();
      return null;
    case COLOR_DEF: {
      const o = r.u8();
      r.skip(o & OPT_COLOR_CMYK ? 8 : 6);
      if (o & OPT_COLOR_NAME) r.cstr();
      return null;
    }
    case FONT_DEF: {
      r.u8(); // encoding definition index
      const name = r.cstr();
      ctx?.fonts.push(name);
      return null;
    }
    case EQN_PREFS: {
      r.u8(); // options
      const sizes = r.nibbleValues(r.uint());
      const spacing = r.nibbleValues(r.uint());
      const n = r.uint();
      const styles: { fontIndex: number; flags: number }[] = [];
      for (let i = 0; i < n; i++) {
        const fontIndex = r.u8();
        styles.push({ fontIndex, flags: fontIndex !== 0 ? r.u8() : 0 });
      }
      if (ctx) ctx.prefs = { sizes, spacing, styles };
      return null;
    }
    case ENCODING_DEF:
      r.cstr();
      return null;
    default: {
      if (tag < 100) throw new MtefError(`Unknown MTEF record ${tag} at byte ${r.pos - 1}`);
      // Future records: length-prefixed, skipped. MathType 7 stores "label\0value\0" annotations here.
      const len = r.uint();
      const start = r.pos;
      if (onFuture) {
        const bytes: number[] = [];
        for (let i = 0; i < len; i++) bytes.push(r.u8());
        const parts = String.fromCharCode(...bytes).split("\0");
        if (parts.length >= 2) onFuture(parts[0]!, parts[1]!);
      }
      r.pos = start + len;
      return null;
    }
  }
}

function ruler(r: Reader) {
  const n = r.u8();
  for (let i = 0; i < n; i++) {
    r.u8();
    r.u16();
  }
}
