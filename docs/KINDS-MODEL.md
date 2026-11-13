# Everything is a kind — design (for approval)

One model for every symbol in an equation. Scalar variables, constants (e, i, π), functions and operators
(sin, d, ∂), index labels, counters, Roman numerals, numbers, units, text and the notation kinds
(`\pvec`, `\cmat`, `\bvec`, `\vectrix`, `\dyadic`, `\dcm`, your own kinds): each symbol **has a kind**,
and its look comes **only from that kind's style**, set in one place. Generic, for any document and
field; every example here and in the tests is generic.

Status: **approved** with all eight recommendations in §11; being built. Blocks (docs/BLOCKS-DESIGN.md) and the symbol list (docs/SYMBOL-LIST.md) are built on
this model.

---

## 1. Today: two systems that overlap

| | Document style (`MathStyle`) | Notation kinds (`NotationProfile`) |
|---|---|---|
| What it styles | plain tokens: Latin/Greek letters by case, labels, counters, Roman numerals, numbers, d, constants, functions, text, transpose | wrapped objects: `\pvec{…}`, `\dcm{…}{…}`, `\T`, `\diff{…}`, your kinds |
| How a token gets its category | rules at render time (`styleAst`): alphabet, index runs, the per-letter classification (`letters`), "d in a derivative", function names | the macro written in the source |
| Settings | flat fields (`latinLower`, `differential`, `constants`…) + presets (MathType, ISO…) | per-kind `KindStyle` + presets (three notation presets) |
| Stored | the document (`urn:mathblocks:style:v1`) | inside the same style (`notation`) |

The overlaps are real: the differential d is styled both by `style.differential` and by the `diff` kind;
the transpose by `style.transpose` and by the `T` kind; a bold letter used as a vector is "a bold
variable" for the style but a `\pvec` for the kinds; Check style and Review kinds look at the same
equations with different vocabularies.

## 2. The model

### 2.1 Kinds

Every kind is one entry in **one registry**:

```
Kind {
  id            "variable", "constant", "function", "label", "pvec", "dcm", "unit", …
  name          shown in menus, hover, Check style
  family        "token"   — a single symbol or name, never needs a macro (variable, constant, number…)
                "wrapper" — an object with arguments, written with a macro (\pvec{…}, \dcm{…}{…})
  macro?        LaTeX macro for explicit use (wrapper kinds always; token kinds optionally: \const{e})
  args, argNames, snippet?   as kinds have today
  listGroup     where the symbol list (SYMBOL-LIST.md) puts its symbols by default
  builtIn       or the user's own
}
```

Built-in **token kinds** (new; they replace the flat style fields):

| Kind | Holds | Default look (MathBlocks preset) |
|---|---|---|
| `variable` | single letters not otherwise classified; split by alphabet into four *variants*: Latin lower, Latin upper, Greek lower, Greek upper | italic, italic, italic, upright |
| `constant` | e, i, π, and anything you classify as a constant | italic (ISO preset: upright) |
| `function` | sin, cos, exp, det, `\operatorname{…}` | upright |
| `operator` | the differential d, ∂, Δ when used as an operator (`diff` kind merges here, §5) | italic (ISO: upright) |
| `label` | descriptive indices: multi-letter (max, eff) and letters classified as labels | italic (physics/ISO: upright) |
| `counter` | index variables i, j, k, n (classified) | italic |
| `roman` | Roman numerals in indices (S_I, S_II) | upright |
| `number` | digits | upright |
| `unit` | units of measurement (§2.4) | upright, thin space before |
| `text` | `\text{…}` | upright |
| `transpose` | the transpose mark (the `T` kind merges here) | upright |

Built-in **wrapper kinds**: today's notation kinds unchanged (`pvec`, `uvec`, `bvec`, `vectrix`, `cmat`,
`mat`, `dcm`, `crossmat`, `dyadic`, `tens`, `quat`, `frm`, `body`) and your own kinds.

### 2.2 One style per kind

Every kind has the same style record — today's `KindStyle` (weight, bold scope, shape, alphabet, Greek
bold form, accent, frames, wrap, suffix, symbol), of which a token kind uses the parts that apply
(shape and weight for most; `unit` adds its spacing). Global switches that are not per kind stay global:
`boldScope` default, `accentsFollowBold`, size, font.

The document style becomes:

```
MathStyle v2 {
  version: 2
  preset            the "letters and symbols" preset it started from (MathBlocks, MathType, ISO…)
  notationPreset    the notation preset (Hughes, Schaub, Markley…)        [decide 4]
  kinds             { [kindId]: Partial<KindStyle> }   only what differs from the presets
  symbols           SymbolRule[]                        per-document overrides (§3)
  global            { boldScope, accentsFollowBold, sizePt, font, frameSubscriptWarning }
  exceptions        Check-style findings kept on purpose (as today)
  symbolList        settings of the list of symbols (SYMBOL-LIST.md)
}
```

