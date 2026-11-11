# Status

Updated at the end of every round. This repository is public: everything here is generic — nothing from
the owner's thesis or documents (no equations, text, file names or statistics from them).

## Current build

- **Published:** 0.1.109 (same code as 0.1.108; built from the status-file commit). This round's fixes are
  building now as the next build — see "What to test".
- **CI:** 0.1.109 passed.

## This round

**Fixes after the 0.1.108 self-test.**

- Equation numbers (MathType's and MathBlocks') are MACROBUTTON fields, which have no field result, so their
  text was read as empty. Effects: Convert numbering found no readable MathType number and changed nothing;
  "Number equation" reported an empty number; Convert LaTeX could not resolve references by number. Numbers
  are now read from the button's display text.
- Section marker inserted in an empty paragraph went into a new paragraph after the cursor (Word's XML
  insertion); it now stays at the cursor.
- Broken-reference list: the text around each reference reads as on the page (it showed field codes).
- Self-test fixes: the equations of a conversion are listed in document order (the "insert an equation in
  section 3.1" check put its equation in the wrong section); the Update numbers undo check now makes numbers
  out of date; new check that later test steps leave the paragraphs with the deliberate errors unchanged.

**Commits:** see the history of `docs/STATUS.md` and the commit after `779f808` ("Fix reading of equation
numbers…").

## What to test (next build after 0.1.109)

1. **Self-test.** Expected:
   - "One numbering scheme": renumber (A.1)–(A.3) → (A.1.1)–(A.1.3) with no problems; MathType's references
     follow; Convert LaTeX on the pasted section adds (A.1.4) and (A.2.1); after Update numbers the numbers read
     (A.1.1) (A.1.2) (A.1.3) (A.1.4) (A.2.1); references to old and new equations right; "keep" leaves (A.1)–(A.3).
   - "Convert LaTeX: interchange convention document": the insert check shifts (3.1.1) → (3.1.2) and the
     references follow; the equation after the new section marker is (A.3.1); the broken-reference snippet
     contains "Word artefacts"; the deliberate-error paragraphs are unchanged.
   - "One Ctrl+Z for each whole-document operation": Update numbers now changes the document and is one Ctrl+Z.
2. **Convert numbering on a copy of the thesis** (ribbon → Convert numbering → renumber): the old → new list
   now shows the real numbers. Check it before confirming; report anything wrong.

## Last self-test analysed

**0.1.108:** 203 checks — 173 passed, 15 failed, 15 for information; embedded-object spike 123 checks, 0 failed.

- Passed: the whole interchange conversion of the convention document — counts, 5 errors and 4 warnings
  listed, three-level numbers and label bookmarks, references within and across sections before and after
  Update numbers, number at the right margin, centring, inline baseline, one Ctrl+Z, second run; the Section
  marker finds the previous marker; Convert LaTeX waits while MathType's numbering is there.
- Speed: 150-equation document in 45.5 s — about 300 ms per equation (almost all inside Word).
- Failures and causes:
  - 11 in "One numbering scheme" and in "Number equation" results: numbers read as empty (MACROBUTTON has no
    result) — fixed.
  - "After inserting an equation in section 3.1…" (2 checks): test used the equations in reverse order — fixed.
  - "An equation after the new section marker is numbered (A.3.1)": number read as empty, and the marker landed
    after the cursor — both fixed.
  - "Update numbers lists the reference…": the list was right, but the snippet showed field codes — fixed.
  - "Update numbers: changed the document": the stale-numbers helper changed nothing — replaced.

## Waiting for the owner

- Self-test results of the next build; Convert numbering on a thesis copy (check the old → new list).
- No open decisions.

## Known problems

- Writing equations into Word takes about 0.25–0.3 s per equation (150 equations ≈ 40 s); could be optimised.
- In the 0.1.108 self-test two paragraphs of the convention test document lost part of their text during the
  later test steps (inserting equations at the end of the document); a new check reports whether this happens
  again, to find which step causes it.

## Next

1. Owner's results; fixes if needed.
2. Embedded-object build step 5 (menus and clicks) and step 6 (self-test fully on objects: tracked changes,
   undo/redo, per-user class registration, PDF from Word and Acrobat).
3. Checklist for a one-day trial on a copy of a real chapter.
4. Then: Priority 2 → 1c → Accents page → MathType parity (see FEATURES.md).

## History

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
