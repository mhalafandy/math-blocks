# Status

Updated at the end of every round. Public repository: generic content only. Earlier rounds: `docs/status-archive/`.

## Latest round — 0.1.166

**Build:** 0.1.166 (test channel), CI passed. Not promoted: the 0.1.165 self-test had 3 failures.

**Reports read:** self-test 13:08 (0.1.165: 427 passed, 3 failed; spike 99/0), thesis-size 13:36 (stopped at the list of symbols), soak 14:27 (failed after #75).

**Thesis-size (0.1.165):** Convert LaTeX 1077 s, **695 ms per equation** (1527 equations, 998 references; 0.1.161: 1142 ms). Update numbers 527 s (2380 numbers, 998 references). Insert the list of symbols: Word did not answer `listInstances` within 120 s, and the test stopped there (that was the "crash").

**Fixed:**
- Reading the document index (list of symbols and every command that reads first) no longer scans every picture's XML twice. The quiet Repair's dry run checks copies' IDs only. The equations read now has 600 s instead of 120 s.
- Thesis-size test: a failed step no longer ends the run; the later steps still run and are timed.
- Two documents open (3 self-test failures, still there in 0.1.165): when the progress window closed, Windows briefly brought the other document forward. Now Windows' own activation goes back to the document's window, and the progress window is hidden before it closes. Last round's fix used Word's Activate, which changed nothing.

**Diagnostics added:**
- Soak: one Ctrl+Z after Convert LaTeX left the converted equation again (#60/#61). Both times the LaTeX had just been typed. New self-test check "Convert LaTeX right after typing: one Ctrl+Z undoes it" tests whether Word closes the typing's undo step after the conversion's. The soak now also stops if Word reports nothing to undo.

**Needs your PC:**
- Self-test of 0.1.166. Clean → I promote it to stable. If "Convert LaTeX right after typing" fails, that's the soak's cause; I'll fix it next.
- Thesis-size test again (for the list of symbols and the steps after it).
- Soak test again.

**Open:**
- Update numbers: 527 s on the thesis (each field updated separately; Word's update-all would also update the user's other fields: needs a decision). No progress bar.
- `\overrightarrow` width in the editor.

## Details

- `repairEquations` dry run `identityOnly`: skips the per-picture XML scan (baselines, redraws) and paragraph styles; when it finds copies to fix, the full dry run plans the repair as before.
- `EndOperation`: `SetActiveWindow(owner)` and `_progress.Hide()` before `Close()`.
