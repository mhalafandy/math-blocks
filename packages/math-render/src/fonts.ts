/// <reference path="./opentype.d.ts" />
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
  /** Symbol-encoded font for Greek and operators (MathType's "Symbol" style), optional. */
  symbol?: Font;
  /** MathType's MT Extra (installed with MathType): preferred over STIX for what Times lacks. */
  extra?: Font;
}

export type Face = Exclude<keyof FontSet, "symbol" | "extra">;

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

/** Adobe Symbol encoding (the Symbol font MathType uses for Greek and operators). */
export const SYMBOL_CODES: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  const greek = "αaβbχcδdεeφfγgηhιiϕjκkλlμmνnοoπpθqρrσsτtυuϖvωwξxψyζzΑAΒBΧCΔDΕEΦFΓGΗHΙIϑJΚKΛLΜMΝNΟOΠPΘQΡRΣSΤTΥUςVΩWΞXΨYΖZ";
  for (let i = 0; i < greek.length; i += 2) m[greek[i]!] = greek.charCodeAt(i + 1);
  m["φ"] = 0x6a; // TeX \varphi (φ) is Symbol's "j"; ϕ (\phi) is "f"
  m["ϕ"] = 0x66;
  const ops: [string, number][] = [
    ["+", 0x2b], ["−", 0x2d], ["=", 0x3d], ["<", 0x3c], [">", 0x3e], ["∀", 0x22], ["∃", 0x24], ["∋", 0x27], ["∗", 0x2a],
    ["≅", 0x40], ["⊥", 0x5e], ["∼", 0x7e], ["′", 0xa2], ["≤", 0xa3], ["∞", 0xa5], ["↔", 0xab], ["←", 0xac], ["↑", 0xad],
    ["→", 0xae], ["↓", 0xaf], ["±", 0xb1], ["″", 0xb2], ["≥", 0xb3], ["×", 0xb4], ["∝", 0xb5], ["∂", 0xb6], ["•", 0xb7],
    ["÷", 0xb8], ["≠", 0xb9], ["≡", 0xba], ["≈", 0xbb], ["…", 0xbc], ["ℵ", 0xc0], ["ℑ", 0xc1], ["ℜ", 0xc2], ["℘", 0xc3],
    ["⊗", 0xc4], ["⊕", 0xc5], ["∅", 0xc6], ["∩", 0xc7], ["∪", 0xc8], ["⊃", 0xc9], ["⊇", 0xca], ["⊄", 0xcb], ["⊂", 0xcc],
    ["⊆", 0xcd], ["∈", 0xce], ["∉", 0xcf], ["∠", 0xd0], ["∇", 0xd1], ["∏", 0xd5], ["√", 0xd6], ["⋅", 0xd7], ["¬", 0xd8],
    ["∧", 0xd9], ["∨", 0xda], ["⇔", 0xdb], ["⇐", 0xdc], ["⇑", 0xdd], ["⇒", 0xde], ["⇓", 0xdf], ["∑", 0xe5], ["∫", 0xf2],
  ];
  for (const [c, v] of ops) m[c] = v;
  return m;
})();

/** A character from a Symbol-encoded font (clone fonts map the code itself; Windows' Symbol F0xx). */
export function symbolGlyph(font: Font, ch: string): GlyphInfo | null {
  const code = SYMBOL_CODES[ch];
  if (code === undefined) return null;
  return charGlyph(font, String.fromCharCode(code)) ?? charGlyph(font, String.fromCharCode(0xf000 + code));
}
