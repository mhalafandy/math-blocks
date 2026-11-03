# Features

Legend: ✅ done · 🚧 in progress · 📋 planned · 🐞 known bug

## Implemented

| Feature | Since | Notes |
|---|---|---|
| ✅ Canonical equation AST | M1 | 20 node kinds, JSON-serialisable |
| ✅ LaTeX parser with diagnostics | M1 | Fractions, scripts, primes, roots, ∑∏∫∬∭∮∯, limits placement, functions (sin…lim, `\operatorname`), `\left…\middle…\right`, accents, fonts (`\mathbf`, `\mathrm`, `\mathbb`…), `\text`, spaces, binomials, over/under braces, `\overset`, `\boxed`, tensor prescripts, matrices (6 kinds), `cases`, `aligned`/`align*`/`gathered`/`split`. Unknown commands kept as raw. |
| ✅ LaTeX serializer | M1 | Normalised output; structural round trip guaranteed |
| ✅ OMML writer | M1 | Native Word equations for every AST node, inline and display |
| ✅ Style Profiles | M1 | Math font, matrix/derivation spacing, vectors as arrows or bold |
| ✅ Word packaging | M1 | Content controls, Flat OPC for `InsertXML`, `.docx` builder, registry custom XML |
| ✅ Equation IDs and tags | M1 | `mb1\|block\|instance` |
| ✅ Spike documents | M1 | 5 style variants in `fixtures/spike/` |
| ✅ Desktop app shell (Tauri 2 + React) | M1 | Library sidebar with the reference set, MathLive visual editor, LaTeX editor with diagnostics, Visual/Both/LaTeX layouts, display/inline, structure toolbar, command palette (Ctrl+K), inspector (structure tree, Word style, OMML), resizable panels, light/dark/system theme, status bar |
| ✅ Word connector (COM add-in) | M1 | Ribbon tab, self-test insertion, named-pipe connection with auto-reconnect, insert equation in one undo step, read equation, document info, double-click detection |
| ✅ Connector protocol v1 | M1 | JSON-RPC over a named pipe, typed in `packages/connector-protocol` |
| ✅ Windows CI | M1 | Installer + connector DLL as downloadable artifacts |
| ✅ Spacecraft-dynamics notation | M2 | Palette tab with vectrix notation (bold arrow vectors, vectrix transpose, bold column matrices, unit vectors, body integrals, dm/dA/dV, iterated integrals with limits, ranges, cross matrices, bold Greek, dyadics); thesis Appendix A equations added to the reference set |
| ✅ Matrix bracket padding | M2 | Brackets slightly taller than the entries (variant 3, default in the tuned profile, D-017) |
| ✅ Workspace layout | M2 | Collapsible/resizable library, symbols and bottom panels (Ctrl+B, Ctrl+Alt+B, Ctrl+J), focus mode, canvas zoom (Ctrl +/−/0), panel state remembered (D-016) |
| ✅ LaTeX editor (CodeMirror 6) | M2 | Syntax colours, completion of every supported command with fill-in templates (Tab between fields), bracket matching, auto-closing { and [, error underlines with hover messages, undo/redo, two-way sync with the visual editor |
| ✅ Read Word equations (OMML → AST) | M3 | Exact round trip for all reference equations; Word's own markup (defaults, multi-letter runs, styles) understood; unknown parts kept in red |
| ✅ Edit equations from Word | M5 | Double-click an equation in Word → it opens in MathBlocks → **Update in Word** replaces it in one undo step; equations typed in Word are adopted on first double-click (D-018) |
| ✅ Equation library | M4 | Local SQLite database: folders and sub-folders, names, descriptions, tags, favourites, recently used; search by name, `#tag`, `is:fav`, description or LaTeX; drag-and-drop into folders; right-click menu (rename, duplicate, move, favourite, delete); built-in examples (D-019) |
| ✅ Version history | M4 | Every save keeps a version; view or restore any version (restoring adds a new version) |
| ✅ Autosave & crash recovery | M4 | Editor content saved as a draft 1.5 s after each change and restored at the next start; daily database backups (14 kept) |
| ✅ Library import/export | M4 | One JSON file with folders, tags and history; import merges (newer wins) |
| ✅ Linked equations | M6 | Insert library equations as linked copies; a new version updates every copy in all open documents (one undo per document); pasted copies stay linked; copies edited in Word are detected and you choose Replace or Keep (unlink); reopened documents are checked ("Update now"); equations from other computers can be added to the library; Unlink; Library tab lists copies with Go to; ribbon toggle "Show linked equations" (D-020) |
| ✅ Document registry | M5 | Each .docx stores the definitions of the linked equations it uses |
| ✅ .doc warning | M5 | Saving a .doc that contains MathBlocks equations asks first |
| ✅ Harpoon vectors | M6+ | `\overrightharpoon` / `\overleftharpoon` accents (U+20D1/20D0 in Word), palette templates (bold vector and vectrix with harpoon), Word style option "Harpoon" for all `\vec` |
| ✅ MathType conversion | M9 | Sidebar → "Convert MathType document…" (or Ctrl+K): turns every MathType equation (MathType 4–7, `Equation.DSMT4`) in a .docx into a native, editable MathBlocks equation, saved as a new file "… (MathBlocks).docx"; the original is untouched. Equation numbers, bookmarks and cross-references (MathType's SEQ / REF / GOTOBUTTON fields) keep working. Bold vectors, harpoons, hats, dots, primes, integrals with limits, matrices, piles (aligned), cases, fences, spaces are converted. A report lists every display equation with its number and anything that needs a look; objects that cannot be read are left as MathType objects |
| ✅ MathType conversion in Word | M9 | Ribbon **MathBlocks → Convert MathType equations** (or Ctrl+K): converts the open document in place, one Ctrl+Z in Word undoes it. Double-clicking a MathType equation offers "Convert and edit" (Cancel opens MathType as before) |
| ✅ Equation numbering | M8 | Toolbar **Numbered** (next to Display/Inline) or ribbon **Number equation** toggles a number: the equation gets its own paragraph, centred, with the number at the right margin, as Word fields (SEQ) that renumber automatically. Styles (1), [1], 1, and with chapter number (2.1) from numbered Heading 1 (Word style tab) |
| ✅ Cross-references | M8 | Ribbon **Insert reference** (or Ctrl+K → "Insert reference to an equation…"): pick a numbered equation (MathBlocks or MathType numbers, with preview and search); inserts a Word REF field that follows renumbering. **Update numbers** renumbers and refreshes references |
| ✅ Templates (use with other symbols) | M7 | Any equation (library right-click → "Use with other symbols…", or Ctrl+K) lists its symbols (v₀, θ, 𝐫, ŝ₂…); type replacements and see the result live; powers are kept (v₀² → u₁²); open it in the editor or send it to Word as an independent equation |
| ✅ Symbol index | M11 | Bottom panel **Symbols** tab: every symbol of the current equation, or (with Word) of the whole document: how often and in which equations it appears, where it is defined (first "v₀ = …"), Go to each equation; **Rename everywhere** replaces a symbol in all the document's equations in one undo step (linked copies through their library equation) |
| ✅ Export | M10 | Canvas **⤓** menu (or Ctrl+K): copy as image (PNG) or MathML, save as SVG or PNG in LaTeX quality (MathJax, New Computer Modern, works offline); "Export the Word document's equations as LaTeX…" writes a compilable .tex with numbered equations as `\tag`/`\label` |
| ✅ Classic equations (MathType look) | Step 2 | Default for new equations: MathBlocks typesets them itself with MathType's fonts and rules (Times New Roman, Symbol; MathType's spacing, 150 % integrals) and places them in Word as sharp pictures (SVG + PNG for Word 2016) inside the MathBlocks wrapper; the source travels with them, so double-click edits them in MathBlocks. Word style tab: Classic or native Word equation, size, live preview. Numbering, references, linked copies, renaming and MathType conversion all work with Classic equations |
| ✅ Floating editor | Step 3 | Right-click a MathBlocks equation in Word: a small MathBlocks editor opens right next to it instead of Word's menu: the equation, a command line (type /frac, /matrix, /bold, /numbered… with suggestions), and collapsible sections (Preview in Word, Symbols and templates, LaTeX, Style). Enter applies (linked copies: updates every copy), Esc cancels; ☰ shows Word's own menu (cut, copy, paste), ↗ opens the full MathBlocks window. Double-click still opens the full window |
| ✅ Change notation across the document | Next | Ctrl+K → "Change notation across the document…" (or Symbols tab → Change notation…): lists the decorated-symbol notations the document uses (arrow, bold, harpoon, hat, double bar, double arrow, double underline…, with counts and letters); choose one, optionally only some letters, and the notation to use instead: every equation changes in one undo step (linked copies through the library); live before/after example |
| ✅ Keyboard shortcuts in Word | Next | While Word is in front: **Ctrl+Alt+M** edits the equation at the cursor in the floating editor (or starts a new one there; selected LaTeX becomes its content), **Ctrl+Alt+L** turns the equation at the cursor into its LaTeX text and back, **Ctrl+Alt+N** numbers/un-numbers it, **Ctrl+Alt+R** inserts a reference. Ribbon key tips: Alt, Q, then O (open), N (number), R (reference), U (update numbers), C (convert MathType), L (convert LaTeX) |
| ✅ Convert LaTeX in a document | Next | Ribbon **Convert LaTeX** (or Ctrl+K): every expression written as $…$, $$…$$, \(…\) or \[…\] in the text becomes a MathBlocks equation (display LaTeX alone in its paragraph becomes a display equation), one undo step; LaTeX with errors stays as text and is counted |
| ✅ Bold shortcut | M6+ | Ctrl+Shift+B toggles bold on the selection or the symbol before the cursor (as in MathType) |
| ✅ Auto-update | M2 | App checks the latest build, downloads in the background, one-click restart; app installs and updates the Word add-in itself (D-014) |
| ✅ Symbol palette (MathType-style) | M2 | ~300 symbols and templates: 9 symbol groups (relations, spaces/dots, operators, arrows, logic, sets, calculus symbols, Greek, Greek capitals), 8 template groups (brackets, fractions/roots, scripts, sums/products, integrals, accents/bars, labeled arrows, matrices/cases), topic tabs (Algebra, Derivatives, Vectors & mechanics, Matrices, Orbital & control, Trig, Statistics), Recent tab, quick-access bar (right-click to pin/unpin), search by name/meaning/LaTeX, rendered previews, top or side layout (switchable), works in visual and LaTeX-only modes; every item is also a Ctrl+K command |

## In progress

| Feature | Milestone |
|---|---|
| 🚧 M1 validation on a real Word installation (checklist) | M1 |

## Planned

See [ROADMAP.md](ROADMAP.md) for milestones. Highlights: MathLive visual editor, LaTeX mode with
completion, command palette, library on SQLite, linked blocks, parameterized templates, symbol search
by meaning, numbering/references, MathType migration, precision mode, dependency manager.

## Known limitations

- OMML cannot draw column rules in matrices (`\hline`, `|c|c|` are ignored).
- Negative space `\!` has no OMML equivalent and is dropped.
- Several different `\middle` delimiters in one group: only the first is used (warning shown).
- `\color`, font sizes and `\newcommand` are not supported yet.

## Known bugs

| Bug | Status |
|---|---|
| 🐞 Installer error "Error opening file for writing …\MathBlocks\connector\MathBlocks.WordConnector.dll": the add-in was installed into the app's own folder (Windows paths ignore case), so Word locked a file the installer must replace | Fixed in 0.1.14 (separate add-in folder) and 0.1.17 (DLL embedded in the app, no loose file for the installer to overwrite) |
| 🐞 Drag and drop in the library did nothing in the desktop app (the window's file-drop handler swallowed drag events) | Fixed: file drop disabled for the window |
| 🐞 "Unknown method replaceEquation": Word was still running the previous add-in | The app now detects an outdated add-in and asks to restart Word |
| 🐞 After saving, the next equation was saved as a new version of the first one | Fixed: **New** button (Ctrl+N), clearing the editor detaches, title shows "Library: name" |
| 🐞 Empty boxes inside bold templates (vectrix, bold vectors, unit vectors, dyadics…) could not be filled by clicking, and lost their bold | Fixed: click selects the box under the pointer; bold slots insert a selected bold sample letter whose first keystroke keeps the style. Verified on all 172 templates (Tab and click) |
| 🐞 Letters typed after an upright `d` became upright (`\mathrm{dx}`) | Fixed: the editor uses a dedicated differential-d atom |
| 🐞 Clicking empty canvas space did not focus the equation | Fixed |
| 🐞 Empty boxes drawn too heavy | Fixed: thin outline box |
| 🐞 Equation wrapper box drawn around Word's equation frame | Fixed: wrapper hidden (D-013) |
| 🐞 Vector / dot / hat buttons inserted an empty slot that could not be typed into | Fixed |
| 🐞 Toolbar buttons did not wrap the selected expression (focus lost on click) | Fixed |
| 🐞 MathLive `\\placeholder{}` reached Word as red text | Fixed: parsed as an empty slot |
| 🐞 Connector failed to load (0x80070002) when the Windows user name contains a space: install.ps1 wrote a URL-escaped CodeBase (`%20`) | Fixed in install.ps1; reinstall |
