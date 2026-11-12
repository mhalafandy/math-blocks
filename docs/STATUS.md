# Status

Updated at the end of every round. This repository is public: everything here is generic — nothing from
the owner's thesis or documents (no equations, text, file names or statistics from them).

## Current build

- **Published:** 0.1.122 (commit `951b069`), CI passed. This milestone's build (objects steps 5–6): pending CI.

## Window switching (0.1.115 self-test): cause

Settled by the 0.1.119 self-test: with the add-in recording every Word window activation and the MathBlocks request
during which it happened, a full run recorded **no** window that came forward outside the self-test's own steps,
and with two documents open none of ten operations (insert, Update numbers, Convert LaTeX and Apply style with their
progress windows, Repair, restyle, Check style, status message, Ctrl+Z, Ctrl+Y) changed the document in front. Every
MathBlocks path that can activate a window was also reviewed (see 0.1.118 notes in the history). The switch in 0.1.115
therefore did not come from MathBlocks — most likely something outside the test (a click, another program). The
recording stays in the add-in and in the self-test, so a recurrence will name its cause.

## This round

**Milestone: trial checklist, Priority 2, 1c, Accents page.**

- **One-day trial checklist:** [TRIAL-CHECKLIST.md](TRIAL-CHECKLIST.md) — preparation, converting the chapter,
  a day of writing, end of day (PDF from Word and Acrobat, print, reopen, another PC).
- **Priority 2:**
  - quick-style bar in the editor, replacing the bold popup: Bold, Italic/Upright, five accents, Make → kind;
    on a kind, Convert to plain and Edit kind style (checked in the browser preview: the bar appears after a
    pause and the harpoon button turns `x+r` into `x+\overrightharpoon{r}`);
  - frame-label shape per kind (follow the document style, italic, upright);
  - own kinds, bold Greek: done in earlier rounds.
- **1c:** already in place (one set of palette parts: search, Quick access, Recent, collections; the floating
  editor uses the same grid and search) — nothing new needed.
- **Accents page:** sliders for size, stroke, gap, barb angle, smallest gap, fixed/adaptive length; live preview
  at 12 and 10 pt on this PC's fonts; MathBlocks default / MathType-like; Save and redraw the document.
- Previous milestone (objects steps 5–6) is in 0.1.123.

Tests: unit tests for the quick-style actions, the frame-label shape and the accent rules reaching the drawing;
the bar was checked in the browser preview. These are editor and settings features, so the Word self-test has no
new section this round.

## What to test (next build)

1. **Self-test** (sections added in 0.1.123: the right-click menu; objects end to end).
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

- **0.1.124** — Trial checklist; quick-style bar; frame-label shape per kind; Accents page.
- **0.1.123** — Embedded objects steps 5–6: MathBlocks right-click menu; per-user class registration; self-test of undo/redo, Track Changes, PDF.
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
