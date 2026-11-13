# Status

Updated at the end of every round. This repository is public: everything here is generic — nothing from
the owner's thesis or documents (no equations, text, file names or statistics from them).

## Current build

- **Published:** 0.1.137 (list of symbols; 0.1.136: Blocks; 0.1.135: the kinds model), CI passed. Earlier: 0.1.133 (commit `4688e93`), CI passed: Blocks design (for approval), the MathType comparison (self-test + CI harness), suggestions from the document, the speed benchmark, print-check fixes. 0.1.131–0.1.132 were superseded.

## Window switching (0.1.115 self-test): cause

Settled by the 0.1.119 self-test: with the add-in recording every Word window activation and the MathBlocks request
during which it happened, a full run recorded **no** window that came forward outside the self-test's own steps,
and with two documents open none of ten operations (insert, Update numbers, Convert LaTeX and Apply style with their
progress windows, Repair, restyle, Check style, status message, Ctrl+Z, Ctrl+Y) changed the document in front. Every
MathBlocks path that can activate a window was also reviewed (see 0.1.118 notes in the history). The switch in 0.1.115
therefore did not come from MathBlocks — most likely something outside the test (a click, another program). The
recording stays in the add-in and in the self-test, so a recurrence will name its cause.

## This round

**Approved (13 Nov):** the kinds model (all 8 recommendations), the list of symbols (all 6, with two
corrections: definition markers are hidden fields like the numbering markers, never content controls; no
example forces a look with `\mathrm`), and the Blocks amendment. Order: kinds model → Blocks → list of
symbols → MathType parity. The design documents are updated accordingly.

### List of symbols — built (0.1.137)

As approved, with your two corrections. Definitions `\define{symbol}{meaning}[unit]` become hidden fields (as
the numbering markers; no content control) — the self-test types, presses Backspace and Delete, pastes and cuts
right before and after one, and pastes a paragraph holding one, checking that no text goes inside, nothing is
duplicated except the pasted copy (reported by the checks as defined twice) and nothing is lost. Define symbol…
in both editors; the table inserted or updated in one Ctrl+Z from the ribbon's "List of symbols" (now this list)
or Ctrl+K; Settings → List of symbols with a preview; checks with Define… / Go to / Ignore. `\define` is in
LATEX-INTERCHANGE.md. The earlier equation-made list stays as "Older list…" (its typed descriptions are not
turned into definitions automatically).

### Blocks — built (0.1.136)

Built on the kinds model, as approved with your four additions: the Blocks tab (tiles in the document style,
search, groups, "This document"), the floating editor's Blocks flyout and Save as block button, blocks in
the palette search, Ctrl+K and the cheat sheet; Space through slots with the label of each empty slot under
it and "slot 2 of 3: frame" in the status line; repeated slots updated as you type; slot kinds `#v:pvec`;
Save as block from the editor, the floating editor, a library equation or the template dialog; blocks for
all documents or stored in one document; export/import. Checked in the browser (screenshots) and by the
headless editor check; Word self-test section *Blocks*. Not built: pinning a block to Quick access.

### Kinds model — built (0.1.135)

- **Model** (math-core): token kinds + wrapper kinds; document style v2 (`kinds`, `notation`, `symbols`,
  `global`); `explainSymbol` (kind and reason for any letter); explicit forms `\unit`, `\const`, `\variable`,
  `\operator`, `\lbl`, `\ctr` (triggers `;un`, `;cs`, `;vr`, `;op`, `;la`, `;ct`).
- **Migration:** every v1 style reads as v2 and draws exactly as before — checked against a golden file
  written by the previous code (57 styles: every preset × classifications × notation presets, and special
  cases; 17 generic equations; drawn LaTeX, Word output, SVG and style hash all identical). Pictures drawn
  before keep their fingerprint, so nothing shows as outdated.
- **Rules:** token-kind rules give the shape; wrapper-kind rules draw the symbol as that kind; conditions on
  bold and place; subscripted symbols.
- **Document style page:** one table of kinds (new Units row), the wrapper kinds' notation preset, a
  Symbols section (add / remove rules).
- **Editor:** hover tells each letter's kind and why; right-click → *Kind of x ▸* → this occurrence (writes
  the macro), this document (rule, redraw, one Ctrl+Z), every new document (your default).
- **Check style:** proposed rules (always-bold letter → vector/matrix when bold; e only as a power base →
  constant), *Accept rule* / *Reject*. Review kinds suggests `\unit` for hand-written units.
- **Checks:** unit tests (rules, explain, units, proposals, migration golden), CI headless check of the
  hover in the real editor, kinds round trip (4175 cases), snippet check; Word self-test section
  *Kinds model* (v1 migration, proposals, a rule redraws with the LaTeX unchanged and one Ctrl+Z, the rule
  stored in the document, hover, `\unit` in Word).

Next: Blocks, rebased from `wip/blocks` onto this model (slot kinds `#v:pvec`, font commands stripped in
Save as block), then the list of symbols.

### Earlier this plan

#### Measured visual comparison with MathType

