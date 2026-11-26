# Status

Updated at the end of every round. Public repository: generic content only. Earlier rounds: `docs/status-archive/`.

## Latest round — 0.1.178 (UX follow-up, candidate for stable)

**Stable: 0.1.175.** **Test channel:** 0.1.178, CI passed: ready for the core self-test. 0.1.177 checks on your PC: all OK.

**Built:**
- Settings: six real pages (Appearance, Notation, Editing, Word, Backups and updates, Developer tools), each with its sections one under the other and links to them at the top. 0.1.177 only grouped the 15 old pages under small headings in the side list, which still looked like the old layout; there is one Settings window (no add-in settings), so this is what every entry point opens. Search and old links open the page scrolled to the section.
- Editing → "Style bar over a selection" (default on); off, the bar never shows. Its actions are in the right-click menu too (Bold, Italic ↔ upright, Accent ▸, the kind's Plain and Style…).
- Nested kinds: making a kind of a selection on another kind's drawing (its harpoon or bold, not its letter) took the inner kind apart (raw `\overrightharpoon{b}` + an empty kind); now the new kind goes around it (`\tens{a+\cmat{\pvec{b}}}`). Typing and Backspace in nested kinds were already fine. CI: two- and three-level cases in the UI check and in editor-keys-check.
- Caret colour per kind (the innermost kind it is in; plain maths keeps the accent colour); 8 colours, each with a light-theme and a dark-theme value (≥ 4.5:1 on the light page).
- Renames applied (labels only; stored settings and documents unchanged; built-in style presets show their current name in older documents too). "Classic picture: Times New Roman and Symbol, drawn by MathBlocks, the same on every PC"; Accents: "length (1 = standard length)", "stroke weight (1 = standard weight)", buttons "Default: heavier, fits the letter" / "Thin, fixed length". Kind presets and palette tips no longer name authors. Remaining "MathType" text is all import/convert (or the benchmark's comparison column).
- Ctrl+Alt+U / I / N: handled inside the MathBlocks windows only, never registered system-wide, so Word keeps Ctrl+Alt+I / N. A Word shortcut can no longer be set to them. Self-test (now in the core run): not registered system-wide; Word's own use reported; in the editor I / N / U → inline / numbered / display with the Latin and the Arabic (101) layout. Not pressed in Word (it would run Word's commands).
- B4: one progress window for the app's own long operations (MathType document file conversion, chapter files check with Cancel, LaTeX export, self-test / soak / large-document runs). It steps aside while another dialog is open. Word's whole-document operations keep the add-in's window.

**The gate (unchanged except the shortcuts section):** core self-test of 0.1.178 → `RESULT: PASS`; the 4 manual checks; then Promote to stable. The core run now has 22 sections (+ "Word shortcuts").

## Details

- `SettingsDialog.tsx`: pages = groups; each section's dialog opened when its page shows (its own Close still closes the settings). `ui-check.ts`: page/section checks by section id; action rows checked per section.
- `MathEditor.makeKindFromSelection`: checks the kinds in the saved form; if one was lost, puts the equation back and wraps the inner kind's atom. `updateKindCaret` (model ancestry) + `--kc-*` tokens.
- `lib/progress.ts` + `ProgressWindow.tsx`; `lib/modeKeys.ts` (+ unit tests, Latin and Arabic).
- Checks: 708 unit tests, typecheck, editor-keys-check, accent-index-check, UI check (incl. nested kinds, caret colour, progress window, style bar): all passed.
- **Rule:** anything new written into Word gets a guard fixture first (`docs/DEVELOPMENT.md` §4); working style: `CLAUDE.md`.
