# Status

Updated at the end of every round. This repository is public: everything here is generic — nothing from
the owner's thesis or documents (no equations, text, file names or statistics from them).

## Current build

- **Published:** 0.1.108 ("Latest test build" release, auto-update), from commit `7ace627`.
- **CI:** passed (tests and type check; Windows build of the desktop app and the Word add-in).

## This round

**One numbering scheme per document: Convert numbering (MathType → MathBlocks).**

- MathType's numbers (SEQ MTEqn/MTSec/MTChap) and MathBlocks' (SEQ MBEq/MBSec/MBChap) count separately, so new
  MathBlocks numbers did not continue MathType's in a combined document. Convert numbering (ribbon → Convert
  numbering, or Ctrl+K) turns MathType's breaks into MathBlocks markers and its numbers into MathBlocks number
  fields, keeping each number's bookmark, so every reference stays on its equation.
- Choice: keep the existing numbers, or renumber to (chapter.section.equation) with a section marker after
  each section heading (number read from Word's numbering or the heading text, e.g. "A.1 Frames").
- Before anything is written: the full old → new list (copyable) and the problems (missing or unnumbered
  section headings, numbers that skip, counters reset by hand, breaks without equations), with snippets.
  One Ctrl+Z, backup first, the document stays in front; every number is checked afterwards.
- Convert LaTeX: refuses to add numbers while MathType's numbering is still there (button "Convert numbering
  first"); `\eqref{eq:A.1.3}` resolves to an equation already in the document that shows (A.1.3); a new label
  repeating an existing number is an error.

**Also this round (corrections to the LaTeX interchange):**

- Numbers are (chapter.section.equation) / (letter.section.equation); the counter restarts per section.
  `\mbnumbering{3.2}` / `{A.1}` after each section heading.
- Labels may be the equation numbers (`\label{eq:3.2.5}` → bookmark `_MBEq_3_2_5`); warnings for labels whose
  number differs or does not fit the markers, and for missing section markers.
- `\hat{s}_1`, `\hat{\mathbf{s}}_1`, `\mathbf{\hat{s}}_1` → `\bvec{s}_1`; a frame with a subscript is reported;
  Hughes preset dyadic drawn with a single arrow.
- Section marker command (ribbon, Ctrl+K), prefilled from the marker before the cursor.
- Update numbers lists references to equations that no longer exist, with the text around each.
- Self-test fixes: the Normalize bold and Update numbers undo checks now have something to change.

**Commits:** `00c6d64` (whole-document Convert LaTeX), `41d4553` (three-level numbering, section markers,
labels as numbers), `f100e12` (self-test fixes), `7ace627` (Convert numbering).

## What to test (0.1.108)

1. **Self-test** (MathBlocks ribbon → Run Word self-test). Expected:
   - "One Ctrl+Z for each whole-document operation": all PASS, including Normalize bold and Update numbers.
   - "Convert LaTeX: interchange convention document": three-level numbers — (3.1.1), (3.2.2), (4.0.1) with a
     "missing section marker" warning, (A.2.1); references right before and after Update numbers; after
     inserting an equation in section 3.1 the later numbers shift and references follow; the Section marker
     check numbers the next equation (A.3.1); deleting a referenced equation makes Update numbers list it.
   - "One numbering scheme": renumber (A.1)–(A.3) → (A.1.1)–(A.1.3), references follow; the pasted section adds
     (A.1.4) and (A.2.1); after Update numbers every number is correct and unique; "keep" leaves (A.1)–(A.3).
   - Send the self-test folder.
2. **Convert numbering on a copy of the thesis:** ribbon → Convert numbering → "renumber to
   chapter.section.equation". Before confirming, read the old → new list and the problems; "Copy the list"
   for numbers written outside the document. Expected: every number in the new format, references unchanged
   in meaning (they follow their equations), one Ctrl+Z undoes it. Report anything the list gets wrong (for
   example a section heading without a readable number).
3. **Optional:** Convert LaTeX on a copy of a transcribed page; copy the pre-flight report.

## Last self-test analysed

**0.1.105** (run before this round's changes): 175 checks — 159 passed, 2 failed, 14 for information; the
embedded-object spike 123 checks, 0 failed.

- Passed, newly: Repair is one Ctrl+Z (Word kept the undo record); Convert MathType, Change notation and
  Convert LaTeX one Ctrl+Z each; the interchange conversion of the convention document (counts, errors
  listed, bookmarks and numbers, references before/after Update numbers, number at the right margin,
  centring, inline baseline, second run).
- Speed: 150-equation document converted in 37.6 s — about 250 ms per equation (building 1.5 s in the app,
  36 s inserting in Word).
- Failures (both in the test set-up, fixed in `f100e12`): "Normalize bold: changed the document" — the test
  equation was already normalised (the parser keeps bold on the base letter); "Update numbers: changed the
  document" — the helper that makes numbers stale missed the counter nested in the number field.

## Waiting for the owner

- Results of the 0.1.108 self-test and of Convert numbering on a thesis copy.
- No open decisions.

## Known problems

- Writing equations into Word takes about 0.24 s per equation (150 equations ≈ 36 s); could be optimised later.
- After re-enabling the add-in with Word open, already-open documents may need to be activated once (fix in
  0.1.104 — re-activates each window; confirm with the manual check in the self-test report).

## Next

1. Owner's results for 0.1.108; fixes if needed.
2. Embedded-object build step 5 (menus and clicks) and step 6 (self-test fully on objects: tracked changes,
   undo/redo, per-user class registration, PDF from Word and Acrobat).
3. Checklist for a one-day trial on a copy of a real chapter.
4. Then: Priority 2 (own notation kinds, quick-style bar, bold Greek, upright frame labels) → 1c → Accents
   page → MathType parity (see FEATURES.md).

## History

- **0.1.105** — Whole-document Convert LaTeX (interchange convention, pre-flight report, numbers, label
  bookmarks, references, markers, one Ctrl+Z); generated docs/LATEX-INTERCHANGE.md.
- **0.1.104** — One Ctrl+Z for Convert MathType, Convert LaTeX, Update numbers; self-test checks for every
  whole-document operation; add-in attaches to open windows when enabled mid-session.
- **0.1.103** — Repair reads Word's XML before its undo record opens (Word ends the record on any XML read).
- **0.1.102** — Self-test saves and closes its documents; no redraw during long operations.
- **0.1.101** — Repair restores numbered paragraphs' style (custom tab stops only).
- **0.1.99–0.1.100** — Repository history cleaned of private material; long operations keep their document in
  front.
