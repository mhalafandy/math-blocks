# Status

Updated at the end of every round. Public repository: generic content only. Earlier rounds: `docs/status-archive/`.

## Latest round — 0.1.163

**Build:** 0.1.163 (test channel), CI: pending. Not promoted: the 0.1.162 self-test had 3 failures.

**Reports read:** self-test 22:18 (0.1.162: 432 passed, 3 failed; spike 99/0), thesis-size 22:45, soak 23:31 (failed after #200).

**New check "reading the document index adds no undo step": FAILED.** Reading did add one. Fixed (below).

**Thesis-size time per equation: not available.** The zip had only `thesis-size test.docx`, without `thesis-size report.txt`. The document shows numbers and references this time, so Convert LaTeX was not undone.

**Fixed:**
- Reading the document index (list of symbols, Change symbol, Apply style, Check document, Notation…) ran a quiet Repair that could write baselines or redraws: one undo step in front of your last edit. Now it writes only when copies need their own ID.
- Check document self-test: "The number must be between…" came from Word. The deliberate resize fault now resizes in points (embedded objects refuse their own scale back), and each fault step is named in any error.

**Diagnostics added (cause needs Word):**
- Objects: "Ctrl+Z restores the equation before the edit" (one Ctrl+Z left the equation "not found"). New check "Word kept the edit in one undo record" says where Word ended the record; on failure the line lists the IDs, pictures and readable equations left.
- Soak: one Ctrl+Z after Convert LaTeX left the converted equation (model 2 × `x^2+y^2`, Word 3). The soak now stops at a Convert LaTeX whose undo record Word ended early and names where. Apply style no longer adds the hidden Repair step (fix above), which could also shift later undos.

**Added:** 67 recorded guard fixtures from the 0.1.162 self-test (`rec-162-*.json`, generic test documents, all pass; the probe reads as changed). Unit test for the read-only Repair rule.

**Needs your PC:**
- Self-test of 0.1.163. Clean → I promote it to stable. Send the lines of "Equation objects" and "Check document" if they fail.
- Thesis-size test: send `thesis-size report.txt` from its folder (that file has the timings).
- Soak test again.

**Open:**
- Edit = more than one undo step (cause unknown until the new check reports where).
- Convert LaTeX on the thesis-size document: 1142 ms per equation in 0.1.161; waiting for the 0.1.162/0.1.163 timings.
- Update numbers has no progress bar; `\overrightarrow` width in the editor.

## Details

- `repairDocument(…, { identityOnly })` returns before writing unless `identityChanges(dry)` > 0 (renamed, wrapped, bookmarks, redraws for "id"). Explicit Repair and Check document are unchanged.
- `rewriteDocument` returns the operation's `undoBrokenAt`.
- Smoke `resizePicture`: Width/Height in points, aspect lock off.
