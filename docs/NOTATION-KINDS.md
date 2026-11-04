# Notation kinds — design proposal

Status: **proposal, awaiting approval** (requested after Phase 1a).

## 1. Idea

Every mathematical object of a given kind (physical vector, DCM, dyadic, …) is written once as
a **semantic macro** such as `\pvec{r}` or `\dcm{b}{a}`. The equation keeps the macro. Its look
comes from the **notation profile** of the thesis/document at the time it is drawn. Changing a
kind's style therefore restyles every equation of that kind.

## 2. AST change

A new node in `math-core`:

```ts
interface Notation extends Base {
  kind: "notation";
  name: string;   // kind id: "pvec", "dcm", …
  args: Row[];    // the kind's arguments: base symbol, then frame labels…
}
```

- **Parser:** the profile's macros are known to the parser (`parseLatex(src, { notation })`), so
  `\pvec{r}` becomes a `notation` node, not raw. Unknown macros still produce a warning, as today.
- **Serializer:** writes the macro back unchanged, so LaTeX round trips keep the kind.
- **Expansion:** `expandNotation(root, profile)` turns `notation` nodes into ordinary nodes
  (variant, accent, scripts, fences) for the current style. It is called by:
  - the Classic renderer;
  - the OMML writer;
  - MathJax/SVG export.

  Expansion is a pure function, so the renderers stay unchanged apart from calling it.
- **Editor:** MathLive's `macros` option gets one definition per kind (with arguments), so the
  editor shows the styled result while `getValue()` still returns `\pvec{r}`.
- **Storage:**
  - Classic pictures already carry their LaTeX in the EMF comment, so the macros travel with them.
  - Native Word equations (OMML) cannot hold a macro, so their source is stored in the
    document's MathBlocks registry (custom XML), keyed by instance id.
  - Library equations store the macro LaTeX.
- **.tex export** writes a `\newcommand` for each kind used, generated from the profile.
- **Old equations** contain expanded LaTeX (`\overrightharpoon{\mathbf{r}}`). They remain valid
  and are converted to kinds only on request (section 6).

## 3. Style of a kind

```ts
interface KindStyle {
  weight: "regular" | "bold";
  boldScope: "base" | "scripts";              // bold never spreads to scripts unless asked
  shape: "italic" | "upright";
  letters: "serif" | "sans" | "calligraphic" | "script" | "blackboard" | "fraktur";
  greek: "bold-italic" | "upright" | "as-latin";
  accent: "none" | "harpoon" | "arrow" | "hat" | "bar" | "double-bar" | "double-arrow"
        | "under-bar" | "double-under-bar" | "under-tilde";   // the position follows the accent
  accentWeight: "regular" | "follow";          // accent drawn in the base's weight?
  frames: { position: "sub" | "sup" | "pre-sup" | "pre-sub" | "none"; separator: "" | "/" | "," };
  wrap: "none" | "brackets" | "braces" | "bars";   // [BN], {ω}_B, |x|
  suffix: string;                              // e.g. "^{\times}" for Hughes' skew matrix
}
```

- A **general default** style holds the shared defaults; each kind overrides only what differs.
- Accent **geometry** stays a global render rule (harpoon size, stroke, gap, barb angle; Word
  style → Accents), because it is typography, not notation.

## 4. Kinds and macros, with Hughes preset defaults

Defaults follow the Appendix A census where it has evidence (docs/NOTATION-CENSUS.md).
"Census" marks those; the rest come from the preset and need your chapter to confirm.

| Kind | Macro | Hughes default renders as | Source |
|---|---|---|---|
| Scalar | (no macro: plain letters) | italic *m*, *ω* | — |
| Physical vector | `\pvec[frames]{r}` | bold upright + harpoon, 𝐫⃑, 𝛚⃑; frames as subscript `_{P/O}` | census 23× |
| Unit / basis vector | `\uvec{s}{2}` | italic + hat, ŝ₂ | census 15× (plain) |
| Bold basis vector | `\buvec{b}{1}` | bold + hat, 𝐛̂₁ | census 6×; **merge with Unit vector?** |
| Vectrix (frame) | `\vectrix{S}` | bold upright capital + arrow, 𝐒⃗ | census 11× |
| Column matrix | `\cmat{c}` | bold upright, 𝐜 | census 54× |
| Matrix | `\mat{A}` | bold upright capital, 𝐀 | preset; looks like a column matrix (warning below) |
| Direction cosine matrix | `\dcm{b}{a}` | 𝐂 with subscript ba | preset |
| Skew-symmetric matrix | `\skew{\omega}` | 𝛚 with superscript × (`suffix ^{\times}`) | preset |
| Dyadic | `\dyad{I}` | bold upright + double arrow | preset, unsure |
| Tensor | `\tens{T}` | bold sans-serif | default chosen so it differs from matrices |
| Quaternion | `\quat{q}` | bold upright 𝐪; components ε, η | preset |
| Reference frame | `\frm{a}` | ℱ with arrow and subscript a | preset |
| Body / region | `\body{B}{i}` | bold upright 𝐁ᵢ | census (𝐁ᵢ, 𝐁_sf) |
| Transpose mark | `^{\T}` | upright regular ᵀ | your rule (replaces the 1a+ transpose setting) |
| Differential | `\dd{m}` | upright d: d*m* | census |

