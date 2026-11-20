# Status

Updated at the end of every round. Public repository: generic content only. Earlier rounds: `docs/status-archive/`.

## Latest round — 0.1.165

**Build:** 0.1.165 (test channel), CI passed. Not promoted: the 0.1.164 self-test had 4 failures.

**Reports read:** self-test 01:25 (0.1.164: 438 passed, 4 failed; spike 99/0), soak 11:30 (failed after #75). Thesis-size: very slow, probably crashed, no report.

**Now passing in 0.1.164:** "Word kept the edit in one undo record", "Ctrl+Z restores the equation before the edit", "reading the document index adds no undo step".

**Fixed:**
- Thesis-size test: the report is written before and after every step. A crash or hang leaves the timings so far and a line naming the step that was running and since when. Before, it was only written at the very end, so nothing came back.
- Check document: an older reference (GOTOBUTTON around REF) was counted twice ("shows nothing", "shows (1)"). Now it's one problem: "in the earlier form…, showing (1)", repaired by Update numbers. This was the self-test failure "the reference in the earlier form is found".
- Two documents open: when the progress window closed (Convert LaTeX, Apply style, Restyle), Windows briefly brought the other document forward. The document's window now comes back before the progress window closes.
- Soak model: Update numbers with nothing to change leaves no undo step in Word, so the model's next Ctrl+Z was off by one (#67/#68). Now that document's history is dropped after Update numbers. A deleted equation the model doesn't have now stops the soak at once instead of removing the wrong one.

**Needs your PC:**
- Self-test of 0.1.165. Clean → I promote it to stable.
- Thesis-size test again. Send `thesis-size report.txt` even if it stops or Word crashes; it now says how far it got. If Word crashed, also send `%LOCALAPPDATA%\MathBlocks\connector.log`.
- Soak test again.

**Open:**
- Thesis-size: why it is slow / where it crashes (waiting for the report). 0.1.161: Convert LaTeX 1142 ms per equation.
- Update numbers has no progress bar; `\overrightarrow` width in the editor.

## Details

- `thesisReport()` builds the lines; `writeReport` has a 30 s timeout (a hung Word doesn't stop the test from moving on).
- `CheckFields`: a REF inside the code of the GOTOBUTTON before it is not a separate reference; its text becomes the GOTOBUTTON's.
- `EndOperation`: `_operationWindow.Activate()` before `_progress.Close()`; afterwards only if another window is active.
