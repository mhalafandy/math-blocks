# Changelog

All notable changes are recorded here. Format: [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — Milestone 1

### Added
- Project documentation: README, ARCHITECTURE, ROADMAP, FEATURES, CHANGELOG, DEVELOPMENT, DECISIONS,
  M1 test checklist.
- pnpm monorepo with strict TypeScript and Vitest.
- `math-core`: canonical presentation AST.
- `math-latex`: tolerant LaTeX parser with positioned diagnostics, and serializer with a structural
  round-trip guarantee.
- `math-omml`: AST → OMML writer; Style Profiles (Word default, tuned; font and vector variants).
- `ooxml`: content controls, Flat OPC packages for `InsertXML`, `.docx` builder with custom XML
  registry, short base62 IDs and the `mb1|block|instance` tag format.
- 32 reference equations from calculus, linear algebra, ODEs, mechanics, orbital mechanics,
  control and physics, used by tests and spike documents.
- `pnpm spike:docx`: generates five Word test documents for the style comparison and
  content-control persistence tests.
- Desktop app (Tauri 2, React, MathLive): editor workspace, LaTeX diagnostics, command palette,
  inspector, themes, resizable panels, Send to Word.
- Word connector: COM add-in for Word 2016+ with ribbon tab, self-test equation, named-pipe client,
  single-step undo insertion, double-click detection; per-user install scripts.
- `connector-protocol`: JSON-RPC protocol v1 between app and connector.
- GitHub Actions: tests on Linux; Windows build of the installer and connector.

### Fixed (real-Word testing: copy/paste, numbering, multi-line)
- **Pasted equations keep their identity.** A Classic picture that lost its content control
  (picture-only copies, some paste modes) is recognised by the source in its EMF (alt text as a
  backup) and wrapped again with a new instance id on double-click, right-click, Ctrl+Alt+M and
  when the document is indexed. Copies sharing an id get new ids; linked copies are registered
  or unlinked; numbered copies get their own number bookmark. New command *Repair equations*
  (Ctrl+K) reports what it found.
- **Numbering:** numbers and references are single MathType-style fields (no stray spaces; the
  bookmark covers the whole number). Formats (1), (1.1), (1.2.3); brackets ( ), [ ] or none;
  separator . or -; appendix (A.1); restart per chapter or section; chapter numbers from Word's
  heading numbering (STYLEREF) or hidden MathBlocks markers. References with or without brackets.
  Numbers sit level with the centre of multi-line equations. *Upgrade numbering* rebuilds older
  numbers and references (backup, one undo step).
- **Multi-line equations:** Enter in a display equation starts a new line at the cursor (aligned at
  the relation, continued lines start with \quad, centred lines when there is no relation);
  Ctrl+; sets the alignment point of the current line. Templates: aligned derivation, long equation
  broken over lines (multline), centred lines (gathered), continued line. Classic draws multline
  (first line left, last right) and gathered (centred) properly; Word gets equation arrays;
  the .tex export writes multline as its own environment. In the floating editor, Ctrl+Enter
  applies a display equation (Enter applies inline ones).
- **Page width:** a width bar under display equations ("112% of line width", against the text
  width Word reports for that paragraph, minus the number for numbered equations) and, when too
  wide, a suggested line break to confirm. Equations are never shrunk. The Classic preview shows
  the line width as guide lines.

### Added (thesis tools, M11)
- List of symbols (nomenclature) inserted into Word and regenerated in place, keeping descriptions.
- Definition check (used before defined, never defined) and equation dependencies in the Symbols tab.
- Thesis check across all chapter files (read from disk): notation, definitions, outdated linked
  copies, unconverted MathType; list of symbols for the whole thesis.
- Derivation lines: Ctrl+Shift+Enter adds an aligned line starting from the last right-hand side.

### Added (recognition, snippets, consistency)
- Equation from a screenshot: paste an image (main window or floating editor) or pick a file;
  Claude turns it into LaTeX (your own Anthropic API key, kept locally).
- Snippets: trigger + Tab (ddt, pdv, intab, mat3, skew, dyad, cases…), editable.
- Notation consistency check with "Make all …" in the Change notation dialog.
- Equation numbers shown in the linked-copies and symbol lists.

### Added (ease of writing)
- MathType-style shortcuts in the equation editor (fraction, root, scripts, integral, sum,
  brackets, vector, hat, dots, bar, matrix, thin space, Ctrl+G Greek), autocorrect for arrows,
  relations, ±, ×, ∞…, keyboard shortcut sheet (F1), empty-editor hint.
- Floating editor: favourite symbols row, LaTeX and library equations in the command line.
- Smoother Classic preview while typing; the editor's own menu button is hidden (duplicate).

### Added
- Keyboard shortcuts in Word (Ctrl+Alt+M edit/new at cursor, Ctrl+Alt+L equation ↔ LaTeX,
  Ctrl+Alt+N number, Ctrl+Alt+R reference; active only while Word is in front) and ribbon key
  tips (Alt, Q, …).
- Convert all LaTeX in a Word document to MathBlocks equations (ribbon Convert LaTeX).
- Change notation across the document: vectors, dyadics/tensors, unit vectors (detects the
  forms used, changes one form for chosen letters everywhere in one undo step).

### Fixed (0.1.39)
- Word flickered when a document with MathBlocks equations was opened: the background check of
  linked equations asked Word for every equation's page number (which makes Word lay out the
  document) and ran twice. Background checks now list equations without page numbers, with
  Word's screen updating paused, once per document.

