# Status

Updated at the end of every round. This repository is public: everything here is generic — nothing from
the owner's thesis or documents (no equations, text, file names or statistics from them).

## Current build

- **Published:** 0.1.112 (commit `cb9275b`), CI passed — contains the text guard, the missing-section-marker
  error, and last round's fixes (number brackets, cursor after a section marker).

## Root cause: the "text loss" in the 0.1.108 self-test

**There was no text loss in the document.** The two paragraphs that looked shortened (in the convention test
document, after the later self-test steps) are intact in the saved files of both the 0.1.108 and the 0.1.110
self-tests, character for character as generated.

- Cause: the script I used to read the saved .docx matched Word's tab element (`<w:tab/>`) as if it were a
  text element, and in doing so skipped the start of the next text element of the same run — so everything
  after a tab in those paragraphs looked missing. Read with a correct extractor, both paragraphs are complete.
- Confirmed also inside Word: the 0.1.110 self-test re-scanned the document after all later steps and still
  found both deliberate errors in those paragraphs (check "the paragraphs with the deliberate errors are
  unchanged by the steps above": PASS).
- Safety net added anyway (it stays): the text guard below.

## This round

- **Text guard.** Every whole-document operation (Repair, restyle, Normalize bold, Change notation, rename,
  Convert LaTeX, Convert numbering, Convert MathType, Update numbers, Upgrade numbering) records the document's
  text outside equations, fields, Word equations and the ranges it is meant to change; afterwards it compares,
  and if anything else changed it undoes itself automatically and says where.
- **Missing section marker is an error.** With section numbering, a numbered equation before its chapter's
  first section marker is a pre-flight error and is not converted (it used to become (4.0.1) with a warning).
- Self-test: a probe that deletes a letter outside the equations inside an operation — the guard must undo it;
  the interchange and numbering conversions must raise no false alarm.

**Commits:** this round's commit "Text guard on whole-document operations; missing section marker is an error".

## What to test (0.1.112)

1. **Self-test.** Expected, in addition to last round's list:
   - "text guard: a change that touches text outside the equations is undone automatically": PASS.
   - "text guard: no false alarm on the conversion" and "…on Convert numbering": PASS.
   - Interchange pre-flight: 6 errors, 3 warnings; the equation before chapter 4's first section marker is an
     error and is not converted.
   - "One numbering scheme": renumber (A.1)–(A.3) → (A.1.1)–(A.1.3), the pasted section adds (A.1.4) and (A.2.1),
     all references right; "keep" leaves (A.1)–(A.3).
2. **Convert numbering on a copy of the thesis** (ribbon → Convert numbering → renumber): check the old → new
   list before confirming. If the text guard undoes it, send the message it shows.

## Last self-test analysed

**0.1.110** (analysed last round): 204 checks — 173 passed, 16 failed; causes fixed in 0.1.111 (number
brackets, cursor after a section marker, broken-reference snippet check). No newer report yet.

## Waiting for the owner

- Self-test of the next build; Convert numbering on a thesis copy.
- No open decisions.

## Known problems

- Writing equations into Word takes about 0.3 s per equation (150 equations ≈ 45 s); could be optimised.
- The Update numbers undo check sees no change in its test document; diagnosis line added (the command itself
  works — numbers shift and references follow in the interchange checks).

## Next

1. Owner's results; fixes if needed.
2. Embedded-object build step 5 (menus and clicks) and step 6 (self-test fully on objects: tracked changes,
   undo/redo, per-user class registration, PDF from Word and Acrobat).
3. Checklist for a one-day trial on a copy of a real chapter.
4. Then: Priority 2 → 1c → Accents page → MathType parity (see FEATURES.md).

## History

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
