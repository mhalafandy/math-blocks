# M1 test checklist (run on your PC)

These tests answer the open `[M1]` questions from the feasibility report. Please write the answers
(and screenshots where useful) in the issue or chat; I will record the results in DECISIONS.md.

Word version used: `File → Account → About Word` → ____________

## Part A — Spike documents (no add-in needed)

Files: `fixtures/spike/m1-A … m1-E *.docx` (download from GitHub: open the file, then "Download raw file").

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

Setup: download the CI artifact and install both parts, see [DEVELOPMENT.md §0](DEVELOPMENT.md).

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
