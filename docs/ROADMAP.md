# Roadmap

Priorities: mathematical accuracy → native Word compatibility → linked-block reliability →
editing experience → ease of use → performance → extensibility → visual quality.

| Milestone | Contents | Exit criteria | Status |
|---|---|---|---|
| **M1 Foundation & spikes** ✔ (A10–A14 pending) | Repo, docs, monorepo; AST; LaTeX parser/serializer; OMML writer; Word packaging; spike `.docx` files; Tauri app shell; VSTO connector skeleton (named pipe, insert equation); Windows CI | All `[M1]` items in the checklist answered and recorded in DECISIONS.md; style default chosen | **In progress** |
| M2 Editor | MathLive adapter, structure toolbar, LaTeX mode (CodeMirror 6: highlighting, completion, bracket matching, diagnostics), two-way sync, command palette, themes, resizable panels | 30 reference equations buildable in both modes | **Done** (awaiting user test) |
| M3 Conversion | Full Tier-1 LaTeX ⇄ AST ⇄ OMML; OMML → AST reader (edit existing Word equations) | Golden + round-trip suites green | **Done**: OMML → AST reader, exact round trip on all reference equations |
| M4 Library & persistence | SQLite schema + migrations, library UI (folders, tags, search, favourites, recents), autosave & crash recovery | Kill-test recovery passes | **Done** (awaiting user test; collections moved to M7) |
| M5 Word basics | Insert/edit inline & display, double-click to edit, registry, Style Profiles | **MVP**: tested on a 50-page sample thesis | **Done**: double-click to edit, Update in Word, document registry, .doc warning |
| M6 Linked components | Sync engine, reconciliation (copy/delete/orphan/conflict), journal, single-step undo, instance panel | Scenario suite: copy, paste, delete, undo, crash, reopen | **Done** (simulated Word suite green; awaiting user test) |
| M7 Components & search | Parameterized templates, independent copies, detach; symbol & meaning search; snippets; collections | — | **Done**: templates by symbol substitution; unlink = detach; meaning search and collections in the palette |
| M8 Derivations & numbering | Equation numbering, references, alignment tools | — | **Done** (numbering, references, update; awaiting test in Word). Alignment tools: aligned environments exist; dedicated tools later |
| M9 MathType migration | MTEF reader → AST → OMML, review UI | User's sample document converts | **Done** (document conversion; all 152 equations of the sample convert; awaiting test in Word). Also in the open Word document (ribbon button, one undo step) and by double-clicking a MathType equation |
| M10 Precision mode & export | MathJax → EMF/SVG, baseline alignment, PDF/LaTeX export | — | **Export done** (SVG/PNG/MathML, document → LaTeX). Precision mode (pictures in Word) postponed: native equations are the default (D-015) |
| M11+ Tier 3 | Semantic layer, dependency manager, relationship graph, closed-document updates, other connectors | — | **Started**: symbol index (defined/used, rename everywhere), list of symbols, definition check, equation dependencies. Next: closed-document updates, cross-chapter consistency |

## Tiers

- **Tier 1 (MVP, M1–M5):** desktop interface, visual + LaTeX editor, essential structures incl.
  basic aligned derivations, live preview, library, autosave, Word insertion with IDs from day one.
- **Tier 2 (M6–M10):** linked blocks & sync, components & templates, symbol search, collections,
  numbering & references, shortcuts, MathType migration, precision mode & export.
- **Tier 3 (M11+):** dependency tracking, variable definitions, relationship visualisation,
  document analysis, cross-document components, transformations.

## Deferred / later considerations

- Co-authoring on OneDrive/SharePoint (Custom XML Part conflicts).
- Right-to-left (Arabic) documents.
- Office.js connector (Word 365 / web / Mac), PowerPoint.
