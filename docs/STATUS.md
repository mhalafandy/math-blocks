# Status

Updated at the end of every round. Public repository: generic content only. Earlier rounds: `docs/status-archive/`.

## Latest round — 0.1.169

**Build:** 0.1.169 (test channel), CI: pending. **Stable: 0.1.168 promoted** (self-test 21 Nov 04:44: 441 passed, 0 failed).

**Reports read:** self-test 04:20 (0.1.168: clean), thesis-size 13:50, soak 04:50 (failed after #675).

**Thesis-size (0.1.168):** Convert LaTeX 206 ms per equation (building 3, writing 203), plus 532 s of numbers at the end. Update numbers: field by field 547 s, locked 69 s. **Default is now locked** (Update numbers, Convert LaTeX's update, list of symbols, numbering conversion). List of symbols timed out (1003 s, mostly its field-by-field number update); the steps after it queued behind it.

**Fixed / built:**
- Soak #673: Apply style left an equation twice. The picture index kept Word objects that an earlier write had replaced; each is now checked against its ID before use, else the document is walked.
- Undo of an edit: when an equation's XML has no MathBlocks data yet (right after Ctrl+Z), the add-in reads it again, letting Word settle, before giving up. This applies to list, open, edit and selection reads.
- Update numbers (locked): the marker records each field locked before by its position and a hash of its code. The Unlock repair refuses, changes nothing and says why if they don't match. No marker written, nothing locked: field by field instead. Still one Ctrl+Z (self-test).
- Numbering, unnumbering one equation, section marker: only the numbers from that point on and the references to them are updated.
- Operations pause Word's background pagination and always restore it; a file restores it at the next start if Word stopped. Convert LaTeX writes in batches of 80.
- **Toggle LaTeX:** ribbon button (Convert group) and **Ctrl+Alt+Shift+L** (Word's Ctrl+Alt+L inserts a LISTNUM field; MathType's is Alt+\). On the equation at the cursor or every equation in the selection, and back. The number field, its bookmark and references stay; the equation comes back with its ID (a bookmark around the text) and numbered. One Ctrl+Z, under the text guard. Guard fixtures and CI first: `gen-toggle-*` (the guard now leaves text an operation writes on purpose out of the comparison).

**Needs your PC:**
- Self-test of 0.1.169 (new section "Toggle LaTeX"; new checks for an interrupted Update numbers). Clean → I promote it.
- Thesis-size test: Convert LaTeX against the 0.2 s target (pagination paused, locked numbers), and the steps after the list of symbols.
- Soak test again.

**Open:**
- Convert LaTeX under 0.2 s per equation: 206 ms in 0.1.168, not measured yet with this round's changes.
- The other Word shortcuts also clash with Word: Ctrl+Alt+M (comment), Ctrl+Alt+R (®), Ctrl+Alt+N (Draft view). Move them to Ctrl+Alt+Shift too?
- `\overrightarrow` width in the editor.

## Details

- `ScopedPicturesWithTag` checks `TagOf` and the range of each indexed picture. `PictureXmlForApp` retries up to 4 times when the XML has neither data nor an object ID.
- `UpdateNumberFieldsLocked`: marker value `start:fnv` per field locked before (`-` if none), read back before locking. `UpdateNumbersFrom(doc, from)`. `UpdateAllNumbers` = locked.
- `EquationsToText` (`InOneUndo` with the equations excluded, `GuardWritten` for the text; bookmark `_MBTx_<block|0>_<instance>`); `selectionInfo` gives `selectedTags`, `textTag`, `numbered`.