- **Self-test section** "Visual comparison with MathType": you choose a Word document with MathType
  equations (a file picker; Cancel skips); it never leaves your PC. For each equation: its LaTeX from the
  MTEF, MathType's own preview picture (the WMF in the document) drawn with the real fonts' outlines, and
  MathBlocks' drawing of the same equation at MathType's own size (read from the picture's fonts) in the
  current document style; both on the baseline (MathType's lowering from the document), left ink edges
  aligned, overlaid; a difference score (0 = the same ink, 100 = nothing in common, 1 px tolerance at
  4 px/pt).
- **Report**: mathtype-compare/report.html in the self-test folder: categories (radicals, fractions,
  scripts, accents/harpoons, delimiters, matrices, large operators, spacing) with mean and worst scores,
  each sorted worst first, MathType / MathBlocks / overlay images (red = only MathType, blue = only
  MathBlocks). **report.txt gets only the category scores** — send me those and a generic description of
  what looks off; I fix the worst categories round by round.
- **CI**: tools/mt-compare-check.ts builds a synthetic MathType document (generic equations; previews written
  as WMF from MathBlocks' drawing, one as WMF text, one lowered by 2 pt) and runs the same code: the faithful
  ones score 0–2.4, the lowered one 56 (its 2 pt baseline shift measured).
- I could not try it on a real MathType picture here (the only MathType object left in your converted
  chapter is the empty one); equations whose picture cannot be read are listed as skipped in the report.

#### Writing speed

- **Suggestions from the document**: after a letter that starts a token, a small bar under the caret
  offers the forms of that symbol the open document already uses — kinds with frames and scripts, letters
  with their usual subscripts — most used first, as tiles with their counts; Tab or a click takes one (the
  letter is replaced), Esc or typing on leaves them. Greek by the Symbol keyboard: w → ω, q → θ. Without
  Word, the library's equations. Settings → Editor behaviour → "Suggestions from the document" (on).
  Checked in the browser: `a+w` offered the three ω forms, Tab gave `\pvec{\omega}`.
- **Speed benchmark** (Settings → Benchmark): ten generic equations (fraction, integral with limits, sum,
  matrix product, vectors with frames, DCM, root, multi-line derivation, limit, cross products), one at a
  time; the clock starts at your first key and stops when the equation is right (or Done); keys counted;
  results saved on this PC with the best times; a column for your MathType times. The set is in
  [BENCHMARK.md](BENCHMARK.md); I record your results there when you send them.

### Print check: your first run (0.1.130, 13 Nov 13:34)

Convert LaTeX wrote all 450 entries inline and as display equations (900 equations, 164 s) and the 44
page images were saved; the contact sheet was not, because the add-in's file writer required binary data
even for the text file (fixed). Your PDF holds only the generic palette, so I ran the analysis on it here
(tools/print-check-analyse.ts) and fixed what it showed about the check itself:

- Word splits marker text across PDF text pieces ("D2" + "80"): markers are now read on whole lines (three
  display equations were reported empty because of this);
- a tall inline equation (a matrix, cases) rises above its line into the band searched for the display
  equation above it: the band now stops at the next line's real ink (the matrices' display crops were wrong);
- spaces (\quad, \,) print nothing, correctly: no longer flagged "empty";
- the check now uses the size the pictures are drawn at (the document style's), not the setting.

With these, structures (fractions, roots, operators, matrices, fences, accents, kinds) print at the same
widths as drawn; the remaining flags here come from this machine's substitute fonts (Liberation, Standard
Symbols) and need the run on your PC with Times New Roman and Symbol. Please run the self-test again:
print/contact-sheet.html will be written this time.


**Editor and floating editor (your eight priorities).** Self-test of 0.1.126 (13 Nov, 11:36): 0 failures.

1. **Right-click → floating editor** for equation objects (Word honours Cancel there); the ☰ button in the
   floating editor shows the MathBlocks equation menu (cut, copy, paste, delete, number, copy LaTeX). Word's
   picture-menu items remain only as the fallback for older pictures, where Word ignores Cancel. Self-test check.
2. **Floating editor:** 900×580 by default; resize from any edge or corner; size and position remembered per
   screen; placed below, above, right or left of the equation (the first that leaves it uncovered), or where you
   left it on that screen if that leaves it uncovered; minimum 560×360. Placement is unit-tested; the frameless
   resizing itself can only be tried on Windows.
3. **Space through the slots**, Shift+Space back; after the last slot the caret leaves the structure; in \text{}
   Space types a space; Space Space opens the palette only outside every structure; Ctrl+K anywhere. Sheet,
   placeholder and floating-editor hint updated.
4. **Backspace:** the cause was not only the whole-kind rule. Deleting something that fills a slot (a kind
   inside \left(…\right), inside a root, alone in a matrix cell) is widened by the editor itself to the structure
   around it — and, when that structure is the whole equation, to everything. The old kind rule erased the whole
   equation at 3 of 157 caret positions in the check set. New rule: one character; a structure or kind is selected
   first and the second Backspace deletes exactly it, the slot staying; Ctrl+Z restores. Checked in the real editor
   at every caret position of 16 equations (157 positions), each followed by Ctrl+Z, in CI.
5. **Editor area** follows the window and the side panels (the field was fixed at 560 px; measured 676 → 1040 →
   1294 px as the symbols and library close).
6. **Print check** (self-test): every palette entry inline in a sentence and as a display equation, Word's PDF
   rendered to page images in the test folder (print/page-NNN.png) and an HTML contact sheet
   (print/contact-sheet.html: tile, inline, display, flags). The analysis was checked here on a PDF with planted
   defects (empty, enlarged, off the baseline, cut in half): exactly those were flagged.
   **Square root:** rebuilt as MathType draws it — Symbol's radical with Symbol's own extender bar (same
   thickness and height as the sign's stroke where it ends, so no step at the join); √x, √2, √(a+b) share one
   height; the bar clears the contents' ink (a harpoon included); the index sits over the short arm. I have no
   MathType here to put the two side by side: please compare a MathType √x with ours in Word (see below).
7. **Word preview window** (Ctrl+Alt+P, ◫ in the main toolbar and the floating editor): the equation exactly as
   Word gets it, true size, zoom 50–800 %, line-width and baseline guides, live as you type. The small box in the
   Word style tab is gone (a button there opens the window).
8. **Settings window** (⚙ in the main toolbar and the floating editor; Ctrl+K → Settings): Word style, document
   style, notation kinds, accents, numbering, snippets and shortcuts, palette, editor behaviour, Word connection
   and add-in, backups, updates, screenshot to LaTeX (API key), with a search. The old settings dialogs are its
   pages; every old link opens the right page; the Word style tab left the bottom panel. Checked in the browser:
   every page renders, the search finds settings by name, a page's own Close closes the window.


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

- **List of symbols** (new): self-test section *List of symbols*. Then in a copy of a chapter: add a few
  `\define{…}{…}[…]` after the sentences that introduce symbols (or right-click a letter → Define…), Convert
  LaTeX, ribbon → List of symbols → Insert the list; Settings → List of symbols (groups, columns); add a
  definition and Update the list; look at the checks.

- **Blocks** (new): self-test section *Blocks*. Then: select part of an equation → right-click → Save the
  selection as a block → pick the slots, give it a trigger; insert it from the Blocks tab, from the palette
  search and with `;trigger` Tab; fill with Space; a slot used twice; right-click an equation in Word →
  floating editor → Blocks flyout and Save as block.

- **Kinds model** (new): self-test section *Kinds model*. Then on a copy of a converted chapter: Document
  style → check that nothing changed (the look and Check style's "older drawing" count should be as before);
  hover letters in the editor; add a rule (right-click a bold vector letter → Kind ▸ → physical vector → In
  this document) and watch the document redraw; Check style → the proposed rules.

- **Blocks**: read [BLOCKS-DESIGN.md](BLOCKS-DESIGN.md) and answer the seven decisions (or "as recommended").
- **Self-test**: the print check writes print/contact-sheet.html now; the new section "Visual comparison with
  MathType" asks for a document — choose one with many MathType equations and send me the category scores
  from report.txt.
- **Suggestions**: open a document, type a letter you use as a vector or with an index; Tab.
- **Benchmark**: Settings → Benchmark → Start; time the same ten in MathType and type the seconds in.

0. **Editor round:**
   - right-click a Classic equation → the floating editor (no Word menu); ☰ there → cut / copy / paste / delete;
   - resize the floating editor from an edge and a corner, close it, right-click again: same size and place
     (unless that would cover the equation);
   - Space through a fraction, a sum with limits, a root with an index, a 2×2 matrix; Shift+Space back;
   - Backspace through an equation with kinds inside parentheses: nothing ever disappears at once;
   - close the library and symbols: the editor field widens;
   - self-test: the new section "Every palette entry … as it prints" (it takes a few minutes), then open
     print/contact-sheet.html in the test folder and look at the flagged rows;
   - square root: insert √x with MathType next to MathBlocks' √x in the same paragraph and compare;
   - Ctrl+Alt+P: the preview window, zoom, guides, typing updates it;
   - ⚙: every page; the old links (Document style → Accents…) open the right page.
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

1. MathType parity (FEATURES.md), as planned.
2. MathType parity and beyond (FEATURES.md), in order: handwriting pad, accessible alt text, rich clipboard,
   context-aware quick-style bar, entry points in Word, higher-fidelity MathType conversion, export one
   equation as PDF.
3. The look of individual symbols (owner's request, after functionality).

The one-day trial checklist is in [TRIAL-CHECKLIST.md](TRIAL-CHECKLIST.md).

## History

- **0.1.133** — Blocks design for approval; measured comparison with MathType; suggestions from the document; speed benchmark; print-check fixes.
- **0.1.130** — Editor round: right-click opens the floating editor; resizable floating editor; Space through slots; Backspace never erases more than one thing; editor fills its area; print check of every palette entry; radical as MathType draws it; Word preview window; one settings window.
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
