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
  color: string;
}

export const CLASSIC: RenderStyle = {
  id: "classic",
  name: "Classic (Times, MathType-like)",
  scriptScale: 0.58,
  scriptScriptScale: 0.42,
  supShift: 0.45,
  subShift: 0.25,
  scriptGap: 0.04,
  rule: 0.045,
  fracGap: 0.09,
  fracOverhang: 0.06,
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
  color: "#000000",
};
