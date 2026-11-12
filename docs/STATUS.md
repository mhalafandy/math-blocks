# Status

Updated at the end of every round. This repository is public: everything here is generic — nothing from
the owner's thesis or documents (no equations, text, file names or statistics from them).

## Current build

- **Published:** 0.1.117 (commit `3dd9aa3`), CI passed. This round's build: pending CI (see the next update).

## Window switching (0.1.115 self-test): what was checked, what is known

In 0.1.115 another Word document was in front after undo/redo, twice. Every path that can bring a Word window
forward was checked:

- **Progress window** (whole-document operations): the document's window is enabled again *before* the progress
  window closes, and the window that was in front is activated again after it — correct.
- **Confirmations and messages over Word**: owned by the active Word window, so closing them returns to it.
  Status-bar messages open no window.
- **Attaching to open windows** (when the add-in is loaded mid-session): activates every window once, then the one
  that was in front — runs only at that load.
- **The app**: no automatic path activates a Word document; "Go to equation" (symbol index) does, only when
  clicked.
- **Undo / redo in the self-test**: act on the active document only.

No MathBlocks path was found that activates another document during undo/redo, and in the 0.1.117 self-test no
switch happened. To settle it rather than assume: the add-in now records every Word window activation with the
MathBlocks request during which it happened (or "no MathBlocks request" — then it came from outside MathBlocks),
and the self-test reports them: a new section with two documents open checks after each operation that the one
worked on stays in front, and names the request if another came forward; a final line lists windows that came
forward not by a self-test step. **Open until the next self-test reports.**

## This round

1. **Window switching**: investigation above; activation recording; two-document self-test section.
2. **Restyle undo restores the stored style too.** Word's undo does not cover the Custom XML Part, so the stored
   style keeps a short history and the ID of one redrawn equation (probe). When the probe's drawing is in a
   different style than the stored one and that style is in the history (after Ctrl+Z or Ctrl+Y), the stored
   style follows it, with a status-bar note. The add-in tells the app when Word is idle after a selection change
   in such a document; every operation that reads the style checks too. A style changed but not yet redrawn has
   no probe, so it is never mistaken for an undo.
3. **My styles**: New style… (blank or from any style; name, description), rename, edit + Save style, duplicate,
   delete, set as my default, export/import; built-in styles read-only; the document shows its style's name,
   "…, modified" after changes.
- Fix after the 0.1.117 self-test: the restyle checks could not read the style fingerprint of embedded objects.

**Commits:** this round's commit "My styles, restyle undo, window activations".

## What to test (next build)

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

**0.1.117:** 240 checks — 213 passed, 4 failed, 23 for information; spike 123, 0 failed. No window switch.

- The 4 failures were the restyle checks "changed the document" and "drawn in the new style (0 of 5)": the
  restyle worked (σ_sf's size in Word changed both times, LaTeX unchanged), but the test equations are embedded
  objects and their style fingerprint was not read back from the object's data. Fixed.

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
