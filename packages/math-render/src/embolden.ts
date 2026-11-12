import type { FontSet } from "./fonts";
import { charGlyph, symbolGlyph } from "./fonts";

/**
 * Bold Greek in Classic. Greek comes from the Symbol font, which has no bold face (MathType has
 * Windows embolden it). MathBlocks emboldens the outlines itself: every point moves outward by an
 * offset calibrated on this PC's fonts, so the stroke of a bold Greek letter matches Times New Roman
 * Bold (upright) and Bold Italic (italic):
 *
 *   offset = (stem of Times Bold "I" − stem of Symbol's capital Iota) / 2
 *
 * measured as the width of the vertical stem halfway up the letter. The advance grows by twice the
 * offset, so bold letters keep their spacing.
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

export interface BoldGreek {
  /** Outward offset (em) for bold upright and bold italic Greek from Symbol. */
  upright: number;
  italic: number;
  /** The stems measured (em), for the comparison sheet and the self-test. */
  stems: { symbol: number; timesRegular: number; timesBold: number; timesBoldItalic: number };
  /** False: fonts not measurable here, the default offsets are used. */
  measured: boolean;
}

const cache = new WeakMap<FontSet, BoldGreek>();
/** Used when the fonts cannot be measured: Times Bold is about 0.05 em heavier than Times Regular. */
const DEFAULT_OFFSET = 0.025;

/** The emboldening offsets for this font set (measured once). */
export function boldGreek(fonts: FontSet): BoldGreek {
  const hit = cache.get(fonts);
  if (hit) return hit;
  const stem = (g: ReturnType<typeof charGlyph>) => (g ? glyphStem(g.glyph.getPath(0, 0, 1).commands as OutlineCmd[], g.h) : null);
  const sym = fonts.symbol ? stem(symbolGlyph(fonts.symbol, "Ι")) : null;
  const reg = stem(charGlyph(fonts.regular, "I"));
  const bold = stem(charGlyph(fonts.bold, "I"));
  const bi = stem(charGlyph(fonts.boldItalic, "I"));
  const clamp = (x: number) => Math.min(0.05, Math.max(0.005, x));
  const measured = sym !== null && bold !== null && bi !== null;
  const r: BoldGreek = {
    upright: measured ? clamp((bold! - sym!) / 2) : DEFAULT_OFFSET,
    italic: measured ? clamp((bi! - sym!) / 2) : DEFAULT_OFFSET,
    stems: { symbol: sym ?? 0, timesRegular: reg ?? 0, timesBold: bold ?? 0, timesBoldItalic: bi ?? 0 },
    measured,
  };
  cache.set(fonts, r);
  return r;
}
