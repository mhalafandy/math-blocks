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
| ✅ Spacecraft-dynamics notation | M2 | Palette tab with vectrix notation (bold arrow vectors, vectrix transpose, bold column matrices, unit vectors, body integrals, dm/dA/dV, iterated integrals with limits, ranges, cross matrices, bold Greek, dyadics); generic mechanics equations in the reference set |
| ✅ Matrix bracket padding | M2 | Brackets slightly taller than the entries (variant 3, default in the tuned profile, D-017) |
| ✅ Workspace layout | M2 | Collapsible/resizable library, symbols and bottom panels (Ctrl+B, Ctrl+Alt+B, Ctrl+J), focus mode, canvas zoom (Ctrl +/−/0), panel state remembered (D-016) |
| ✅ LaTeX editor (CodeMirror 6) | M2 | Syntax colours, completion of every supported command with fill-in templates (Tab between fields), bracket matching, auto-closing { and [, error underlines with hover messages, undo/redo, two-way sync with the visual editor |
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
| 🐞 Empty boxes inside bold templates (vectrix, bold vectors, unit vectors, dyadics…) could not be filled by clicking, and lost their bold | Fixed: click selects the box under the pointer; bold slots insert a selected bold sample letter whose first keystroke keeps the style. Verified on all 172 templates (Tab and click) |
| 🐞 Letters typed after an upright `d` became upright (`\mathrm{dx}`) | Fixed: the editor uses a dedicated differential-d atom |
| 🐞 Clicking empty canvas space did not focus the equation | Fixed |
| 🐞 Empty boxes drawn too heavy | Fixed: thin outline box |
| 🐞 Equation wrapper box drawn around Word's equation frame | Fixed: wrapper hidden (D-013) |
| 🐞 Vector / dot / hat buttons inserted an empty slot that could not be typed into | Fixed |
| 🐞 Toolbar buttons did not wrap the selected expression (focus lost on click) | Fixed |
| 🐞 MathLive `\\placeholder{}` reached Word as red text | Fixed: parsed as an empty slot |
| 🐞 Connector failed to load (0x80070002) when the Windows user name contains a space: install.ps1 wrote a URL-escaped CodeBase (`%20`) | Fixed in install.ps1; reinstall |
