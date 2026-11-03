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

## Part F — MathType conversion (build 0.1.24+)

| # | Test | How | Result |
|---|---|---|---|
| F1 | Convert | Left panel → **Convert MathType document…**, pick a copy of a thesis chapter, save as suggested: the report says how many equations were converted | |
| F2 | Look | Open the converted file: equations look right (bold vectors, harpoons, matrices, integrals)? Numbers (A.1)… still at the right? | |
| F3 | Display size | Numbered display equations: are fractions and integrals full size, or do they look small (text style)? Send a screenshot either way | |
| F4 | References | Cross-references to equation numbers in the text still work (Ctrl+click / F9 updates them) | |
| F5 | Edit | Double-click a converted equation: it opens in MathBlocks; change it and press **Update in Word** | |
| F6 | In Word | Open a copy of a chapter in Word, ribbon **Convert MathType equations**: all convert; one Ctrl+Z brings them back | |
| F7 | Double-click MathType | In an unconverted copy, double-click a MathType equation: choose **Convert and edit**: it opens in MathBlocks; Cancel opens MathType | |

## Part L — Writing faster (build 0.1.42+)

| # | Test | How | Result |
|---|---|---|---|
| L1 | MathType keys | In the equation editor: Ctrl+F, type a, ↓, b, →; Ctrl+R x; Ctrl+H 2; Ctrl+Shift+V r; Ctrl+G w (ω); Ctrl+9 | |
| L2 | Autocorrect | Type `->`, `<=`, `+-`, `xx`, `oo`: they become → ≤ ± × ∞ | |
| L3 | Sheet | Press F1 (or ⌨ Shortcuts in the status bar) | |
| L4 | Panel extras | Right-click an equation in Word: click a favourite symbol; type `\alpha_1` in the command line + Enter; type the name of a library equation + Enter | |

## Part K — Notation, shortcuts, LaTeX (build 0.1.40+)

Close Word completely after the update (new add-in, new ribbon buttons).

| # | Test | How | Result |
|---|---|---|---|
| K1 | Change notation | Ctrl+K → "Change notation across the document…": the notations in use are listed (e.g. Arrow ×12); choose one, a target (e.g. Bold with harpoon), Change: all those vectors change; one Ctrl+Z in Word undoes it | |
| K2 | Ctrl+Alt+M | In Word, cursor in a MathBlocks equation, press Ctrl+Alt+M: the floating editor opens for it; on empty text it opens for a new equation, Enter inserts it | |
| K3 | Ctrl+Alt+L | Cursor in an equation, Ctrl+Alt+L: it becomes `$…$` text; edit it, Ctrl+Alt+L again: it is an equation again | |
| K4 | Convert LaTeX | Type `The energy $E=mc^2$ and` and on its own line `$$\frac{a}{b}$$`, ribbon **Convert LaTeX**: both become equations (the second as a display equation) | |
| K5 | Ctrl+Alt+N / R | Ctrl+Alt+N numbers the equation at the cursor; Ctrl+Alt+R opens the reference picker | |
| K6 | Key tips | Press Alt, then Q: letters appear on the MathBlocks buttons | |

## Part J — Floating editor (build 0.1.37+)

Close Word completely after the update (new add-in).

| # | Test | How | Result |
|---|---|---|---|
| J1 | Opens next to it | Right-click a MathBlocks equation: the small editor opens just below it (above it near the bottom of the screen) | |
| J2 | Edit + Enter | Change the equation, press **Enter**: Word updates; Esc instead leaves it unchanged | |
| J3 | Commands | Type `/frac` in the command line, Enter: a fraction is inserted; try `/bold`, `/numbered` | |
| J4 | Sections | Open **Symbols and templates**, insert something; close it again: it stays closed next time | |
| J5 | Word menu | Click ☰: Word's own right-click menu appears | |
| J6 | Linked copy | Right-click a linked copy: the panel says "Linked: …"; Enter updates every copy | |

## Part I — Classic equations (build 0.1.32+)