### Changed (0.1.38, floating editor)
- Floating editor redesigned: transparent window with a rounded card and shadow, no title bar,
  larger editing area, sections as a compact tab row; sized by its content (no more growing
  when resized); behaves like a popover: not always on top, closes when you click elsewhere.

### Added (step 3)
- Floating editor on right-click: second always-on-top window positioned under the equation
  (Word's screen coordinates), commands-first layout with collapsible sections; the main window
  keeps the Word connection and applies the result.

### Fixed (0.1.36)
- Ctrl+Shift+B on vectors: bold now goes on the letter (\vec{\mathbf{r}}, upright like MathType's
  vector style; Greek in bold italic), works with the cursor right after an accented symbol, and
  makes a partly bold selection fully bold. Bold applied around accents, fractions and other
  structures reaches the letters inside (it used to be ignored there).

### Changed (0.1.35)
- Classic equations are placed like MathType's: a classic (VML) picture holding a vector EMF,
  so Word shows the simple object frame (no rotation handle or layout button) and every Word
  version draws them sharply. The equation's source is stored inside the EMF (and in the alt
  text), so double-click always finds it ("the equation arrived empty" fixed).

### Fixed (0.1.33)
- "Couldn't draw the equation": the PNG copy of Classic equations is now painted directly from
  the engine (the app's security policy blocked the temporary image); blob images allowed for
  exports.

### Added (Classic equations)
- `packages/math-render` typesetting engine; Classic style from MathType's own preferences
  (read from MTEF) and fonts; Classic pictures in the app (insert, update, numbering, linked
  copies, rename, MathType conversion), Word style tab with look, size and live preview.

### Added (M10)
- Export: copy as PNG or MathML, save SVG/PNG (MathJax bundled, offline), Word document's
  equations as a LaTeX file.

### Added (M11)
- Symbol index of the document with definition and uses, Go to, and Rename everywhere.

### Added (M7)
- Templates: use any equation with other symbols (symbol detection with subscripts, accents and
  bold; powers kept), from the library menu or Ctrl+K.

### Added (M8, M9 in Word)
- Equation numbering: Numbered mode, ribbon Number equation / Insert reference / Update numbers,
  number styles with chapter numbers, reference picker listing MathBlocks and MathType numbers.
- MathType conversion of the open Word document (ribbon, one undo step) and double-click on a
  MathType equation to convert and edit it; `convertFlatOpc` in `packages/mathtype`.

### Fixed (user testing of 0.1.23, checklist E2/E3)
- Equations whose math Word stores inside the content control (or behind bookmarks, tracked
  changes) are read correctly: double-click opens the right equation; updating no longer fails
  with "arrived empty".
- Updating an equation removes the whole old equation, so no empty equation box is left behind.
- Double-clicking a linked copy opens its library equation even when Word's copy cannot be read.
- The "Editing from Word" banner moved below the toolbar; the toolbar no longer runs off-screen.
- The Word add-in logs how the math sits in Word's XML (connector.log) for diagnosis.

### Added (M9)
- MathType conversion: `packages/mathtype` reads OLE compound files and MTEF v5 (MathType 4–7),
  translates them to LaTeX/AST and converts a .docx: every MathType object becomes a native
  equation in a MathBlocks content control; paragraphs, numbers, bookmarks and cross-reference
  fields are kept; unused embeddings and previews are removed. App command "Convert MathType
  document…" with a conversion report and "Open in Word".

### Fixed (user testing of 0.1.22)
- Library drag and drop in the desktop app; detection of an outdated Word add-in; saving a second
  equation no longer overwrites the first (New button, Ctrl+N; clearing the editor detaches).
- Diagnostics when an equation from Word cannot be read.

### Added
- Harpoon vector accents and templates; "Harpoon" vector style for Word; Ctrl+Shift+B bold toggle.

### Added (M5/M6)
- Linked equations: linked copies from the library, updates to all copies in all open documents,
  copy/paste handling, conflict detection for copies edited in Word, out-of-date check when a
  document opens, unlink, list of copies with Go to, ribbon toggle to show linked equations.
- Document registry (Custom XML Part) and a warning before saving MathBlocks equations as .doc.

### Added (M4)
- Equation library: folders, tags, favourites, recent, search, drag and drop, context menus,
  Save (Ctrl+S) / Save as new (Ctrl+Shift+S), title with unsaved marker.
- Version history with view and restore (Library tab in the bottom panel).
- Autosave and crash recovery; daily database backups; JSON import/export.

### Added (M3/M5)
- OMML → AST reader: equations in Word can be read back exactly.
- Double-click an equation in Word to edit it in MathBlocks; "Update in Word" replaces it in place.
  Equations typed directly in Word are wrapped (adopted) on first double-click.

### Added (M2)
- LaTeX editor rebuilt on CodeMirror 6: syntax colours, auto-completion with templates, bracket
  matching, error underlines from the MathBlocks parser, undo/redo.
- New workspace layout (D-016): collapsible library (left), symbols (right) and LaTeX/details
  panel (bottom); focus mode; centred, zoomable, horizontally scrolling equation canvas; thin
  scrollbars; search results with names; previews with sample letters.
- "Spacecraft dynamics" palette tab in vectrix notation; thesis Appendix A equations in the reference set.
- Style Profile option for taller matrix brackets (4 variants to compare in `m2-matrix-brackets.docx`).
- Auto-update of the app (signed updates from the "Latest test build" release) and automatic
  installation/update of the Word add-in by the app (D-014). Builds are versioned 0.1.<build>.
- Symbol palette with top (MathType-style) and side layouts, quick access, recents, topic tabs and
  meaning search; all items available in the command palette.

### Fixed
- Every template box can be filled by clicking or Tab (172/172 verified); bold slots stay bold.
- Typing after an upright differential d no longer makes the variable upright.
- Clicking anywhere on the canvas puts the cursor in the equation; thinner empty boxes.
- The Word add-in DLL is embedded in the app executable instead of shipped as a separate file, so installing an update never collides with Word or an antivirus scan holding the file.
- Installer could not update while Word was open: the Word add-in now lives in its own folder (`%LOCALAPPDATA%\MathBlocksWordAddin`).
- Equation wrapper no longer draws a second box around Word's equation (D-013).
- Structure buttons (vector, dot, hat…) now insert a typeable slot, and wrap the selection when there is one.
- MathLive placeholders are parsed as empty slots instead of unknown commands.
- Connector install on user profiles whose name contains a space (CodeBase must not be URL-escaped).

### Changed
- Matrix, row- and column-vector brackets are now slightly taller than their entries by default (D-017).
- Default math font: Latin Modern Math (D-013).
- Word connector implemented as a plain COM add-in instead of VSTO (D-011).
