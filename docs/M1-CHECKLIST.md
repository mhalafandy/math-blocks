# M1 test checklist (run on your PC)

These tests answer the open `[M1]` questions from the feasibility report. Please write the answers
(and screenshots where useful) in the issue or chat; I will record the results in DECISIONS.md.

Word version used: `File → Account → About Word` → ____________

**Results so far (user's PC):** Windows 11 (22621), Office 2021 Volume (Click-to-Run, 64-bit), Word 16.0.16501.20196.
B1 ✅ (after fixing the CodeBase bug for user names with spaces) · B2 ✅ · B3–B10 ✅ · A6: **Latin Modern Math** preferred (D-013), but **no native style looks professional enough** → precision-mode comparison `m1-P-precision-vs-native.docx` (D-015, proposed)
· A9 ❌ Word does not enforce the content-control lock around equations → linked blocks must rely on hash-based change detection (already the design), never on locks
· A14 ✅ as expected: `.doc` drops wrappers and turns equations into pictures → connector must warn before saving as `.doc` (M5)

## Part A — Spike documents (no add-in needed)

Files: `MathBlocks-M1-test-documents.zip` from the [Latest test build](https://github.com/mhalafandy/math-blocks/releases/tag/dev-build) release.

| # | Test | How | Result |
|---|---|---|---|
| A1 | The files open without errors | Open each file | |
| A2 | Equations are native and editable | Click an equation: the **Equation** tab appears; type inside it | |
| A3 | No red text anywhere | Red = input our converter could not read | |
| A4 | Aligned derivations align at `=` | Section "Aligned derivation", "State-space model", "Linear system" | |
| A5 | Piecewise function looks right | "Absolute value (piecewise)" | |
| A6 | Style comparison | Compare A (Word default), B (tuned), C (Latin Modern), D (STIX Two), E (bold vectors). Which do you prefer for matrices, vectors, integrals, overall? | |
| A7 | Content controls visible | **Developer** tab → **Design Mode** (enable the Developer tab via File → Options → Customize Ribbon). Equations show wrappers; section 3 shows the title "Newton's second law" | |
| A8 | Tags readable | In Design Mode, click a wrapper → **Properties**: the Tag starts with `mb1\|` | |
| A9 | Locked control | Section 3b: try typing inside the equation (should be refused) | |
| A10 | Tags survive save/reopen | Save as `.docx` under a new name, close Word, reopen, compare tags with the list in section 4 | |
| A11 | Copy-paste inside the document | Copy the first Newton equation (select the whole wrapper), paste in 3c. Is the pasted Tag identical? | |
| A12 | Copy-paste into a new document | Paste the same equation into a new blank document. Wrapper and Tag kept? | |
| A13 | Undo | Delete a wrapped equation, press Ctrl+Z: does the wrapper with its Tag come back? | |
| A14 | Save as `.doc` (97-2003) | Save a copy as `.doc`, reopen: are wrappers gone? (expected yes) | |

## Part B — Desktop app and Word connector

Setup: download from the [Latest test build](https://github.com/mhalafandy/math-blocks/releases/tag/dev-build) release and install both parts, see [DEVELOPMENT.md §0](DEVELOPMENT.md).

| # | Test | How | Result |
|---|---|---|---|
| B1 | Connector loads | Start Word: a **MathBlocks** ribbon tab appears | |
| B2 | Self-test without the app | MathBlocks tab → **Insert test equation**: the quadratic formula appears as a native equation | |
| B3 | Display/inline behaviour | Run B2 once in an empty paragraph and once in the middle of a sentence. Describe what happens (extra empty paragraph? equation inline?) | |
| B4 | Undo | After B2, press Ctrl+Z once: the whole insertion disappears in **one** step; the Undo list shows "Insert test equation" | |
| B5 | App starts | Install and start MathBlocks: the window opens, the status bar shows "Word not connected" or "Word connected" | |
| B6 | Connection | With Word open, within ~2 s the app's status bar shows **Word connected (Word 16.0.xxxx)** | |
| B7 | Send to Word | Pick "Rotation matrix" in the app, press **Send to Word** (or Ctrl+Enter): it appears at Word's cursor | |
| B8 | Start order | Close the app, keep Word open, restart the app: it reconnects by itself | |
| B9 | Double-click | Double-click an equation inserted by the app: the app shows a notice "An equation was activated in Word" | |
| B10 | Edits in the app | Try Visual / Both / LaTeX layouts, Ctrl+K palette, structure buttons, dark/light theme, panel resizing. Anything confusing or broken? | |

If something fails, attach `%LOCALAPPDATA%\MathBlocks\connector.log`.

## Part D — Library (build 0.1.21+)

| # | Test | How | Result |
|---|---|---|---|
| D1 | Save | Build an equation, press **Ctrl+S**, give it a name, folder and tags | |
| D2 | Folders | Create a folder (folder icon in the Library header), sub-folders (right-click a folder), drag equations into folders | |
| D3 | Versions | Change a saved equation, Ctrl+S again; open the **Library** tab at the bottom: two versions; **Restore** the first | |
| D4 | Search | Search by name, by `#tag`, by `is:fav` | |
| D5 | Crash recovery | Change an equation without saving, wait 2 s, close the app with Task Manager (End task), start it again: your change is back | |
| D6 | Export/import | Ctrl+K → "Export library…", then "Import library…" the same file: nothing is duplicated | |
| D7 | Persistence across updates | After the next automatic update, your library is still there | |

## Part C — Editing equations from Word (build 0.1.18+)

| # | Test | How | Result |
|---|---|---|---|
| C1 | Edit a MathBlocks equation | Send an equation to Word, then double-click it in Word: the app comes to the front with that equation and shows "Editing equation from Word" | |
| C2 | Update in place | Change it in the app, press **Update in Word**: it is replaced at the same place (inline stays inline, display stays display) | |
| C3 | One undo step | In Word press Ctrl+Z once after C2: the old equation comes back | |
| C4 | Equation typed in Word | Type an equation with Word's own editor (Alt+=), double-click it: it opens in MathBlocks. Change and update it | |
| C5 | Fidelity | Double-click one of your real thesis equations: does everything appear (no red parts)? If something is red, send a screenshot | |