| # | Test | How | Result |
|---|---|---|---|
| I1 | Preview | Bottom panel **Word style**: "Classic" is selected; the preview shows your equation with Times New Roman and Symbol (no "stand-in font" note) | |
| I2 | Insert | Type `f(\vec{\mathbf{r}})=\frac{-\mu}{r^2}\vec{\mathbf{r}}`, Send to Word: it looks like MathType | |
| I3 | Numbered | Choose **Numbered**, Send: full size, (n) at the right margin | |
| I4 | Edit | Double-click the equation in Word: it opens in MathBlocks; change it, Update in Word | |
| I5 | Convert | In a copy of a chapter: ribbon **Convert MathType equations**: they now look like MathType but are MathBlocks equations | |

## Part G — Numbering and references (build 0.1.26+)

Close Word completely after the update so the new ribbon buttons appear.

| # | Test | How | Result |
|---|---|---|---|
| G1 | Numbered | Choose **Numbered** in the toolbar, Send to Word: the equation is centred with (1) at the right margin | |
| G2 | Renumber | Insert another numbered equation *above* the first one, press ribbon **Update numbers**: they read (1), (2) in order | |
| G3 | Reference | In a text paragraph, ribbon **Insert reference**: pick (2): "(2)" appears; Ctrl+click jumps to the equation | |
| G4 | MathType numbers | In a converted thesis chapter, Insert reference lists the (A.n) numbers too | |
| G5 | Toggle | Click into an equation, ribbon **Number equation**: adds or removes its number | |
| G6 | Chapter style | Word style tab → Equation numbers "(2.1)", in a document with numbered Heading 1: new numbers show the chapter | |
| G7 | Edit numbered | Double-click a numbered equation, change it, Update in Word: the number stays | |

## Part H — Templates and symbols (build 0.1.27+)

| # | Test | How | Result |
|---|---|---|---|
| H1 | Template | Library: right-click an equation → **Use with other symbols…**, type new symbols: the preview follows; **Send to Word** inserts it | |
| H2 | Symbols of an equation | Bottom panel **Symbols**: the list shows v₀, 𝐜_sf… (not d of dx); click one, Rename: the equation changes | |
| H3 | Symbols of the document | With Word open, **Index Word document**: symbols with "defined p. n"; Go to selects the equation in Word | |
| H5 | Export | Canvas **⤓** → Copy as image, paste into PowerPoint; Save as SVG opens in a browser | |
| H6 | Document → LaTeX | Ctrl+K → "Export the Word document's equations as LaTeX…": the .tex compiles (e.g. on Overleaf) with your numbers | |
| H4 | Rename everywhere | Rename a symbol used in several equations: all change; one Ctrl+Z in Word undoes it | |

## Part E — Linked equations (build 0.1.22+)

| # | Test | How | Result |
|---|---|---|---|
| E1 | Insert linked | Open a saved library equation (no unsaved changes), press **Send to Word** twice at two places. Right-click it in the library → "Insert linked copy into Word" also works | |
| E2 | Update everywhere | Change the equation in the app, press **Ctrl+S**: both copies in Word change; one Ctrl+Z in Word undoes the update | |
| E3 | Edit from a copy | Double-click a copy in Word: the app shows "Editing a linked equation". Change it, press **Update everywhere** | |
| E4 | Copy and paste | Copy a linked equation in Word and paste it elsewhere; change the equation in the app and save: the pasted copy follows too | |
| E5 | Edited in Word | Edit one copy with Word's own equation editor, then save a new version in the app: MathBlocks asks Replace / Cancel (Cancel keeps your Word edit and unlinks that copy) | |
| E6 | Closed document | Close the document, change and save the equation in the app, reopen the document: a bar offers **Update now** | |
| E7 | Show linked | MathBlocks ribbon → **Show linked equations**: linked copies get a frame; click again to hide | |
| E8 | Where used | In the app's **Library** tab: list of copies with page numbers; **Go to** jumps there in Word | |
| E9 | Unlink | Double-click a copy → **Unlink this copy** in the app; later saves no longer change it | |
| E10 | .doc warning | Open a .doc containing MathBlocks equations, press Ctrl+S: a warning appears | |

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