- The **Schaub & Junkins** preset uses [BN], [ω̃], {}ᴮω, ᴺd/dt.
- The **Markley & Crassidis** preset uses 𝐀, [ω×], scalar-last q.
- Switching preset changes the styles; your own edits are a profile on top of it.
- Profiles are stored per thesis/document (registry custom XML) and in the app, with JSON
  import and export.

**Identical styles warning:** the Notation page warns when two kinds render the same. In the
defaults above, Matrix and Column matrix are both bold upright (they differ only by capital
vs lower case). Do you want a distinction there?

## 5. How this replaces the 1a+ settings

| 1a+ setting | Becomes |
|---|---|
| "Bold applies to" (base / base + scripts / selection) | each kind's `boldScope`. Ctrl+Shift+B stays as manual formatting and always works on the base. |
| "Accents follow bold" | each kind's `accentWeight` |
| "Transpose symbol" | style of the **Transpose mark** kind (`^{\T}`) |
| Harpoon size / stroke / gap / barb angle | stays global: Word style → Accents (typography) |
| Spacecraft convention + vector style (1a setting) | the **preset** plus the Physical vector kind's accent and weight |

The renderer work already done (path-drawn harpoons and arrows, ink-based accent placement,
bold limited to the base in the AST) is what the kinds expand into, so it carries over unchanged.

## 6. Using kinds and converting existing equations

- **Insertion:** snippet = macro name (`pvec`+Tab), floating-editor command `/pvec`, palette
  "My notation" (each kind drawn in its current style). Ctrl+Shift+V and the vector templates
  insert `\pvec{}`.
- **Make → Physical vector** (right-click, palette, command line) wraps the selected symbol in
  the kind.
- **Restyle:** a change on the Notation page re-renders every equation using that kind.
  - Open documents update through `replaceMany` (one undo step per document); the library
    updates too (linked copies follow).
  - Equations are never edited by hand-made LaTeX search and replace: only nodes of that kind
    change.
- **Convert existing equations:** the census proposes a mapping from forms to kinds, for
  example bold + harpoon → physical vector, or bold upright lower case → column matrix.
  - Ambiguous forms are listed for you to decide (bold capital: matrix, vectrix, or body?).
  - Conversion is then one undo step per document.
- **Thesis tools:**
  - the symbol index groups symbols by kind (later the nomenclature's source);
  - the consistency check flags a letter used as different kinds;
  - it also flags hand-styled objects that bypass a kind (e.g. `\overrightharpoon{\mathbf{r}}`
    written out).

## 7. Stages

1. The model, parser, serializer, expansion and renderer support. Can be combined with the rest
   of 1a+.
2. The palette's "My notation" section (after 1b/1c).
3. The Notation settings page with live preview, the identical-style warning, and restyling.
4. Converting existing equations from the census mapping.

## Questions

1. Unit vectors: one kind (ŝ₂ and 𝐛̂₁ differ only by your choice per letter) or two kinds?
   The census found both forms.
2. Matrix vs column matrix: keep both bold upright, or give matrices another style?
3. Macro names: `\pvec`, `\uvec`, `\vectrix`, `\cmat`, `\mat`, `\dcm`, `\skew`, `\dyad`, `\tens`,
   `\quat`, `\frm`, `\body`, `\T`, `\dd`. Any you'd rather name differently?
   - `\mat` and `\skew` are fine for us but may clash with packages when you export to .tex.
     The export can rename them (e.g. `\mbmat`).
4. Frame labels as an optional first argument (`\pvec[P/O]{r}`, `\dcm{b}{a}` for DCMs)? Is that
   the order you want to type them in?
