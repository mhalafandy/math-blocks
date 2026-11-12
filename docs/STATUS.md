# Status

Updated at the end of every round. This repository is public: everything here is generic — nothing from
the owner's thesis or documents (no equations, text, file names or statistics from them).

## Current build

- **Published:** 0.1.116 (commit `e5512d2`), CI passed — the document style round.

## Root cause: the "text loss" in the 0.1.108 self-test

No text was lost: the script that read the saved .docx mistook Word's tab element for a text element and
skipped the text after each tab. The text guard (0.1.112) stays as a safety net.

## This round

**Change of approach: styling is a per-document choice. The equation source stores meaning; the
document's style decides the look at render time.** No command forces a look into the LaTeX any more.

- **Render-time style** (math-core `docStyle.ts`): a style pass before drawing gives each letter its
  shape from the style — index labels, index variables, numbers, Latin/Greek variables, d (detected in
  derivatives and integrals), e (exponential), i (when classified), π, function names, text, transpose
  mark, bold scope, accents over bold letters; notation kinds as before. Letters written with an explicit
  style keep it. The "MathBlocks default" style draws exactly as before, so existing documents do not change.
- **Stored in the document** (Custom XML Part `urn:mathblocks:style:v1`); documents without one are drawn
  in the user's default (made from the earlier settings). The style is read at the start of every
  operation that draws, and when Word connects.
- **Document style… page** (ribbon → Style, Word style tab, Ctrl+K): one setting per category with a live
  preview; presets (MathBlocks default, MathType Classic, ISO 80000-2, physics/engineering, pure
  mathematics, chemistry-friendly); save/export/import presets; save as my default; copy style from another
  open document; the classification of single-letter indices with the reason for each proposal.
- **Check style**: forced \mathrm/\mathit, bold in indices, an index written two ways, a letter in several
  forms, older drawings — conform (one Ctrl+Z) or keep as exception. **Apply style to document**: redraw all.
- **Existing commands keep meaning:** Review notation kinds' "upright labels" rule replaced by "plain
  indices" (also on conversion); Convert MathType/LaTeX drop forced index looks; transposes become the
  transpose kind; Normalize bold only removes bold. docs/LATEX-INTERCHANGE.md updated.
- **Native equations:** when the style changes how one is drawn, its source is kept in the registry (as for
  kinds), so reading it back never turns a look into LaTeX.

**Commits:** this round's commit "Document style: looks per document, meaning in the LaTeX".

## What to test (0.1.116)

1. **Self-test.** Expected: all checks pass, including the new section "Document style":
   - "Restyle (index labels upright / italic)": LaTeX unchanged, every equation drawn in the new style,
     one Ctrl+Z each, Ctrl+Y redoes;
   - classification: i → index variable, t → variable, q → undecided;
   - Check style lists the forced \mathrm on an index and on a symbol and the index written two ways;
     "keep as exception" removes it from the list; Conform removes the forced looks (one Ctrl+Z);
   - preset exported and imported into a second document: identical drawings.
   Please avoid clicking in Word while the self-test runs (a window that comes forward can make checks read
   the wrong document; the self-test now brings its document back, but it still slows the run).
2. **On a copy of a converted chapter:** ribbon → Style → Document style…: pick a preset or set index labels
   upright, classify the single-letter indices (check the proposals and reasons), Save and redraw. Expected:
   every equation redrawn, the LaTeX unchanged (double-click one), one Ctrl+Z undoes the redraw.
3. **Check style** on the same copy: review the list; conform a few, keep one as an exception, run again.
4. **Copy style from…**: open a second document, copy the style, Save and redraw.

## Last self-test analysed

**0.1.115** (run before 0.1.116 was published): 214 checks — 188 passed, 6 failed, 20 for information;
embedded-object spike 123 checks, 0 failed.

- "Normalize bold" and "Change notation (transpose form)": changed nothing. In 0.1.115 the notation-kinds
  step rewrote every equation of the test document, including the bold spread and the transpose these two
  checks use. Already fixed in 0.1.116 (the kinds step touches only its own equation).
- "keep the existing numbers" and "keep: references unchanged": the numbers read, (A.1.1)…(A.2.1), are
  those of the other test document (numbering test.docx), and the conversion itself passed its checks
  (in front, one Ctrl+Z). After undo/redo another Word document was in front, so the checks read the wrong
  document. The self-test's own calls do not switch documents and the same code passed in 0.1.114, so a
  window came forward from outside the test. Fix: after every undo/redo the self-test brings its document
  back to the front and notes it (for information) when another one was in front.
- "a second Repair changes nothing" and "after Repair the number ends at the right margin again": the same
  cause (they ran on another document after Ctrl+Y). The Repair checks now bring their document to the front.

## Waiting for the owner

- Self-test of the next build; the Document style page on a copy of a real chapter.
- No open decisions.

## Known problems

- The visual editor (MathLive) shows letters in its own convention while typing; the Classic preview under
  it and every drawing in Word use the document style.
- After Ctrl+Z of a restyle, the drawings go back but the stored style stays the new one: Check style lists
  them as drawn in an earlier style, and Apply style redraws them.
- The font is Times New Roman with Symbol (Classic); choosing another font is not available yet.
- Writing equations into Word takes about 0.3 s per equation (150 equations ≈ 45 s); could be optimised.

## Next

1. Owner's results; fixes if needed. The look of individual symbols (owner's request, after functionality).
2. Embedded-object build step 5 (menus and clicks) and step 6 (self-test fully on objects: tracked changes,
   undo/redo, per-user class registration, PDF from Word and Acrobat).
3. Checklist for a one-day trial on a copy of a real chapter.
4. Then: Priority 2 → 1c → Accents page → MathType parity (see FEATURES.md).

## History

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
