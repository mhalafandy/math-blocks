# Status

Updated at the end of every round. Public repository: generic content only. Earlier rounds: `docs/status-archive/`.

## Latest round — 0.1.170

**Build:** 0.1.170 (test channel), CI: pending. Stable stays 0.1.168: the 0.1.169 self-test had 2 failures.

**Reports read:** self-test 18:32 (0.1.169: 454 passed, 2 failed), thesis-size 19:06, soak 20:56 (failed at #122), connector.log.

**Thesis-size (0.1.169) and the log:** Convert LaTeX 207 ms per equation (writing 204); numbers 72 s (locked). List of symbols 553 s, now passing. The one read of the document's XML takes 8–11 s (37 MB, 1533 pictures), so decision A's read is cheap. The time went into per-equation Word calls: the check before writing took 0.52 s per equation (revision count and content-control search on each lookup), and Apply style's writes 0.66–0.82 s per equation.

**Fixed:**
- Check document's repair + one Ctrl+Z left an equation's EMBED field locked: the locked Update numbers no longer touches embedded objects' fields (they have no result to update; 1500 fewer locks on a thesis).
- Soak #113 / #673: Apply style replaced the wrong pictures. Each batch is now written from the end of the document backwards, so a write only disturbs what is already done.
- Speed: within a request, whether the document has tracked changes and its content controls by ID are read once (verify, list, and writes with Track Changes off). Check document reads equations without pages.
- "Apply notation kinds: Ctrl+Y redoes it": the check now says which equations differ and whether a second read agrees (cause not known yet).

**Built:**
- Text guard: each written range must hold exactly the LaTeX written. Fixtures that must fail: range one character too wide (left, right), next to punctuation, two adjacent equations, a numbered line (plus passing ones).
- **Word shortcuts, new convention** (docs/SHORTCUTS.md): Ctrl+Alt+J inline, Ctrl+Alt+; display, Ctrl+Alt+' Toggle LaTeX, Ctrl+Alt+K edit, Ctrl+Alt+, reference, Ctrl+Alt+/ number. Changeable in Settings → Word shortcuts (Shift bases and function keys refused). Every MathBlocks tab button has its own key tip (Alt, Q, letter).
- Self-test "Word shortcuts: Word's own keys on this PC": each shortcut checked against Word's assignments (built-in, MathType, other add-ins); the free right-hand Ctrl+Alt keys; full list in `word keys.txt`.
- Thesis-size report: Convert LaTeX's InsertXML time per equation; log lines for listInstances (pages vs content).
- docs/CLEANUP-INVENTORY.md: what a new user does not need, with a proposal for each (nothing removed).

**Needs your PC:**
- Self-test of 0.1.170 (check the "Word shortcuts" section: any clash, and send `word keys.txt`). Clean → I promote it.
- Thesis-size test, and the connector.log after it (Convert LaTeX target; Apply style, Check document, Change symbol in time?).
- Soak test.

**Open:**
- Convert LaTeX under 0.2 s per equation: not reached (207 ms). The InsertXML breakdown will show whether the equation package size is the lever.
- The default keys are proposals until the self-test shows they are free on your PC (Ctrl+Alt+K is AutoFormat in some Word versions).
- Cleanup: your choice per item in docs/CLEANUP-INVENTORY.md.

## Details

- `GuardText.WrittenMismatch`; `GuardWritten(start, end, text)`; fixtures carry `writtenText`.
- `DocFacts` (`FactsOf`): read scope, or a write with Track Changes off and no content controls (`BeginWriteIndex(doc)`).
- `shortcuts.rs`: `set_word_shortcuts`, `parse` (convention, unit test); app `lib/wordKeys.ts`, prefs `wordKeys`.
