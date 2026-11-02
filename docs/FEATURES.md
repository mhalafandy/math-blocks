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
| 🐞 Equation wrapper box drawn around Word's equation frame | Fixed: wrapper hidden (D-013) |
| 🐞 Vector / dot / hat buttons inserted an empty slot that could not be typed into | Fixed |
| 🐞 Toolbar buttons did not wrap the selected expression (focus lost on click) | Fixed |
| 🐞 MathLive `\\placeholder{}` reached Word as red text | Fixed: parsed as an empty slot |
| 🐞 Connector failed to load (0x80070002) when the Windows user name contains a space: install.ps1 wrote a URL-escaped CodeBase (`%20`) | Fixed in install.ps1; reinstall |
