# List of symbols, generated from tags — design (for approval)

You define each symbol once, in the text where you introduce it; MathBlocks keeps the definition at that
place, and one click writes (or updates) the table of symbols. Checks tell you what is used but not
defined, defined but not used, and where one symbol has two meanings. Built on the kinds model
(docs/KINDS-MODEL.md) and the symbol index (M11). Generic, for any document and field; every example here
and in the tests is generic.

Status: **design only, awaiting approval.** Decisions marked **[decide n]** are collected in §9 with my
recommendation.

---

## 1. The tag

```
\define{symbol}{meaning}[unit]
```

- `symbol`: LaTeX, as in an equation — `m`, `v_0`, `\pvec{\omega}`, `\mat{J}`, `\dcm{b}{a}`.
- `meaning`: plain text (may contain inline math in `$…$`: `angular velocity of $\frm{B}$ relative to
  $\frm{N}$`).
- `[unit]` (optional): LaTeX of the unit, drawn as the `unit` kind — `[m/s]`, `[kg\,m^2]`, `[-]` for
  dimensionless.

Written **in the text, right after the sentence that introduces the symbol**:

> The body rotates with angular velocity ω about its centre of mass. `\define{\pvec{\omega}}{angular
> velocity of the body}[rad/s]`

**Index labels and abbreviations** are defined the same way **[decide 2]**:

- a subscript or superscript label on an empty base: `\define{{}_{\mathrm{max}}}{maximum value}` — listed in
  the "Subscripts" group as "( )_max"; `\define{{}^{\T}}{transpose}` in "Superscripts";
- an abbreviation as upright text: `\define{\text{RMS}}{root mean square}` — listed in "Abbreviations".

## 2. Where definitions live in Word

- **Convert LaTeX** turns each `\define{…}{…}[…]` into a **hidden definition marker** at the same place
  in the paragraph (like `\mbnumbering`, but inline): a hidden run whose text is the tag itself, inside a
  content control tagged `mbdef` **[decide 1]**. The position is the *place of definition*. The marker is
  self-contained (copying the paragraph to another document carries it), readable when hidden text is
  shown, and converts back to the same tag (interchange round trip).
- **Define symbol…** (editor and floating editor context menu on a selected symbol, ribbon, Ctrl+K): a
  small dialog with the symbol (drawn), meaning and unit, then **where**: right after the paragraph of the
  equation being edited (default), or at Word's cursor. An existing definition of the same symbol is shown
  and can be edited instead of adding a second one.
- **Edit definitions**: the list's Symbols panel (§5) shows every definition with its place; double-click
  goes there in Word; edit and delete rewrite the marker.

## 3. Identity: when are two symbols the same?

A symbol's **key** is computed from its resolved kinds (KINDS-MODEL.md §4), not from its spelling:
`\pvec{\omega}` and a bold ω under the rule "ω is a vector when bold" have the same key; `v_0` and `v` are
different symbols (a base with its subscript is one symbol, as in the symbol index); a power is not part
of the symbol (`v_0^2` uses `v_0`). Wrapper kinds with frame labels (`\pvec[B/N]{\omega}`) are the same
symbol as without labels unless the definition gives the labels **[decide 3]**.

## 4. The table of symbols

**One click** — ribbon **Symbols list** and Ctrl+K "Insert / update list of symbols":

- at the cursor if the document has no list yet; otherwise **at its existing place** (the list is a Word
  table inside a content control tagged `mbsymbols`), replaced in place;
- one Ctrl+Z (the existing document-operation batching), backup first for large documents;
- columns: **symbol** (drawn by math-render in the document style, as a Classic picture or a native
  equation like the document's equations), **meaning** (inline math in it drawn the same way), **unit**,
  and optionally **first defined**: the number of the first numbered equation using the symbol at or
  after its definition (as a cross-reference field), or the page of the definition (a PAGEREF field to
  a bookmark on the marker) **[decide 4]**;
- group headings as full-width rows; Word table style from the settings.

## 5. Style page (Settings → Symbol list; saved in the document style)

| Setting | Choices |
|---|---|
| Sort | Latin, Greek, then sub- and superscripts (default); or alphabetical by name of the letter (α with a) |
| Within an alphabet | a A b B … (default) or A … Z a … z; Greek in Greek alphabet order |
| Same letter | plain, then bold, then accented, then with indices (configurable order) |
| Groups | none, or any of: Latin / Greek / Subscripts / Superscripts / Abbreviations; or **by kind** (Scalars / Vectors / Matrices / Constants…, from each kind's `listGroup`); headings renamable |
| Columns | symbol, meaning, unit, first defined (equation number / page / none); order; widths |
| Table | Word table style name, heading row, repeat heading on each page, font of the meaning column |
| Unit format | `[m/s]` (brackets) or `m/s` |

A preview of the table with sample symbols (drawn by math-render in the document style) updates live.

## 6. Checks (Symbols panel and Check style)

Each finding has its place (page and the text around it) and goes there on double-click:

- **Used but not defined**: a symbol in an equation with no definition — first use shown; one click
  starts Define symbol… with that symbol;
- **Defined but not used**: a definition whose symbol appears in no equation;
- **One symbol, two meanings**: two definitions of the same key with different meanings (or units);
- **One meaning, two symbols**: two keys with the same meaning text (ignoring case, spaces and articles);
- **Defined after first use**: the definition comes after the symbol's first equation (warning only).

Symbols you do not want listed (a dummy index, a summation variable) can be ignored per document; counters
(`counter` kind) and numbers are never asked for.

## 7. Interchange (for the transcription chat; added to LATEX-INTERCHANGE.md after approval)

> **Symbol definitions.** Right after the sentence that introduces a symbol, write
> `\define{symbol}{meaning}[unit]` in the same paragraph (the unit is optional). The symbol is written as
> in equations (`\pvec{\omega}`, `v_0`); the meaning is plain text and may contain `$…$`; the unit is
> LaTeX (`[m/s]`, `[-]` for dimensionless). Define each symbol once. Index labels on an empty base
> (`\define{{}_{\mathrm{max}}}{maximum}`) and abbreviations (`\define{\text{RMS}}{root mean square}`) are
> defined the same way.

Convert LaTeX's pre-flight reports malformed tags and second definitions of the same symbol.

## 8. Build plan and tests

1. Pure functions (unit tests, generic): parse `\define` (all forms, errors), symbol keys on the kinds
   model, sort and group, checks, table model (rows, headings, first-defined).
2. Interchange: `\define` in Convert LaTeX (pre-flight, hidden marker, round trip back to the tag).
3. Word: read markers (position, paragraph, page), write/replace the table in its content control (one
   Ctrl+Z), first-defined fields. Self-test on a synthetic document: three definitions, generate, add a
   fourth, update in place, Ctrl+Z, the checks on deliberately wrong definitions.
4. App: Define symbol… (editor, floating editor), Symbols panel with checks, style page with preview.

## 9. Decisions for you

| # | Question | My recommendation |
|---|---|---|
| 1 | Marker in Word | Hidden run holding the tag, in a content control `mbdef` (self-contained, survives copy/paste, round-trips) |
| 2 | Index labels and abbreviations | Same tag: empty base for sub/superscript labels, `\text{…}` for abbreviations |
| 3 | Frame labels on wrapper kinds | Same symbol with or without labels, unless the definition itself has labels |
| 4 | "First defined" column | Equation number (cross-reference) when the symbol is in a numbered equation after the definition, else the page; off by default |
| 5 | Inline math in meanings | Allowed (`$…$`), drawn like the symbol column |
| 6 | Where the list's settings live | In the document style (travel with the document), with your defaults for new documents |