The Document style page shows **one table of kinds**: token kinds first, wrapper kinds after, each row a
live sample drawn by math-render and its style controls (the existing kind editor, reused). The presets
set many rows at once, as today.

### 2.3 Implicit and explicit kinds

- **Implicit** (the normal case for token kinds): a plain letter in the source gets its kind from the
  rules (§4) at render time. You never wrap ordinary variables in macros; the LaTeX stays `v = \omega r`.
- **Explicit**: a macro in the source fixes the kind: always for wrapper kinds (`\pvec{\omega}`), and
  optionally for token kinds when one occurrence must differ from the rules (`\const{e}` — new, optional
  macros for every token kind: `\variable`, `\const`, `\fn`, `\operator`, `\lbl`, `\ctr`, `\unit`) **[decide 6]**.
- A **font command** in the source (`\mathrm{x}`, `\mathbf{x}`) is still honoured as written; Check style
  lists it as a *forced look* (as today), with the fix "use the kind instead".

### 2.4 Units

`\unit{m/s}` (and `\unit{kg\,m^2}`) is the explicit unit kind: upright, a thin space after a preceding
number, `/` and `\,` kept. Convert LaTeX proposes it for the usual hand-written forms (`\mathrm{m/s}`,
`\text{ m/s}` after a number) as a *suggested* rule in Review kinds (never automatic). **[decide 6]**

## 3. Per-document overrides (symbol rules)

"In this document, e is a constant", "J is a matrix", "ω is a vector when bold": each is a **symbol
rule**, stored in the document style (so it travels with the document):

```
SymbolRule {
  symbol    the symbol as LaTeX: "e", "J", "\omega", "v_0" (a base with its subscript)
  when      { bold?: true | false, where?: "anywhere" | "index" | "base" }   (all optional)
  kind      the kind it gets: "constant", "mat", "pvec", …
  note?     why (shown in hover and Check style)
}
```

- The **current per-letter classification** of index letters (`letters: { i: "counter", b: "label" }`)
  becomes rules with `where: "index"`: nothing is lost, the Classification page keeps working.
- A rule naming a **wrapper kind** draws the symbol as that kind (J drawn in the matrix style) without
  rewriting the source: the LaTeX keeps `J` **[decide 3]**. "Make explicit" (Check style, one Ctrl+Z)
  rewrites the occurrences as `\mat{J}` for anyone who wants macros in the source or in LaTeX export.
- **"When bold"**: bold becomes a *condition*. With the rule "ω is a vector when bold", a bold ω in the
  source (`\boldsymbol{\omega}`, MathType's bold) is a `\pvec` for drawing, Check style and the symbol
  list, and is drawn in the pvec style (harpoon, or bold, as the notation says). Bold letters without a
  rule stay "bold variables" and Check style offers rules for them (§6).
- You also have **your own defaults** (the user default style) with the same rules, for every new document.

Setting a rule: right-click a symbol in the editor → **Kind ▸** (this occurrence: explicit macro / in
this document: a rule / everywhere: your default), the Document style page's **Symbols** tab (a table of
rules), and Check style's proposals.

## 4. How a symbol gets its kind (resolution)

For every token, first match wins **[decide 1]**:

1. **Explicit macro** in the source (`\pvec{…}`, `\const{e}`, `\unit{…}`).
2. **Symbol rule** of the document, then of your defaults (most specific first: with conditions before
   without; `v_0` before `v`).
3. **Context rules** (today's logic, kept): a run of letters in an index (label / counter / roman via the
   classification), the d of a derivative or integral (operator), a known function name (function),
   e as the base of a power and π (constant), digits (number), `\text` (text), a T after a matrix or `\T`
   (transpose).
4. **Alphabet default**: `variable` (its Latin/Greek, lower/upper variant).

