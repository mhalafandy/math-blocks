# Status

Updated at the end of every round. Public repository: generic content only. Earlier rounds: `docs/status-archive/`.

## Latest round — 0.1.168

**Build:** 0.1.168 (test channel), CI: pending. Not promoted: the 0.1.167 self-test had 2 failures.

**Reports read:** self-test 22:38 (0.1.167: 443 passed, 2 failed; spike 99/0), soak 00:01 (failed after #200), thesis-size 00:22 (Convert LaTeX 517 ms per equation; 4 steps timed out).

**Built:**
- **Whole-document reads (decision A):** in a request that only reads (list, verify before writing, Repair's dry run, Check document's fields, definitions, numbers), the add-in reads the main text's XML once, splits it per picture and indexes the pictures by ID. That replaces one XML read per equation and a walk over every picture per lookup. Apply style's write loop uses the same index. Anything it can't tell apart (an ID on two pictures, footnotes, text boxes, native equations) is read as before. Word-free tests for the split.
- **Update numbers:** new method "locked": every other field locked, Word updates all (numbers, then references), locks restored in a step that always runs; a marker in the document meanwhile. Check document reports locked fields, and, if Word stopped in between, an error with an Unlock repair (fields locked before stay locked). Progress bar for Update numbers. Default stays field by field until the thesis-size test has timed both.
- **Convert LaTeX:** reports the number update at its end separately from the per-equation time. One paragraph count per inserted equation removed.
- **Docs:** Ctrl+K is the command palette, not a shortcut for both commands; the docs now say which command to type.

**Soak, common cause found:** Ctrl+Z of a Convert LaTeX puts its typed `$…$` text back, and the next Convert LaTeX converts that too. The model didn't count it (soak 0.1.162 #186→#194, 0.1.165 #60→#75, 0.1.167 → #200). The model now keeps the typed text per document and checks the converted count. It's a soak model error, not an add-in bug.

**Undo of an edit (self-test 2 failures):** the XML right after the undo is complete (ProgID, MathBlocks data, alt text, all read fine), so the first read right after Ctrl+Z missed it. The check now reports what that same read saw. New checks: the restored equation opens (menu → Edit), renders and can be edited again.

**Needs your PC:**
- Self-test of 0.1.168. Clean → I promote it to stable.
- Thesis-size test: it now times both Update numbers methods and splits Convert LaTeX's time (building, writing, numbers). From that I pick the Update numbers method and work on the 0.2 s target.
- Soak test again.

**Open:**
- Convert LaTeX under 0.2 s per equation: not reached yet (517 ms in 0.1.167, including about 330 s of number update). Next round, with the new breakdown.
- Numbering one equation updates every field in the document (slow on a thesis).
- Toggle LaTeX (per-equation LaTeX text ↔ equation): next round. Ribbon button and shortcut to propose; text-guard fixture first.
- `\overrightarrow` width in the editor.

## Details

- `DocXml` (Word-free): parts by name, runs holding an object/drawing/VML picture, IDs from title/alt and from the object data; one package per run with Word's prefixes and only its parts. `WordOps.ReadScope`: `ShapeXml`, `ScopedPicturesWithTag`, scope per request (`BeginReadScope`/`EndRequest`); `SetPictureTag` forgets the IDs it changes.
- `UpdateNumberFieldsLocked`, `UnlockFields`, marker `MathBlocks.UpdateNumbersLocked` (holds the fields locked before). `NUMBER_UPDATE_METHOD` in `numbering.ts`.
- Soak model `text`: typed LaTeX per document, in every undo/redo snapshot.
