# Status

Updated at the end of every round. Public repository: generic content only. Earlier rounds: `docs/status-archive/`.

## Latest round — 0.1.161

**Build:** 0.1.161, test channel. CI passed (tests, guard fixtures, UI check, Windows build). No stable build promoted yet.

**Built:**
- A2: print check finds its markers when Word splits them into letters (no defect in the picture).
- B: Change symbol… (list of symbols, editor right-click, Ctrl+K): preview, decorated and related forms, clashes, text mentions; one Ctrl+Z.
- Add-in finds equations in footnotes, endnotes, text boxes, headers/footers; Convert LaTeX converts inline `$…$` there.
- C1: stable/test update channels, "Promote to stable" workflow, roll back to the previous stable build.
- C2: Check document (ribbon, Ctrl+K) with Go to; safe repairs in one Ctrl+Z.
- C3: Thesis-size test (Ctrl+K); Convert LaTeX writes in batches, Cancel undoes it all.
- C5: self-test section "Round trips and compatibility".
- C6: an operation is undone if the app goes away mid-way; Report a problem (Ctrl+K).
- C7: Ctrl+Y is a real check; undo checked for the remaining operations.
- C4: Soak test (Ctrl+K), seeded, checked against a model.

**Needs your PC:**
- Settings → Updates → Test, until the first stable build is promoted.
- Self-test of 0.1.161 (new sections: Change symbol, Check document, Round trips, Failure handling, Undo integrity). Clean → I promote it to stable.
- Ctrl+K "Thesis-size test…" → send `thesis-size report.txt` (timings recorded here).
- Ctrl+K "Soak test…" → send `soak report.txt`.
- Manual: trial checklist 3.6b (PC without MathBlocks), 3.6c (OneDrive AutoSave).

**Open:**
- A1: three self-test reports received (19 Nov, 19:04 / 19:28 / 20:12), not read yet: reference-links top in Word, recorded guard fixtures.
- Update numbers has no progress bar; batch it if the thesis-size timings show it is slow.
- `\overrightarrow` in the editor keeps MathLive's width (index gap 0.18 em; harpoons are fixed).

## Details

- **Change symbol:** matching by the list of symbols' identity (a bold ω made a vector by a rule = `\pvec{\omega}`; `v_0` ≠ `v`). Updates equations, definitions (meaning and unit kept), the document rule for the letter, blocks (asked), the list. Tests: 14 unit tests, guard fixtures, UI check, self-test section.
- **Channels:** each build is kept as release `v0.1.N`; `stable` holds `latest.json` + `previous.json`. Report header says whether the build can be promoted.
- **Check document:** pure judging in `app/src/lib/checkDocument.ts`; add-in `checkFields`/`hideFields`.
- **Thesis-size document:** about 1530 equations, 1000 references, 12 chapters/appendices, tables, footnotes, text boxes.
- **Rule:** anything new written into Word gets a guard fixture first (`docs/DEVELOPMENT.md` §4); working style: `CLAUDE.md`.
