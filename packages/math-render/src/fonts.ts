import * as opentype from "opentype.js";
import type { Font, Glyph } from "opentype.js";

// The ESM build exports parse by name; Node loading the UMD build exposes it on the default.
const parse: typeof opentype.parse = (opentype as unknown as { parse?: typeof opentype.parse }).parse ?? (opentype as unknown as { default: { parse: typeof opentype.parse } }).default.parse;

/**
 * The fonts an equation is typeset with. "Text" faces carry letters, digits and ordinary
 * operators (Times New Roman for the Classic style, like MathType); the math font carries what
 * text fonts lack: large operators, stretchy delimiters and radicals in several sizes, accents,
 * arrows and math alphabets (STIX Two Math, which is designed to match Times).
 */
export interface FontSet {
  regular: Font;
  italic: Font;
  bold: Font;
  boldItalic: Font;
  math: Font;
}

export type Face = keyof FontSet;

export const loadFont = (bytes: ArrayBuffer | Uint8Array): Font =>
  parse(bytes instanceof Uint8Array ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer) : bytes);

/** A glyph with its metrics in em (1 = font size), y up. */
export interface GlyphInfo {
  font: Font;
  glyph: Glyph;
  /** Advance width. */
  w: number;
  /** Ink extents. */
  xMin: number;
  xMax: number;
  h: number;
  d: number;
}

const cache = new WeakMap<Font, Map<number, GlyphInfo>>();

export function glyphInfo(font: Font, glyph: Glyph): GlyphInfo {
  let m = cache.get(font);
  if (!m) cache.set(font, (m = new Map()));
  const hit = m.get(glyph.index);
  if (hit) return hit;
  const u = font.unitsPerEm;
  const b = glyph.getBoundingBox();
  const empty = b.x1 === 0 && b.x2 === 0 && b.y1 === 0 && b.y2 === 0;
  const info: GlyphInfo = {
    font,
    glyph,
    w: (glyph.advanceWidth ?? 0) / u,
    xMin: empty ? 0 : b.x1 / u,
    xMax: empty ? (glyph.advanceWidth ?? 0) / u : b.x2 / u,
    h: empty ? 0 : b.y2 / u,
    d: empty ? 0 : -b.y1 / u,
  };
  m.set(glyph.index, info);
  return info;
}

/** The glyph for a character, or null when the font does not have it. */
export function charGlyph(font: Font, ch: string): GlyphInfo | null {
  const index = font.charToGlyphIndex(ch);
  if (!index) return null;
  return glyphInfo(font, font.glyphs.get(index));
}

const byName = new WeakMap<Font, Map<string, number>>();

/** A glyph by its PostScript name (size variants such as "parenleft.s3", "uni222B.dsp"). */
export function namedGlyph(font: Font, name: string): GlyphInfo | null {
  let m = byName.get(font);
  if (!m) {
    m = new Map();
    for (let i = 0; i < font.numGlyphs; i++) {
      const n = font.glyphs.get(i).name;
      if (n) m.set(n, i);
    }
    byName.set(font, m);
  }
  const i = m.get(name);
  return i === undefined ? null : glyphInfo(font, font.glyphs.get(i));
}

/** PostScript-style base name of a character ("uni222B", or the font's own name). */
export function glyphName(font: Font, ch: string): string | null {
  const g = charGlyph(font, ch);
  return g?.glyph.name ?? null;
}
