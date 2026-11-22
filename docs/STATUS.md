# Status

Updated at the end of every round. Public repository: generic content only. Earlier rounds: `docs/status-archive/`.

## Latest round — 0.1.174

**Build:** 0.1.174 (test channel), CI passed. Stable stays 0.1.168: the 0.1.173 self-test had 2 failures.

**Reports read:** self-test 13:30 (0.1.173: 476 passed, 2 failed), thesis-size 16:16, soak 14:44 (passed), connector.log.

**Fixed:**
- Duplicate check in the self-test found nothing: its paste landed 33 characters away, so the two pictures were not side by side. The copy is now placed right after the original (as the old bug left it).
- MathType comparison timed out (2 min): MathType converts one expression at a time; now each $…$ on its own, with 15 min allowed and each one's time logged.
- Thesis Apply style: all 1533 written (256 → 560 ms each, all inside Word's write), then the text guard read the document without the list's marker (Word was running out of memory: "not enough memory…" right after) and undid everything. The guard now reads again when Word refused reads or the list is missing; the add-in releases its Word objects after every batch and logs Word's memory per batch.
- Large operators: a stored choice was dropped on reading (0.1.173 bug); the Document style sample showed "int" as text.

**Built:**
- Large operators per group (integrals, contour integrals, sums and products, others). New document styles: STIX Two Math, contour integrals XITS Math. Documents with a stored style, or with pictures but no stored style, keep what they had. Compare sheet: row "STIX Two + XITS contour"; it and the Document style samples on a white page.
- Uninstall removes the fonts MathBlocks installed (and says so); the app installs a missing one again at start. A font you installed yourself is left alone. One edge: a font you had installed yourself "for me" under the same path before 0.1.173 counts as MathBlocks'.
- Convert LaTeX 207 → 243 ms: nothing in our code; only a timer and a cache changed on that path. Word's InsertXML alone went 130 → 140 ms, and 0.1.173 ran at 230. Left as is.

**Needs your PC:**
- Self-test (developer tools on). Clean → I promote it.
- Developer tools → Large operators: check the "STIX Two + XITS contour" row.
- Thesis-size test with connector.log (memory per batch now logged; does Apply style finish?).

**Open:** Apply style's write time still grows (Word's single undo record for 1533 replacements). If memory still runs out, the choice is between one Ctrl+Z and undo steps of a few hundred equations each: your call.

## Details

- Guard: `GuardDoc.ReadErrors`, re-read in `GuardCheck`; `ReleaseComObjects`, `WordMemoryMb`.
- `largeOperatorGroups`, `largeOperatorFont`, `NEW_STYLE_LARGE_OPERATORS` (math-core); `userDefaultStyle({ existing })`; `getDocumentStyle.pictures`.
- `installer-hooks.nsh` (pre-uninstall), `src-tauri/src/fonts.rs` (`ensure_math_fonts`).
