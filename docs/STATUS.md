# Status

Updated at the end of every round. This repository is public: everything here is generic — nothing from
the owner's thesis or documents (no equations, text, file names or statistics from them).

## Current build

- **Published:** 0.1.110 (commit `b7ff031`), CI passed. This round's fixes are building as the next build.

## This round

**Fixes after the 0.1.110 self-test.**

- Numbers were read without their opening bracket ("A.1)") when it followed a field switch directly; Convert
  numbering therefore still found no readable MathType number, and number comparisons (Insert reference,
  Repair, Number equation) failed. Fixed.
- Insert section marker left the cursor in front of the hidden marker, so the next equation went into the
  previous section. The cursor now goes after the marker.
- Self-test: broken-reference check adjusted to the snippet window; the Update numbers undo check now reports
  the numbers at each step (to find out why it sees no change).

**Commits:** the commit "Fix number brackets and cursor after section marker…" (this round).

## What to test (next build)

1. **Self-test.** Expected:
   - "One numbering scheme": renumber (A.1)–(A.3) → (A.1.1)–(A.1.3), no problems; MathType's references follow;
     the pasted section adds (A.1.4) and (A.2.1); after Update numbers: (A.1.1) (A.1.2) (A.1.3) (A.1.4) (A.2.1);
     references to old and new equations right; "keep" leaves (A.1)–(A.3).
   - "Convert LaTeX: interchange convention document": the equation after the new section marker is (A.3.1).
   - Insert reference / Repair: the reference shows the equation's number (these regressed in 0.1.110).
   - "Update numbers: the numbers (diagnosis)" — send the line if "Update numbers: changed the document" fails.
2. **Convert numbering on a copy of the thesis** (ribbon → Convert numbering → renumber): check the old → new
   list before confirming.

## Last self-test analysed

**0.1.110:** 204 checks — 173 passed, 16 failed, 15 for information; spike 123 checks, 0 failed.

- Now passing: inserting an equation in section 3.1 shifts the later numbers and references follow; the
  deliberate-error paragraphs are unchanged (the text missing in the 0.1.108 test document was an artefact of
  my script reading the saved file, not real damage); the broken-reference list finds the deleted equation.
- Failures and causes:
  - 13 checks (One numbering scheme, Insert reference, Repair's reference check): numbers read as "A.1)" —
    the opening bracket was taken as part of a field switch. Fixed.
  - "An equation after the new section marker is numbered (A.3.1)": the cursor stayed before the marker. Fixed.
  - "Update numbers lists the reference…": the list was right; the check looked for words outside the
    snippet window. Adjusted.
  - "Update numbers: changed the document": still no change seen; diagnosis added.

## Waiting for the owner

- Self-test of the next build; Convert numbering on a thesis copy.
- No open decisions.

## Known problems

- Writing equations into Word takes about 0.3 s per equation (150 equations ≈ 45 s); could be optimised.
- The Update numbers undo check sees no change in its test document (cause being diagnosed; the Update numbers
  command itself works — numbers shift and references follow in the interchange checks).

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
