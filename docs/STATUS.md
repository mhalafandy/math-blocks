# Status

Updated at the end of every round. This repository is public: everything here is generic — nothing from
the owner's thesis or documents (no equations, text, file names or statistics from them).

## Current build

- **Published:** 0.1.112 (commit `cb9275b`), CI passed. This round's fix is building as the next build.

## Root cause: the "text loss" in the 0.1.108 self-test

No text was lost: the script that read the saved .docx mistook Word's tab element for a text element and
skipped the text after each tab. The saved test documents of 0.1.108 and 0.1.110 hold both paragraphs complete,
and the self-test's own re-scan found them intact. The text guard (0.1.112) stays as a safety net.

## This round

**Fix after the 0.1.112 self-test: equation numbers still read without their opening bracket.**

- Reading a number walks its button field's code; for a nested field without a result part (the hidden
  counter in front of the bracket), Word reports an empty result just past the field, and the walk skipped
  one character — the bracket. The walk now checks for the field's separator first. This is the cause of the
  remaining failures in "One numbering scheme", Insert reference and Repair's reference check.
- Self-test: the undo checks now compare equation numbers too (the Update numbers check saw no change only
  because numbers are fields, not document text — the command itself worked: "1) 2)" → "2) 3)"); the text-guard
  probe now finds a letter to delete; a diagnosis line shows how MathType's numbers read.

**Commits:** this round's commit "Fix number reading (nested field without result)".

## What to test (next build)

1. **Self-test.** Expected:
   - Insert reference / Repair: "reference shows the equation's number": PASS (numbers read as "(2)", not "2)").
   - "One numbering scheme": renumber (A.1)–(A.3) → (A.1.1)–(A.1.3); the pasted section adds (A.1.4), (A.2.1);
     all references right; "keep" leaves (A.1)–(A.3). If it fails, send the line "how MathType's numbers read
     (diagnosis)".
   - "text guard: a change that touches text outside the equations is undone automatically": PASS.
   - "Update numbers: one Ctrl+Z undoes it": PASS.
2. **Convert numbering on a copy of the thesis** (ribbon → Convert numbering → renumber): check the old → new list.

## Last self-test analysed

**0.1.112:** 207 checks — 175 passed, 16 failed, 16 for information; spike 123 checks, 0 failed.

- Passed: text guard — no false alarm on the interchange conversion or on Convert numbering; the interchange
  conversion with the missing-section-marker error; the equation after a new section marker is in section A.3.
- Failures and causes:
  - 13 checks: numbers still read as "A.1)" (one character skipped after the hidden counter) — fixed.
  - "Update numbers: changed the document": the check compared document text only; numbers are fields. The
    diagnosis showed the numbers did change ("1) 2)" → "2) 3)") — the check now compares numbers too.
  - "text guard: …undone automatically": the probe found no paragraph to change (it skipped every paragraph
    with an equation) — fixed.
  - "An equation after the new section marker is numbered (A.3.1)": numbered A.3.1 correctly; only the
    bracket was missing in the reading — fixed with the above.

## Waiting for the owner

- Self-test of the next build; Convert numbering on a thesis copy.
- No open decisions.

## Known problems

- Writing equations into Word takes about 0.3 s per equation (150 equations ≈ 45 s); could be optimised.

## Next

1. Owner's results; fixes if needed.
2. Embedded-object build step 5 (menus and clicks) and step 6 (self-test fully on objects: tracked changes,
   undo/redo, per-user class registration, PDF from Word and Acrobat).
3. Checklist for a one-day trial on a copy of a real chapter.
4. Then: Priority 2 → 1c → Accents page → MathType parity (see FEATURES.md).

## History

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
