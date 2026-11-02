/**
 * Style Profiles control how the AST is written as OMML, i.e. how native Word
 * equations look. They let us fix Word's poor defaults (cramped matrices, tiny
 * vector arrows) while keeping the equations fully native and editable.
 *
 * Values marked [M1] are first guesses to be tuned in the M1 visual comparison.
 */
export interface StyleProfile {
  id: string;
  name: string;
  /** OpenType MATH font, written on every run. Must be installed on the reader's PC. */
  mathFont: string;
  /** How \vec{x} is drawn. "arrow": accent arrow; "bold": bold upright; "bold-italic". */
  vectorStyle: "arrow" | "bold" | "bold-italic";
  matrix: {
    /** OMML m:rSpRule: 0 single, 1 one-and-a-half, 2 double, 3 exactly, 4 multiple. */
    rowSpacingRule?: 0 | 1 | 2 | 3 | 4;
    /** OMML m:rSp (points×20 for rule 3, half-lines for rule 4). */
    rowSpacing?: number;
    /** OMML m:cGpRule: 0 single em, 1 1.5em, 2 2em, 3 exactly (twips), 4 multiple. */
    columnGapRule?: 0 | 1 | 2 | 3 | 4;
    columnGap?: number;
    /**
     * Make matrix brackets taller than the entries (Word draws them exactly as tall as the
     * content). Implemented with an invisible zero-width "phantom" copy of the matrix that is
     * a little taller; Word stretches the brackets around it. [M2: chosen by the user in Word]
     *  - "none":    Word's default
     *  - "match":   m:shp="match" (bracket matches content height; no padding)
     *  - "scripts": phantom with tiny scripts above/below ( ~ +0.3 em each side )
     *  - "limits":  phantom with stacked limits above/below ( ~ +0.6 em each side )
     */
    bracketPadding?: "none" | "match" | "scripts" | "limits";
  };
  /** Equation arrays (aligned derivations, cases). */
  equationArray: {
    rowSpacingRule?: 0 | 1 | 2 | 3 | 4;
    rowSpacing?: number;
  };
}

/** Exactly what Word writes by default: no spacing overrides, Cambria Math. */
export const WORD_DEFAULT_PROFILE: StyleProfile = {
  id: "word-default",
  name: "Word default",
  mathFont: "Cambria Math",
  vectorStyle: "arrow",
  matrix: {},
  equationArray: {},
};

/** Tuned for readability: airier matrices and derivations. [M1] */
export const TUNED_PROFILE: StyleProfile = {
  id: "tuned",
  name: "MathBlocks tuned",
  mathFont: "Cambria Math",
  vectorStyle: "arrow",
  matrix: { rowSpacingRule: 1, columnGapRule: 1 },
  equationArray: { rowSpacingRule: 1 },
};

export const withFont = (profile: StyleProfile, mathFont: string, suffix = mathFont): StyleProfile => ({
  ...profile,
  id: `${profile.id}-${suffix.toLowerCase().replace(/\s+/g, "-")}`,
  name: `${profile.name} — ${mathFont}`,
  mathFont,
});
