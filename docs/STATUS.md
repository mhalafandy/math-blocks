# Status

Updated at the end of every round. This repository is public: everything here is generic — nothing from
the owner's thesis or documents (no equations, text, file names or statistics from them).

## Current build

- **Published:** 0.1.120 (commit `6b820b6`), CI passed — bold Greek calibrated by darkness.

## Window switching (0.1.115 self-test): cause

Settled by the 0.1.119 self-test: with the add-in recording every Word window activation and the MathBlocks request
during which it happened, a full run recorded **no** window that came forward outside the self-test's own steps,
and with two documents open none of ten operations (insert, Update numbers, Convert LaTeX and Apply style with their
progress windows, Repair, restyle, Check style, status message, Ctrl+Z, Ctrl+Y) changed the document in front. Every
MathBlocks path that can activate a window was also reviewed (see 0.1.118 notes in the history). The switch in 0.1.115
therefore did not come from MathBlocks — most likely something outside the test (a click, another program). The
recording stays in the add-in and in the self-test, so a recurrence will name its cause.

## This round

**Bold Greek looked heavier than bold Latin (owner, on 0.1.119).** The first calibration matched the stem of
Times Bold capital "I" (0.159 em against Symbol's 0.094 em), then thickened every stroke of the Greek letter by the
same amount — hairlines included. Real bold thickens stems much more than hairlines, so the Greek came out darker.
Measured on Times-metric fonts: matching the stem needs 0.033 em per side, matching the overall darkness of Times
Bold lowercase only 0.014 em. Now the offset is calibrated by **darkness** (ink per advance width over lowercase
letters): bold Greek is made exactly as much darker than regular Greek as Times Bold is darker than Times (Bold
Italic than Italic), found by a few steps on the real emboldened outlines, on this PC's fonts. The comparison sheet
and the self-test show both darkness figures.

**Commits:** this round's commit "Bold Greek: calibrate by darkness, not the capital stem".

## What to test (0.1.120)

0. **Bold Greek (recalibrated):** Ctrl+K → "Bold Greek comparison sheet": bold Greek should now look as heavy as
   the bold Latin letters next to it, at 12 and 10 pt (lighter than in 0.1.119). The self-test section "Bold Greek" checks the stroke weight and saves
   "bold greek sheet.docx": please compare it with the same letters made bold in MathType.

1. **Self-test** (please don't click in Word while it runs). Expected: all checks pass, including
   - "Document style": restyle labels upright / italic — drawn in the new style, one Ctrl+Z each;
   - "My styles": create from blank, rename, duplicate, delete, export/import → identical drawings, built-in
     styles unchanged, your own styles as before;
   - "Two documents open": every operation keeps the worked-on document in front; Ctrl+Z / Ctrl+Y of a restyle
     restore the stored style, Check style lists nothing;
   - "Window activations": send the line — it tells whether anything outside the test brought a window forward.
2. **Document style page on a copy of a converted chapter**: New style… (from a preset or blank, name it), set it
   up, Save style, Save and redraw; Ctrl+Z in Word, then reopen the page: the previous style is shown again.

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
