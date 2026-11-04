/**
 * Typesetting rules. All lengths are in em of the current size (1 em = font size).
 * CLASSIC follows MathType's default spacing (its "Define Spacing" values), then improves where
 * MathType is weak (bracket sizes, accents on italic letters, matrix spacing).
 */
export interface RenderStyle {
  id: string;
  name: string;
  /** Script and second-level script sizes, relative to the base size. */
  scriptScale: number;
  scriptScriptScale: number;
  /** Baseline raise of superscripts / drop of subscripts (minimums). */
  supShift: number;
  subShift: number;
  /** Horizontal gap between a base and its scripts. */
  scriptGap: number;
  /** Fraction bar thickness, also the default rule thickness. */
  rule: number;
  /** Gaps between the bar and numerator / denominator ink. */
  fracGap: number;
  /** How far the bar extends past the wider of numerator and denominator, each side. */
  fracOverhang: number;
  /** Gap between big operators and their limits above/below. */
  limitGap: number;
  /** Vertical ink gap between matrix rows / aligned lines, and the minimum baseline distance. */
  rowGap: number;
  minBaselineSkip: number;
  /** Horizontal gap between matrix columns. */
  colGap: number;
  /** Extra height of stretchy brackets beyond their contents, top and bottom. */
  delimiterPad: number;
  /** Space between a radical's bar and its contents. */
  radicalGap: number;
  /** Space between accent and base. */
  accentGap: number;
  /** Spacing units (TeX's thin, medium, thick space). */
  thin: number;
  medium: number;
  thick: number;
  /** Lower-case Greek in italic (MathType: upright Symbol; TeX: italic). */
  greekItalic: boolean;
  /**
   * Size of big operators (∫ ∑ ∏) in display equations: a factor on the normal glyph
   * (MathType: "Symbol 150%"), or 0 to use the math font's large display variants (LaTeX).
   */
  bigOpScale: number;
  /** Greek letters, operators and big operators from the Symbol font (when one is loaded). */
  useSymbolFont: boolean;
  /** Slant of synthetic italic (Symbol has no italic face), as a shear factor. */
  obliqueSlant: number;
  /** Use MT Extra (when installed) before STIX for symbols Times and Symbol lack. */
  useExtraFont: boolean;
  /** STIX fallback glyphs: size factor (STIX is ~6 % larger than Times) and inward offset of their outlines (em) to match Times' weight. */
  fallbackScale: number;
  fallbackThin: number;
  /** MathType fractions: numerator baseline above / denominator baseline below the bar. */
  fracNumHeight: number;
  fracDenDepth: number;
  /** Harpoons and arrows over letters (drawn as paths) and placement of all top accents. */
  accents: AccentRules;
  color: string;
}

/**
 * Accent rules. Harpoon/arrow sizes are relative to MathType's, measured on MathType
 * output (12 pt, docs/ACCENT-MEASUREMENTS.md): length 0.41 em, stroke 0.029 em, barb 0.08 em
 * long at about 32°, ink gap 0.11–0.13 em above the letter.
 */
export interface AccentRules {
  /** Harpoon/arrow length and barb size, × MathType's. */
  size: number;
  /** Stroke weight, × MathType's. */
  stroke: number;
  /** Gap between the letter's ink top and the accent's ink, em. */
  gap: number;
  /** Barb angle, degrees from the shaft. */
  barbAngle: number;
  /** Smallest gap any accent keeps above the ink, em. */
  minGap: number;
}

/** MathType's harpoon at 12 pt (measured), em. */
export const MATHTYPE_HARPOON = { length: 0.41, stroke: 0.029, barbLength: 0.08, barbAngle: 32, gap: 0.115 };
/** MathType's \vec arrow (two barbs), em. */
export const MATHTYPE_ARROW = { barbLength: 0.0975, barbAngle: 26, gap: 0.145 };

/** Defaults: MathType's harpoon a little heavier (×1.2 stroke) so it stays clear at 10 pt. */
export const DEFAULT_ACCENTS: AccentRules = { size: 1, stroke: 1.2, gap: MATHTYPE_HARPOON.gap, barbAngle: MATHTYPE_HARPOON.barbAngle, minGap: 0.05 };
/** "Reset to MathType-like". */
export const MATHTYPE_ACCENTS: AccentRules = { size: 1, stroke: 1, gap: MATHTYPE_HARPOON.gap, barbAngle: MATHTYPE_HARPOON.barbAngle, minGap: 0.05 };

export const CLASSIC: RenderStyle = {
  id: "classic",
  name: "Classic (Times, MathType-like)",
  scriptScale: 0.58,
  scriptScriptScale: 0.42,
  supShift: 0.45,
  subShift: 0.25,
  scriptGap: 0.08,
  rule: 0.5 / 12,
  fracGap: 0.06,
  fracOverhang: 1 / 12,
  limitGap: 0.08,
  rowGap: 0.3,
  minBaselineSkip: 1.25,
  colGap: 0.9,
  delimiterPad: 0.08,
  radicalGap: 0.08,
  accentGap: 0.03,
  thin: 3 / 18,
  medium: 4 / 18,
  thick: 5 / 18,
  greekItalic: true,
  bigOpScale: 1.5,
  useSymbolFont: true,
  obliqueSlant: 0.2,
  useExtraFont: true,
  fallbackScale: 0.94,
  fallbackThin: 0,
  fracNumHeight: 0.35,
  fracDenDepth: 1.0,
  accents: DEFAULT_ACCENTS,
  color: "#000000",
};
