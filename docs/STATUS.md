# Status

Updated at the end of every round. This repository is public: everything here is generic — nothing from
the owner's thesis or documents (no equations, text, file names or statistics from them).

## Current build

- **Published:** 0.1.125 (commit `c15de21`), CI passed. It holds objects steps 5–6, the trial checklist, Priority 2, the Accents page and intermediate frames (the 0.1.123 and 0.1.124 runs were superseded by later pushes and never published).

## Window switching (0.1.115 self-test): cause

Settled by the 0.1.119 self-test: with the add-in recording every Word window activation and the MathBlocks request
during which it happened, a full run recorded **no** window that came forward outside the self-test's own steps,
and with two documents open none of ten operations (insert, Update numbers, Convert LaTeX and Apply style with their
progress windows, Repair, restyle, Check style, status message, Ctrl+Z, Ctrl+Y) changed the document in front. Every
MathBlocks path that can activate a window was also reviewed (see 0.1.118 notes in the history). The switch in 0.1.115
therefore did not come from MathBlocks — most likely something outside the test (a click, another program). The
recording stays in the add-in and in the self-test, so a recurrence will name its cause.

## This round

**1c, finished (correction).** Earlier rounds said 1c was "already in place". That was wrong: the palette
tiles were still drawn by MathLive (and plain text for symbols), and lib/tiles.ts was used only by the review
tool. Now:

- **Every tile in the app is drawn by math-render in the current document style** through lib/tiles.ts
  (components/MathTile.tsx): right panel, top palette and its group buttons, floating editor, Quick access,
  Recent, search results, My notation, the LaTeX cheat sheet and the quick-style bar. One font size (20 px),
  centred on the renderer's math axis (the minus sign's centre: the old fixed 0.25 em was 1.6 px off), one
  placeholder look, currentColor, cached per style and redrawn when the document style, accents or notation
  change. MathLive now draws only the editor field and equation previews in dialogs, never a tile; a test
  fails if a palette component draws tiles another way.
