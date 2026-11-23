# Status

Updated at the end of every round. Public repository: generic content only. Earlier rounds: `docs/status-archive/`.

## Latest round — 0.1.177 (UX round)

**Stable: 0.1.175** (unchanged). **Test channel:** 0.1.177, CI passed.

**Built (your list):**
- 2.9 Key lag: the symbol palette and sidebar re-rendered on every key; now only the editor does, and the app's update runs after the key is painted. Backspace on a selection: the deletion was not drawn until the next key (your screenshot) — drawn at once now (CI check added). Document suggestions re-read every equation of the Word document each minute on the UI thread: now in small slices, cached, every 5 min.
- 2.7 Library and Examples insert at the cursor (replacing only a selection); into an empty editor they open as before. Library and Blocks share one design: cards plus folder icons.
- 2.6 Blocks drag into the editor (dropped where you drop them) and onto a group; library equations drag into the editor too.
- 2.2 / 2.3 The panel header always fits (the Hide button was outside it); Blocks has the same header actions (＋, new group) plus ⋯ for New / Export / Import.
- 2.5 Ctrl+Alt+U display, Ctrl+Alt+I inline, Ctrl+Alt+N numbered (Ctrl+Alt+J stays Word's new inline equation). 2.4 Shortcuts sheet: one line per shortcut, grouped.
- 2.1 / 2.8 Editor: a harpoon with an index that came from Word, the library or the LaTeX tab still drew the index underneath (only typing was fixed in 0.1.176); fixed, with the normal space before "=", and the harpoon drawn with its barb (⇀). Display only: the stored LaTeX is unchanged.

**Built (my areas):**
- B1 Settings: six sections (Appearance, Notation, Editing, Word, Backups and updates, Developer tools); clearer page names; Backups and Updates on one page; old links still open the right page.
- B2 Wording: case-specific hints, placeholders and examples made generic; "Thesis-size test" is now "Large-document test" (its report file: `large-document report.txt`).
- B6 Dialogs: focus on the main field when opened; Enter in a one-line field confirms. B5: empty Library / Blocks offer their first action.

**Not done (next round):** B3 renames (list below, for your OK), B4 one progress window for the app's own long operations (the add-in's whole-document operations already share one).

**On your PC (test channel):** typing and Backspace on a selection in a long equation; drag a block and a library equation into the editor; Ctrl+Alt+U/I/N; open an equation with a harpoon and an index from Word.

**B3 — renames for your OK (labels only; stored settings and documents unchanged):**
1. Spacecraft notation: "Hughes / Schaub & Junkins / Markley & Crassidis" → "Rotation matrix C_ba, a^×, quaternion ε/η" / "Direction cosine matrix [BN], [ω̃], β₀…β₃" / "Attitude matrix A, [ω×], q₄ last"; the setting → "Rotation notation".
2. Palette collection "Spacecraft dynamics" → "Rotational dynamics"; floating editor tab "Spacecraft, my notation and collections" → "My notation and collections".
3. Document style presets: "MathType Classic" → "Upright Times, Symbol operators"; "ISO 80000-2" → "Upright constants and differentials".
4. MathType wording: "Classic: MathType look" → "Classic: picture"; "12 pt (MathType default)" → "12 pt (default)"; "Above the editor (MathType style)" → "Above the editor"; "(hidden, like MathType)" → "(hidden)"; "Current (Symbol, as MathType)" → "Symbol"; Accents "× MathType" → "× default", "MathType-like" → "Compact accents". Convert MathType keeps its name.

## Details

- Key path: `App.tsx` memo panels; `lib/visualLatex.ts` (store update after paint, flushed by clicks, Ctrl/Alt/Enter/Tab/Esc, focus out, Send to Word); `useDeferredValue` for OMML and width. `editorSlots.deleteStep` redraws (MathLive draws only after its own commands).
- Accents: `\mathord{…}` wrapper (normal spacing), grouped on load and ungrouped on save; harpoon drawn as a CSS mask. `accent-index-check`: 17 cases pass.
- Checks: 704 unit tests, typecheck, editor-keys-check (+3 selection cases), accent-index-check, UI check: all passed.
- **Rule:** anything new written into Word gets a guard fixture first (`docs/DEVELOPMENT.md` §4); working style: `CLAUDE.md`.
