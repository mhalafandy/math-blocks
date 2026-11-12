import type { Font } from "opentype.js";
import type { FontSet, GlyphInfo } from "./fonts";
import { charGlyph, symbolGlyph } from "./fonts";
import { thinOutline } from "./svg";

/**
 * Bold Greek in Classic. Greek comes from the Symbol font, which has no bold face (MathType has
 * Windows embolden it). MathBlocks emboldens the outlines itself: every point moves outward by an
 * offset calibrated on this PC's fonts so that bold Greek is as much darker than regular Greek as
 * Times New Roman Bold is darker than Times New Roman (Bold Italic than Italic for italic).
 *
 * Darkness = ink area per advance width, over a set of lowercase letters. Real bold thickens stems far
 * more than hairlines, while an outward offset thickens every stroke the same: matching the heaviest
 * stem (Times Bold "I", as first done) made bold Greek clearly heavier than bold Latin. The offset is
 * found by a few secant steps on the real emboldened outlines. The advance grows by twice the offset,
 * so bold letters keep their spacing.
 */

/** Outline commands as opentype.js gives them (y down). */
export interface OutlineCmd {
  type: string;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

/** The outline as polygons (curves flattened). */
function polygons(cmds: OutlineCmd[]): [number, number][][] {
  const out: [number, number][][] = [];
  let cur: [number, number][] = [];
  let px = 0;
  let py = 0;
  for (const c of cmds) {
    if (c.type === "M") {
      if (cur.length) out.push(cur);
      cur = [[c.x!, c.y!]];
    } else if (c.type === "L") cur.push([c.x!, c.y!]);
    else if (c.type === "Q") {
      for (let t = 1; t <= 8; t++) {
        const u = t / 8;
        const a = (1 - u) * (1 - u);
        const b = 2 * (1 - u) * u;
        const d = u * u;
        cur.push([a * px + b * c.x1! + d * c.x!, a * py + b * c.y1! + d * c.y!]);
      }
    } else if (c.type === "C") {
      for (let t = 1; t <= 10; t++) {
        const u = t / 10;
        const a = (1 - u) ** 3;
        const b = 3 * (1 - u) ** 2 * u;
        const e = 3 * (1 - u) * u * u;
        const d = u ** 3;
        cur.push([a * px + b * c.x1! + e * c.x2! + d * c.x!, a * py + b * c.y1! + e * c.y2! + d * c.y!]);
      }
    } else if (c.type === "Z") {
      if (cur.length) out.push(cur);
      cur = [];
    }
    if (c.x !== undefined) {
      px = c.x;
      py = c.y!;
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

/** The narrowest run of ink crossed by a horizontal line at height y (outline units, y down). */
export function stemAt(cmds: OutlineCmd[], y: number): number | null {
  const xs: number[] = [];
  for (const poly of polygons(cmds)) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i]!;
      const [x2, y2] = poly[(i + 1) % poly.length]!;
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
  }
  xs.sort((a, b) => a - b);
  let best: number | null = null;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const w = xs[i + 1]! - xs[i]!;
    if (w > 1e-4 && (best === null || w < best)) best = w;
  }
  return best;
}

/** Stem width of a glyph at half its height, in em (null when it cannot be measured). */
export function glyphStem(cmds: OutlineCmd[], heightEm: number): number | null {
  return stemAt(cmds, -heightEm / 2);
}

/** Ink area of an outline (em²), holes subtracted. */
export function inkArea(cmds: OutlineCmd[]): number {
  return Math.abs(
    polygons(cmds).reduce((a, p) => a + p.reduce((s, [x, y], i) => {
      const [x2, y2] = p[(i + 1) % p.length]!;
      return s + x * y2 - x2 * y;
    }, 0) / 2, 0),
  );
}

const LATIN_SET = [..."acenorsuvxz"];
/** Lowercase Greek of similar shapes (round, open, with stems). */
const GREEK_SET = [..."αεηοσυνχκπ"];

const outline = (g: GlyphInfo, d = 0): OutlineCmd[] => {
  const cmds = g.glyph.getPath(0, 0, 1).commands as OutlineCmd[];
  return d ? (thinOutline(cmds as never, -d) as OutlineCmd[]) : cmds;
};

/** Darkness of a set of glyphs emboldened by d: ink area per advance width. */
function darkness(glyphs: GlyphInfo[], d = 0): number {
  let a = 0;
  let w = 0;
  for (const g of glyphs) {
    a += inkArea(outline(g, d));
    w += g.w + 2 * d;
  }
  return w > 0 ? a / w : 0;
}

/** How much darker a bold face is than its regular one over the Latin set (1.4 = 40 % darker). */
export function boldDarkness(regular: Font, bold: Font): number | null {
  const r = LATIN_SET.map((c) => charGlyph(regular, c)).filter((g): g is GlyphInfo => !!g);
  const b = LATIN_SET.map((c) => charGlyph(bold, c)).filter((g): g is GlyphInfo => !!g);
  if (r.length < 6 || b.length !== r.length) return null;
  return darkness(b) / darkness(r);
}

/** The outward offset that makes these glyphs `ratio` times darker (secant steps on real outlines). */
export function offsetForDarkness(glyphs: GlyphInfo[], ratio: number): number {
  const base = darkness(glyphs);
  if (!base) return DEFAULT_OFFSET;
  const f = (d: number) => darkness(glyphs, d) / base - ratio;
  let d0 = 0.008;
  let d1 = 0.02;
  let f0 = f(d0);
  let f1 = f(d1);
  for (let i = 0; i < 6 && Math.abs(f1) > 0.002 && f1 !== f0; i++) {
    const d2 = Math.min(0.06, Math.max(0.001, d1 - (f1 * (d1 - d0)) / (f1 - f0)));
    d0 = d1;
    f0 = f1;
    d1 = d2;
    f1 = f(d1);
  }
  return d1;
}

export interface BoldGreek {
  /** Outward offset (em) for bold upright and bold italic Greek from Symbol. */
  upright: number;
  italic: number;
  /** The stems measured (em), for the comparison sheet and the self-test. */
  stems: { symbol: number; timesRegular: number; timesBold: number; timesBoldItalic: number };
  /** How much darker bold is than regular: Times (target) and emboldened Symbol Greek (result), upright and italic. */
  darkness: { latin: number; latinItalic: number; greek: number; greekItalic: number };
  /** False: fonts not measurable here, the default offsets are used. */
  measured: boolean;
}

const cache = new WeakMap<FontSet, BoldGreek>();
/** Used when the fonts cannot be measured: the darkness match on Times-metric fonts gives about 0.014 em. */
const DEFAULT_OFFSET = 0.014;

/** The emboldening offsets for this font set (measured once). */
export function boldGreek(fonts: FontSet): BoldGreek {
  const hit = cache.get(fonts);
  if (hit) return hit;
  const stem = (g: ReturnType<typeof charGlyph>) => (g ? glyphStem(g.glyph.getPath(0, 0, 1).commands as OutlineCmd[], g.h) : null);
  const sym = fonts.symbol ? stem(symbolGlyph(fonts.symbol, "Ι")) : null;
  const reg = stem(charGlyph(fonts.regular, "I"));
  const bold = stem(charGlyph(fonts.bold, "I"));
  const bi = stem(charGlyph(fonts.boldItalic, "I"));
  const clamp = (x: number) => Math.min(0.04, Math.max(0.004, x));
  const greek = fonts.symbol ? GREEK_SET.map((c) => symbolGlyph(fonts.symbol!, c)).filter((g): g is GlyphInfo => !!g) : [];
  const kUp = boldDarkness(fonts.regular, fonts.bold);
  const kIt = boldDarkness(fonts.italic, fonts.boldItalic);
  const measured = greek.length >= 6 && kUp !== null && kIt !== null && fonts.bold !== fonts.regular;
  const upright = measured ? clamp(offsetForDarkness(greek, kUp!)) : DEFAULT_OFFSET;
  const italic = measured ? clamp(offsetForDarkness(greek, kIt!)) : DEFAULT_OFFSET;
  const g0 = measured ? darkness(greek) : 0;
  const r: BoldGreek = {
    upright,
    italic,
    stems: { symbol: sym ?? 0, timesRegular: reg ?? 0, timesBold: bold ?? 0, timesBoldItalic: bi ?? 0 },
    darkness: { latin: kUp ?? 0, latinItalic: kIt ?? 0, greek: g0 ? darkness(greek, upright) / g0 : 0, greekItalic: g0 ? darkness(greek, italic) / g0 : 0 },
    measured,
  };
  cache.set(fonts, r);
  return r;
}
