# Status

Updated at the end of every round. Public repository: generic content only. Earlier rounds: `docs/status-archive/`.

## Latest round — 0.1.162

**Build:** 0.1.162 (test channel), CI passed (tests, guard fixtures, UI check, Windows build). Not promoted: the 0.1.161 self-test had 7 failures.

**Reports read:** self-test 19:04 (0.1.161: 392 passed, 7 failed), thesis-size 19:28, soak 20:12.

**Fixed:**
- Text guard: a field showing nothing (definition markers, hidden SEQ) was taken one character too long, so a comma or full stop right after `\define{…}` read as deleted and Convert LaTeX was undone. This failed Change symbol (self-test) and the whole thesis-size run (Convert LaTeX undone, so: no definitions, 0 numbers, "older style" in Check document).
- Check document crashed on a marker field with no result ("Object reference not set…"); it also failed Round trips and Undo integrity.
- Saving the document style with no document named went to the last document read, not the one in front: Apply style changed nothing (Undo integrity), the soak test stopped at #11 ("document no longer open").
- An operation undone when the app goes away now checks the equations as well as the text (an edited equation leaves the text unchanged, so it stopped after one undo step); never undoes past the operation.
- Change symbol: the heading walk and text search no longer stop the command on a Word error ("Value out of range"); `^` searched literally.
- Self-test "objects: Ctrl+Z restores the equation" reads Word directly; a new check says whether reading the document index adds an undo step (suspected cause).

**Added:** 62 recorded guard fixtures (`rec-*.json`, generic self-test documents); field-end unit tests.

**Reference links:** the top of the tall equation is on screen in Word after Ctrl+click (picture top 426 px, window 320–1046 px): `_MBEqT_` not needed.

**Needs your PC:**
- Self-test of 0.1.162. Clean → I promote it to stable.
- Thesis-size test again (0.1.161's numbers are not usable: Convert LaTeX was undone by the guard bug).
- Soak test again.

**Open:**
- Convert LaTeX on the thesis-size document took 1763 s (1142 ms per equation): look at it with the new timings.
- Update numbers has no progress bar; `\overrightarrow` width in the editor.

## Details

- Guard: `GuardText.FieldEnd` (pure, tested); used by the guard, Change symbol's mentions and the definitions list.
- Fixture 028 (Convert LaTeX, `\define` before a comma) was recorded with the bug: its two definition field ends are corrected and it must pass; the probe fixture 014 must fail (it deletes a letter on purpose).
- Recorded fixtures with no two words side by side skip the typed-word/deleted-space mutation (66 operations still mutated).