- **One palette component**: Quick access, Recent and the grids are the same parts everywhere (the floating
  editor's favourites row was a separate MathLive list; it is now the shared Quick access).
- **Favourites** reorder by drag (right panel, top palette, floating editor). **Recent** keeps 16, one per LaTeX.
  **Search** ranks exact LaTeX or name, then alias, then meaning, then category; within each, favourites and the
  most used first. **Hint:** after the third click on an item with a shortcut or snippet, once: "Faster: type
  ddt Tab" (or "press Ctrl+F").
- Self-test section "Palette tiles": every entry drawn on your PC's Times New Roman + Symbol, at its cell's
  size, never enlarged, in currentColor, with the time to draw the whole palette.

Contact sheets of the real app (screenshots of the running app UI in Chromium by tools/app-screenshots.ts;
Liberation Serif stands in for Times New Roman and STIX for Symbol, which this Linux machine lacks):

| | Light | Dark |
|---|---|---|
| Right panel | ![](images/palette-right-light.png) | ![](images/palette-right-dark.png) |
| Search "arrow" | ![](images/palette-search-light.png) | ![](images/palette-search-dark.png) |
| Top palette, a group open | ![](images/palette-top-light.png) | ![](images/palette-top-dark.png) |
| Floating editor, favourites | ![](images/palette-floating-favourites-light.png) | ![](images/palette-floating-favourites-dark.png) |
| Floating editor, structures | ![](images/palette-floating-structures-light.png) | ![](images/palette-floating-structures-dark.png) |

**Self-test of 0.1.125 (13 Nov, 01:38):** 388 passed, 3 failed — all three were faults in the test, not in
the add-in: a snapshot lists an object under its ID and as `obj:ID`, so Cut and Delete counted 2 → 0 instead
of 1 → 0 (the text around the equation stayed, Paste brought it back); and the PDF does carry alt text on both
equations, but Word writes it into a compressed object stream, which the check did not inflate. Fixed: the
checks count equations, and the PDF check inflates the streams and lists the alt texts. (The alt text still
holds the equation's ID and LaTeX: readable alt text without the ID is MathType parity item 2.)
Intermediate frames: all 13 checks passed.

**Notation decisions for intermediate frames (your message):**

1. **Frame subscripts:** now a per-document option, off by default (Document style → Roman numerals row →
   "warn when a frame has a subscript"). `\vectrix{F}_{I}` and `\bvec{f}_1^{I}` are no longer reported.
2. **Roman numerals:** new document-style category "Roman numerals in indices", upright by default,
   recognised in subscripts and superscripts without `\mathrm`. A single I in an index is not taken for a
   variable (Classify indices leaves numerals out; only an explicit classification of the letter overrides).
   Existing pictures keep their fingerprint: run Apply style (Document style) once to redraw them.
3. **DCMs:** `\dcm{F_{I}}{F}` is the recommended form; it draws C with subscript F_I F, numeral upright, with a
   thin space after the frame that has an index. `\dcm{F_{II}}{F_{I}}` works too.

Self-test section "Intermediate frames" checks all three on a generic F, F_I, F_II example.


**Milestone: trial checklist, Priority 2, Accents page.**

- **One-day trial checklist:** [TRIAL-CHECKLIST.md](TRIAL-CHECKLIST.md) — preparation, converting the chapter,
  a day of writing, end of day (PDF from Word and Acrobat, print, reopen, another PC).
- **Priority 2:**
  - quick-style bar in the editor, replacing the bold popup: Bold, Italic/Upright, five accents, Make → kind;
    on a kind, Convert to plain and Edit kind style (checked in the browser preview: the bar appears after a
    pause and the harpoon button turns `x+r` into `x+\overrightharpoon{r}`);
  - frame-label shape per kind (follow the document style, italic, upright);
  - own kinds, bold Greek: done in earlier rounds.
- **1c:** wrongly reported as already in place — see the correction above.
- **Accents page:** sliders for size, stroke, gap, barb angle, smallest gap, fixed/adaptive length; live preview
  at 12 and 10 pt on this PC's fonts; MathBlocks default / MathType-like; Save and redraw the document.
- Objects steps 5–6 and this milestone are both in 0.1.125.

Tests: unit tests for the quick-style actions, the frame-label shape and the accent rules reaching the drawing;
the bar was checked in the browser preview. These are editor and settings features, so the Word self-test has no
new section this round.

## What to test (next build)

0. **Palette (1c):** the tiles should now look like what Word gets, in every palette; switch the document
   style (e.g. ISO) and watch d/dt and similar tiles change; drag a favourite; search "arrow", "gradient",
   `\alpha`; click the fraction three times for the hint. Self-test section "Palette tiles".
0. **Intermediate frames:** self-test section "Intermediate frames"; then Document style → Apply style on
   your converted chapter, and check `\vectrix{S}_{I}`-type frames show an upright numeral.
1. **Self-test** (sections added in 0.1.125: the right-click menu; objects end to end).
2. **Quick-style bar:** type a letter, pause → the bar above it; try Bold, Upright, the accents, Make → kind;
   on a kind (`;pv` Tab r Space, then click it) → Plain / Style….
3. **Notation settings → a kind → Frame label shape:** italic for the DCM, then check `\dcm{A}{B}` in Word.
4. **Accents** (Ctrl+K → Accents): move the sliders, compare with MathType's harpoon, Save and redraw.
5. The trial checklist when you have a day for it.

## Last self-test analysed

**0.1.121:** 285 checks — 284 passed, 1 failed, 27 for information; spike 123, 0 failed; no window came forward
outside the test; two documents: every operation kept the worked-on document in front.

- All new checks passed: every MathType break a marker (also in empty sections), the heading without a break
  listed and marked, new equations numbered right in a later section, the heading-only section and the next
  chapter; references verified and MathType's bookmarks removed; no MathType numbering field left; the private-use
  dot became \cdot; the empty object listed with where it is and the only one left.
- The failure — "Convert numbering (keep the numbers): changed the document" — is the check: keeping the numbers
  changes the number fields (MathType's → MathBlocks') but not their text, and the undo check compared the text
  only. It now compares the kind of each number too. The conversion itself passed its checks.

## Thesis-copy results

Owner's chapter copy converted with 0.1.121 (checked on the saved file): no MathType numbering field left, every
heading break a MathBlocks marker, every equation reference a MathBlocks reference (no MathType bookmark left), no
private-use character in any equation, the dot operator and number sets converted, and the only MathType object
left is the empty one listed by the pre-flight.

## Waiting for the owner

- Self-test of the next build; thesis-copy results for Convert numbering and Review notation kinds.

## Known problems

- The visual editor (MathLive) shows letters in its own convention while typing; the Classic preview under
  it and every drawing in Word use the document style.
- Restyle undo follows the drawings of one probe equation; a document of native Word equations only has no
  probe (their look is in Word's own equations), so there the stored style does not follow Ctrl+Z yet.
- The font is Times New Roman with Symbol (Classic); choosing another font is not available yet.
- Writing equations into Word takes about 0.3 s per equation (150 equations ≈ 45 s); could be optimised.

## Next

1. MathType parity and beyond (FEATURES.md), in order: handwriting pad, accessible alt text, rich clipboard,
   context-aware quick-style bar, entry points in Word, higher-fidelity MathType conversion, export one
   equation as PDF.
2. The look of individual symbols (owner's request, after functionality).

The one-day trial checklist is in [TRIAL-CHECKLIST.md](TRIAL-CHECKLIST.md).

## History

- **0.1.126** — 1c finished: every palette tile drawn by math-render in the document style; drag to reorder favourites; Recent 16; ranked search; one-time hint. Self-test fixes (object Cut/Delete count, PDF alt text in compressed streams).
- **0.1.125** — Intermediate frames: frame-subscript check per document, Roman numerals upright, DCMs between indexed frames. Also carries the two entries below (their own runs were superseded).
- **0.1.124** (not published) — Trial checklist; quick-style bar; frame-label shape per kind; Accents page.
- **0.1.123** (not published) — Embedded objects steps 5–6: MathBlocks right-click menu; per-user class registration; self-test of undo/redo, Track Changes, PDF.
- **0.1.122** — Self-test: the undo check compares the kind of each number.
- **0.1.121** — Convert MathType/numbering fixes from a real chapter (breaks, references, private use, empty objects, number sets, look-alikes, interchange forms).
- **0.1.120** — Bold Greek calibrated by darkness (no heavier than bold Latin).
- **0.1.119** — Bold Greek: emboldened Symbol outlines calibrated to Times Bold; Hughes bold kinds draw Greek upright; comparison sheet.
- **0.1.118** — My styles; restyle undo follows the drawings; window activations recorded; two-document check.
- **0.1.117** — Self-test keeps its document in front after undo/redo and in Repair.
- **0.1.116** — Document style: looks per document (render time), meaning in the LaTeX; Check style; classification; presets.
- **0.1.115** — Self-test: Apply notation kinds runs before Normalize bold.
- **0.1.114** — Notation kinds on conversion; Review notation kinds (Ctrl+K); fixes after the 0.1.113 self-test.
- **0.1.113** — Number reading after fields without a result (bracket kept); undo checks compare numbers.
- **0.1.112** — Text guard on every whole-document operation; missing section marker is a pre-flight error;
  number brackets; cursor after an inserted section marker.
- **0.1.110** — Equation numbers read from the button fields' display text; Section marker at the cursor;
  readable broken-reference snippets; self-test fixes.
- **0.1.108** — Convert numbering (MathType → MathBlocks: keep, or renumber to chapter.section.equation);
  three-level interchange numbering, section markers, labels as numbers, `\bvec`; Section marker command;
  broken-reference list.
- **0.1.105** — Whole-document Convert LaTeX (interchange convention, pre-flight report, numbers, label
  bookmarks, references, markers, one Ctrl+Z); generated docs/LATEX-INTERCHANGE.md.
- **0.1.104** — One Ctrl+Z for Convert MathType, Convert LaTeX, Update numbers; add-in attaches to open windows.
- **0.1.103** — Repair reads Word's XML before its undo record opens (Word ends the record on any XML read).
- **0.1.102** — Self-test saves and closes its documents; no redraw during long operations.
- **0.1.101** — Repair restores numbered paragraphs' style (custom tab stops only).
- **0.1.99–0.1.100** — Repository history cleaned of private material; long operations keep their document in front.
