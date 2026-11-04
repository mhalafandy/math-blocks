// Minimal types for the parts of opentype.js 2.0 that the engine uses.
declare module "opentype.js" {
  export interface BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }
  export interface PathCommand {
    type: "M" | "L" | "C" | "Q" | "Z";
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }
  export interface Path {
    commands: PathCommand[];
    toPathData(options?: { decimalPlaces?: number; flipY?: boolean } | number): string;
  }
  export interface Glyph {
    index: number;
    name: string | null;
    unicode?: number;
    advanceWidth?: number;
    getBoundingBox(): BoundingBox;
    getPath(x: number, y: number, fontSize: number): Path;
  }
  export interface GlyphSet {
    get(index: number): Glyph;
    length: number;
  }
  export interface Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    numGlyphs: number;
    glyphs: GlyphSet;
    names: Record<string, Record<string, string> | undefined>;
    charToGlyph(c: string): Glyph;
    charToGlyphIndex(c: string): number;
    getKerningValue(left: Glyph, right: Glyph): number;
  }
  export function parse(buffer: ArrayBuffer, opt?: Record<string, unknown>): Font;
}
