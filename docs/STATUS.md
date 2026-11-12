# Status

Updated at the end of every round. This repository is public: everything here is generic — nothing from
the owner's thesis or documents (no equations, text, file names or statistics from them).

## Current build

- **Published:** 0.1.120 (commit `6b820b6`), CI passed. This round's build: pending CI (see the next update).

## Window switching (0.1.115 self-test): cause

Settled by the 0.1.119 self-test: with the add-in recording every Word window activation and the MathBlocks request
during which it happened, a full run recorded **no** window that came forward outside the self-test's own steps,
and with two documents open none of ten operations (insert, Update numbers, Convert LaTeX and Apply style with their
progress windows, Repair, restyle, Check style, status message, Ctrl+Z, Ctrl+Y) changed the document in front. Every
MathBlocks path that can activate a window was also reviewed (see 0.1.118 notes in the history). The switch in 0.1.115
therefore did not come from MathBlocks — most likely something outside the test (a click, another program). The
recording stays in the add-in and in the self-test, so a recurrence will name its cause.

## This round

Fixes from converting a real chapter (owner's report; priority 2, 1, 4, 3, 7, 5, 6). Generic tests only.

1. **(2, blocker) Every MathType break becomes a marker.** Cause: a break took its chapter/section only from the
   first numbered equation after it; breaks in chapters or sections without equations were "left as they are",
   and in renumber mode the section headings after such a break got no markers either. Now each break is
   evaluated from its own SEQ fields (as Word does: \r n sets, no switch adds one, \c keeps), checked against
   the first number after it. Section headings without a break are listed in the pre-flight with a marker
   offered (on by default). After converting, any MathType numbering field left is listed.
2. **(1) Private-use characters.** MathType's MT Extra characters are mapped from MathType's character table
   (its dot operator → \cdot); anything unmapped stays MathType and is listed, never passed on silently.
   Bare commands now end with a space (\cdot followed by a letter made an unknown command).
3. **(4) The one object not converted** was an *empty* MathType equation (nothing in it), silently skipped.
   Now every equation that cannot be converted is listed with where it is (its paragraph, or the paragraph
   before when it is alone) before anything is written; after converting, the MathType objects left must be
   exactly those listed.
4. **(3) One reference mechanism.** Convert numbering turns MathType's GOTOBUTTON/REF references into MathBlocks
   references to the _MBEq_ bookmarks; each is verified to show its equation's number, then the ZEqnNum
   bookmarks are removed (kept and listed on any mismatch). (Before: "Update numbers" did refresh MathType's REF
   fields, as Word updates every REF; they now are MathBlocks references anyway.)
5. **(7)** Convert LaTeX accepts every form Convert MathType writes; the doc lists them from one table, and a
   test reads each back through Convert LaTeX to the same equation. The test found the parser rejected bare
   \langle, \rangle, \lfloor, \rfloor, \lceil, \rceil and \backslash — fixed.
6. **(5)** A "$" touching a converted equation is reported with its place. **(6)** ℤ ℝ ℕ ℚ ℂ → \mathbb{…};
   Greek capitals that look like Latin letters are reported.

**Commits:** "Convert numbering: every MathType break becomes a marker; references unified"; "Convert MathType:
nothing passes through silently".

## What to test (next build)

1. **Self-test** (please don't click in Word while it runs). Expected: all checks pass, including
   - "One numbering scheme": the converted numbers have MathBlocks bookmarks, MathType's references are now
     MathBlocks references, every one verified, MathType's bookmarks removed, no MathType numbering field left;
   - new step "chapters with empty sections": every break a marker (6), the heading without a break listed and
     marked, new equations numbered (2.2.1), (2.3.1), (3.1.1);
   - "Convert MathType: nothing passes through silently": the private-use dot becomes \cdot, the empty object is
     listed with where it is, and is the only MathType object left.
2. **On a fresh copy of the chapter** (from before any conversion): Convert MathType — the pre-flight lists what
   cannot be converted (expected: the empty object), then Convert numbering — every heading should end up with a
   marker (check the list of headings without a break), the result should say "No MathType numbering field is
   left" and that every reference shows its equation's number. Then add an equation in a later section and in
   the next chapter and check their numbers.

## Last self-test analysed

**0.1.119:** 272 checks — 245 passed, **0 failed**, 27 for information; spike 123, 0 failed. Two documents open:
every operation kept the worked-on document in front; no window came forward outside the test. Bold Greek: the
stem checks passed, but the result looked heavier than bold Latin (owner) — recalibrated by darkness this round.

## Thesis-copy results

Not received yet (the template lines for Convert numbering and Review notation kinds were sent unfilled).

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

1. Owner's results; fixes if needed. The look of individual symbols (owner's request, after functionality).
2. Embedded-object build step 5 (menus and clicks) and step 6 (self-test fully on objects: tracked changes,
   undo/redo, per-user class registration, PDF from Word and Acrobat).
3. Checklist for a one-day trial on a copy of a real chapter.
4. Then: Priority 2 → 1c → Accents page → MathType parity (see FEATURES.md).

## History

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
