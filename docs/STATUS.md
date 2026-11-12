# Status

Updated at the end of every round. This repository is public: everything here is generic — nothing from
the owner's thesis or documents (no equations, text, file names or statistics from them).

## Current build

- **Published:** 0.1.113 (commit `e068bd6`), CI passed. This round's build: pending CI (see the next update).

## Root cause: the "text loss" in the 0.1.108 self-test

No text was lost: the script that read the saved .docx mistook Word's tab element for a text element and
skipped the text after each tab. The saved test documents of 0.1.108 and 0.1.110 hold both paragraphs complete,
and the self-test's own re-scan found them intact. The text guard (0.1.112) stays as a safety net.

## This round

**Notation kinds on conversion, and a review dialog to fix a document's notation quickly.**

- Convert MathType now writes notation kinds wherever the older form is unambiguous: arrowed lowercase
  letters → `\pvec` (with frames such as `_{A/B}` as its option), arrowed bold capitals → `\vectrix`
  (`I`, `J`, double arrows → `\dyadic`), hatted bold letters → `\bvec`, transposes → `^{\T}`; it also
  repairs broken double primes and makes bold punctuation and bold digits plain.
- New command **Review notation kinds** (Ctrl+K): lists each older form found in the open document with a
  count and two examples before → after, ticked by default when it is a suggestion (bold lowercase → column
  matrix, bold capital → matrix, labels in indices upright, body letters plain). Two rules are offered
  unticked: `[\mathbf{A}\mathbf{B}]` → `\dcm{A}{B}` (the kind draws its own brackets style) and bold letters
  without a hat → unit vector. Nothing is written before Apply; one Ctrl+Z undoes it; backup as usual.
- Fixes after the 0.1.113 self-test: references by number picked MathType's twin bookmark (`…N`); the
  text-guard probe changed a field code instead of text.
- The look of individual symbols is left for later, once the functions are settled (owner's request).

**Commits:** this round's commit "Notation kinds on conversion; Review notation kinds".

## What to test (next build)

1. **Self-test.** Expected: all checks pass, including
   - "Apply notation kinds: the older forms became kinds" and its one-Ctrl+Z check;
   - "text guard: a change that touches text outside the equations is undone automatically";
   - "references to old and new equations".
2. **Review notation kinds on a copy of the thesis** (Ctrl+K → Review notation kinds): check the counts and
   examples, untick anything unwanted, Apply; check a few equations; Ctrl+Z once should undo all of it.
3. **Convert MathType on a copy of an unconverted chapter:** converted equations should already use
   `\pvec`, `\vectrix`, `\bvec` and `^{\T}`.

## Last self-test analysed

**0.1.113:** 191 checks — 189 passed, 2 failed.

- Passed: number reading ("(A.1)" with its bracket), One numbering scheme, Update numbers' one Ctrl+Z.
- Failures and causes:
  - "text guard: …undone automatically": the probe deleted a letter inside a field code, which the guard
    does not compare — the probe now uses a paragraph of its own. Fixed.
  - "references to old and new equations": a reference by number used MathType's number-only twin
    bookmark — the shortest name is used now. Fixed.

## Waiting for the owner

- Self-test of the next build; Review notation kinds on a thesis copy.
- Open question: should `[\mathbf{A}\mathbf{B}]` become `\dcm{A}{B}` (unticked for now)?

## Known problems

- Writing equations into Word takes about 0.3 s per equation (150 equations ≈ 45 s); could be optimised.

## Next

1. Owner's results; fixes if needed.
2. Embedded-object build step 5 (menus and clicks) and step 6 (self-test fully on objects: tracked changes,
   undo/redo, per-user class registration, PDF from Word and Acrobat).
3. Checklist for a one-day trial on a copy of a real chapter.
4. Then: Priority 2 → 1c → Accents page → MathType parity (see FEATURES.md).

## History

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