A font command written in the source is applied after the kind's style (it is the author's explicit
look) and reported by Check style. The resolver is one pure function in math-core:
`kindOf(token, context, style) → { kind, variant, reason }`; `reason` is what hover shows ("constant —
rule in this document: e is a constant").

## 5. Merging the two systems

| Today | Becomes |
|---|---|
| `latinLower`, `latinUpper`, `greekLower`, `greekUpper` | `variable` kind, its four variants |
| `labels`, `counters`, `romans`, `numbers`, `constants`, `functions`, `text` | the token kinds of the same names |
| `differential` and the `diff` kind (`\diff{x}`) | `operator` kind; `\diff{x}` stays as its explicit form |
| `transpose` and the `T` kind (`\T`) | `transpose` kind; `\T` stays as its explicit form |
| `notation` (preset + overrides) | the wrapper kinds' rows; `notationPreset` |
| `letters` (index classification) | symbol rules with `where: "index"` |
| `boldScope`, `accentsFollowBold`, `sizePt`, `font`, `frameSubscriptWarning` | `global` |
| Check style + Review kinds | one **Check style** working on kinds (§6); Review kinds becomes its "convert old forms" part |

Every existing command keeps its meaning: Normalize bold, Convert MathType/LaTeX, Apply style, Review
kinds, the interchange document.

## 6. Check style and Apply style on the model

Check style lists, each with its equations and a one-click fix (one Ctrl+Z for all fixes):

- **Forced look**: a font command that overrides the kind (`\mathrm{d}` where `operator` is italic) →
  fix: remove it (the kind draws it) or keep as an exception.
- **One symbol, two kinds**: the same symbol resolved to different kinds in different equations (ω
  bold in some, plain in others; J both as a matrix and a scalar) → fix: add a rule, or make the
  outliers conform.
- **Proposed rules**: from the whole document — bold letters always bold → "ω is a vector when bold";
  e only as a power base → "e is a constant"; a capital always bold → "J is a matrix"; index letters →
  the classification (today's proposals). You accept or reject each; rejected ones are remembered.
- **Old forms**: the Review kinds rules (MathType's harpoon-over-bold → `\pvec`), unchanged.
- **Outdated drawings**: pictures drawn in an older style (as today, by style hash).

**Apply style** redraws every equation whose resolved look changed (pictures and native equations), with
the usual backup, batches, progress and one Ctrl+Z.

## 7. Editor

- Hover over any symbol shows its kind and why (§4).
- Right-click → **Kind ▸** (§3). "Make → kind" (today) and "Convert to plain" stay.
- The visual editor shows implicit kinds as they will print (as today for the style).

## 8. Blocks and the symbol list

- A **block** is made of kinds and blocks: its body keeps plain letters plain (their kinds resolve in the
  document it is inserted into) and wrapper kinds as macros; a slot may require a kind (§ "Kinds in
  blocks" in BLOCKS-DESIGN.md).
- The **symbol list** identifies a symbol by its *resolved* kind and base (a bold ω with the vector rule
  and `\pvec{\omega}` are the same symbol), takes its group from the kind's `listGroup`, and draws it
  in the kind's style.

## 9. Migration: existing documents keep their look

- A v1 style (in a document or your defaults) is read and converted to v2 by a pure function
  (`migrateStyle`), following the table in §5. Nothing is written into the document until you change
  its style (then v2 is written; v1 is no longer written).
- **The style hash of a converted style equals its v1 hash** as long as the look is one v1 could express,
  so pictures drawn before are not reported "outdated".
- **Proof in CI**: a corpus of generic equations (every token kind, every wrapper kind, every preset,
  classification and bold cases) is drawn with each v1 preset by the current code and by the new model
  after migration; the SVGs must be identical. The same test runs on Word native output (OMML).
- Older app versions cannot read v2 styles (they fall back to their default); this is acceptable for a
  single-user tool and stated in the changelog **[decide 8]**.

## 10. Build plan and tests

1. math-core: the kind registry (token kinds added), `KindStyle` for tokens, `MathStyle` v2,
   `migrateStyle`, `kindOf` resolver, `styleAst` rewritten on the resolver. Unit tests: resolution order,
   rules with conditions, migration of every v1 field, the golden-SVG corpus (v1 vs v2 identical).
2. The renderer, OMML writer and LaTeX export read the resolved kinds; `\unit` and the optional token
   macros in the parser/serializer (round trip test, as for kinds today).
3. Document style page: one kinds table + Symbols tab (rules) + presets; hover and right-click **Kind ▸**
   in the editor (headless check).
4. Check style and Apply style on the model (unit tests on generic documents; self-test section on a
   synthetic Word document: rules, a forced look, "one symbol, two kinds", Apply style, one Ctrl+Z).
5. Then Blocks on the model, then the symbol list.

## 11. Decisions for you

| # | Question | My recommendation |
|---|---|---|
| 1 | Resolution order | Explicit macro → document rule → your default rule → context rules → alphabet default (§4) |
| 2 | Where per-document overrides live | In the document style (travel with the document), with your own default rules for new documents |
| 3 | A rule naming a wrapper kind (J is a matrix) | Drawing only, the source keeps `J`; "Make explicit" rewrites to `\mat{J}` on request |
| 4 | Presets | Two pickers on one page: letters-and-symbols preset (MathBlocks, MathType, ISO…) and notation preset (Hughes, Schaub, Markley); both just set rows of the one kinds table |
| 5 | Bold as a condition | Yes ("ω is a vector when bold"); bold letters without a rule stay bold variables and get proposed rules |
| 6 | Explicit token macros and `\unit` | Add `\unit{…}` now; the other token macros (`\const`, `\fn`, …) as optional forms, mainly for exceptions and the interchange |
| 7 | Differential and transpose | Merge into the `operator` and `transpose` kinds; `\diff` and `\T` stay as their explicit forms |
| 8 | Storage format | Write v2 from now on (read v1 forever); older app versions are not supported for v2 documents |
