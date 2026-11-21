import { boldGreek, glyphStem, symbolGlyph, thinOutline, type FontSet, type OutlineCmd } from "@mathblocks/math-render";

/** Stem widths (em): Times Regular, Times Bold, Symbol, Symbol emboldened (the self-test's bold Greek check). */
export function boldGreekStems(fonts: FontSet) {
  const bg = boldGreek(fonts);
  let emboldened = 0;
  let emboldenedItalic = 0;
  if (fonts.symbol) {
    const g = symbolGlyph(fonts.symbol, "Ι");
    if (g) {
      const cmds = g.glyph.getPath(0, 0, 1).commands as OutlineCmd[];
      emboldened = glyphStem(thinOutline(cmds as never, -bg.upright) as OutlineCmd[], g.h) ?? 0;
      emboldenedItalic = glyphStem(thinOutline(cmds as never, -bg.italic) as OutlineCmd[], g.h) ?? 0;
    }
  }
  return { ...bg.stems, emboldened, emboldenedItalic, offsetUpright: bg.upright, offsetItalic: bg.italic, measured: bg.measured, darkness: bg.darkness };
}
