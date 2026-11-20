# Status

Updated at the end of every round. Public repository: generic content only. Earlier rounds: `docs/status-archive/`.

## Latest round — 0.1.167

**Build:** 0.1.167 (test channel), CI: pending. Not promoted: the 0.1.166 self-test had 2 failures.

**Reports read:** self-test 16:07 (0.1.166: 437 passed, 2 failed; spike 99/0), thesis-size 17:23 (ran to the end, timeouts from the list of symbols on), soak 21:59 (failed after #75).

**Now passing in 0.1.166:** two documents open, every operation (10/10, the progress-window fix worked); "Convert LaTeX right after typing: one Ctrl+Z undoes it" (so typing was not the soak's cause).

**Thesis-size (0.1.166):** Convert LaTeX 1076 s, 694 ms per equation; Update numbers 567 s. From the list of symbols on, every step timed out (writeSymbolList, verifyMany, listInstances, listDefinitions); Save 1828 s; total 9252 s. After one timeout Word keeps working on that request and the next ones wait behind it, so those times are not real. The cause is that every whole-document read reads each equation's XML separately (1527 equations: 4 to 10 minutes per read). **Decision needed, below.**

**Fixed:**
- After Ctrl+Z of an edit, the equation was there (ID found in its data) but its LaTeX did not read: Word's XML for it had no ProgID, or its data did not read as a compound file. The app now accepts any object with a "MathBlocks" stream, and otherwise finds the source in the raw bytes, as the add-in finds the ID. On failure, the self-test line now says what the XML held. This was the self-test's 2 failures (`Ctrl+Z restores the equation before the edit`, `reading the document index…`).
- Soak: compares Word with the model right after every Ctrl+Z / Ctrl+Y and names the operation it undid. The 3 soak failures so far all came after an undo, each in a different way.

**Needs your PC:**
- Self-test of 0.1.167. Clean → I promote it to stable.
- Soak test again (it now stops at the exact undo that differs).
- Thesis-size: not needed until the decision below.

**Decision needed:** whole-document reads on a thesis.
- **A (recommended):** the add-in reads the document's XML once per operation and splits it per equation. That's one read instead of 1500, but a larger change (list of symbols, Apply style, Check document, Change symbol, Repair all use it).
- **B:** commands that only read (list of symbols, Check document, Change symbol's preview) use what Word gives without XML: the ID and LaTeX in the alt text. Smaller and faster, but the style check and verification before writing still read each equation.
- Also open: Update numbers (567 s, each field separately). Word's update-all is much faster but also updates your other fields (table of contents, dates, cross-references). Use it?

**Open:** Update numbers has no progress bar; `\overrightarrow` width in the editor.

## Details

- `objectSource`: no ProgID gate; `rawObjectSource` (JSON with `"tag":"mb1|` in the bytes) when the compound file does not read or the ProgID is MathBlocks'. `describeUnreadable` for the self-test.
- Soak: undo/redo stack entries carry the operation they undo; `compareNow` after each.
