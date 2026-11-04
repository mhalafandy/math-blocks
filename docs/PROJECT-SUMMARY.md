# MathBlocks: project summary (for review and enhancement ideas)

_State as of build 0.1.43 (November 2026). Repository: github.com/mhalafandy/math-blocks._

## 1. What it is and who it is for

MathBlocks is a desktop equation editor for **Microsoft Word 2016+ on Windows**. It aims to replace
MathType for someone writing a mathematics- and engineering-heavy thesis (spacecraft dynamics: vectors,
dyadics, vectrix notation, matrices, integrals). The owner's thesis is currently written with MathType.

The goals, in priority order:
1. mathematical accuracy;
2. native Word compatibility;
3. reliable linked equations;
4. editing experience;
5. ease of use;
6. performance;
7. extensibility;
8. visual quality.

In practice the owner also insists on **visual quality at least equal to MathType**.

Test machine: Windows 11, Office 2021 Click-to-Run 64-bit, Word 16.0.16501.

## 2. Architecture

| Part | Technology | Role |
|---|---|---|
| Desktop app (`app/`) | Tauri 2 (Rust shell) + React 19 + Zustand, MathLive 0.111 visual editor, CodeMirror 6 LaTeX editor | Editing, library, all logic |
| Rust shell (`app/src-tauri`) | Tauri plugins: updater, process, dialog, global-shortcut; windows-sys | SQLite library, file I/O, system fonts, global Word shortcuts, named-pipe host |
| Word add-in (`connector-word/`) | Plain C# COM add-in (.NET 4.8, not VSTO) with a ribbon XML | Talks to Word's object model; runs commands sent by the app |
| Protocol (`packages/connector-protocol`) | JSON-RPC as JSON lines over a named pipe (the app hosts it) | Typed requests and events between the app and the add-in |
| `math-core` | TypeScript | Canonical presentation AST (about 20 node kinds) |
| `math-latex` | TypeScript | Tolerant LaTeX parser with positioned diagnostics, plus a serializer with a guaranteed structural round trip |
| `math-omml` | TypeScript | AST ⇄ OMML (Word's native equations), with style profiles |
| `ooxml` | TypeScript | Content controls, Flat OPC packages for `Range.InsertXML`, a .docx builder, VML picture runs |
| `mathtype` | TypeScript | Reads MathType's binary data (OLE CFB → MTEF) → AST/LaTeX; converts whole .docx files |
| `math-render` | TypeScript + opentype.js | **Own typesetting engine**: AST → TeX-like boxes → SVG, EMF and PNG |

- **Build tooling:** pnpm monorepo, strict TypeScript, Vitest (276 tests).
- **CI:** GitHub Actions runs the tests on Linux and builds the Windows installer and add-in.
- **Releases:** a rolling "Latest test build" release (`dev-build`), version 0.1.<run number>.
- **Updates:** signed auto-update; the app also installs and updates the Word add-in itself.

### Equation identity in Word

- Every MathBlocks equation sits in an invisible content control.
- Its tag has the form `mb1|block|instance`, with short base62 IDs.
- Each .docx stores a registry (custom XML) holding the definitions of the linked equations it uses.

### Two ways an equation can appear in Word

1. **Native**: an OMML equation that Word itself can edit.
2. **Classic** (the default since Step 2): MathBlocks typesets the equation itself and places a VML picture containing an EMF.
   - The LaTeX source is stored in an EMF GDI comment (`MathBlocks1:{json}`), with the alt text as a backup.
   - Double-click, right-click or a shortcut reopens it in MathBlocks.
   - The look copies MathType's "Classic" style, using parameters read from MathType's own preferences:
     - fonts: Times New Roman, plus Symbol for Greek with an oblique slant;
     - scripts at 58/42 %, big operators at 150 %;
     - MathType's fraction baselines, rule thickness, and superscript/subscript offsets;
     - STIX Two Math for tall delimiters and assembled pieces.
   - This was chosen because no native Word OMML style looked as professional as MathType (D-015, D-024).

### Equation modes

- **Display**, **inline**, and **numbered**.
- A numbered equation is a MathType-style paragraph: centred equation, then a tab, then a number built from a Word SEQ field, plus a hidden bookmark used for cross-references.

## 3. Features implemented

**Editor**
- Visual (MathLive) and LaTeX (CodeMirror) editors with two-way sync. The LaTeX editor has completion, diagnostics and bracket matching.
- Command palette (Ctrl+K) and a symbol palette with about 300 symbols and templates, searchable by name or meaning.
- Spacecraft-dynamics notation templates.

**Writing speed**
- MathType keyboard shortcuts: Ctrl+F fraction, Ctrl+R root, Ctrl+H/L scripts, Ctrl+Shift+V vector, Ctrl+G then a letter for Greek, and more.
- Autocorrect: `->` becomes →, `<=` becomes ≤, `+-` becomes ±, and so on.
- **Snippets**: type a trigger and press Tab (`pdv`, `ddt`, `intab`, `mat3`, `skew`, `dyad`, `cases`…). The boxes are Tab stops, and the snippets are editable.
- Ctrl+Shift+B toggles bold (also on accented vectors).
- F1 shows a sheet of every shortcut.

**Equation from a screenshot**
- Paste an image, or pick a file. The Claude API (Anthropic TypeScript SDK, called directly from the app, model `claude-opus-5-5`, low effort) returns LaTeX, which opens in the editor for review.
- It uses the user's own API key, stored locally.

**Library**
- Local SQLite database: folders, tags, favourites, recently used, and search (`#tag`, `is:fav`).
- Version history, autosave, crash recovery, daily backups, JSON import/export.

**Linked equations**
- Insert a library equation as a linked copy. Saving a new version updates every copy in all open documents, with one undo step per document.
- Copies edited directly in Word are detected by content hash; the user chooses whether to replace them or unlink them.
- Reopened documents are checked for outdated copies.

**Word integration**
- Double-click an equation → it opens in the full app → "Update in Word" replaces it in one undo step.
- Equations typed in Word are adopted the first time they are double-clicked.
- **Floating editor**: right-clicking an equation opens a small transparent popover beside it instead of Word's context menu. It has:
  - a command line (/frac, /bold, /numbered…);
  - collapsible sections: preview, symbols, LaTeX, style;
  - a favourite symbols row.

  Enter applies the change and Esc cancels.
- **Global shortcuts** (active only while Word is the foreground window):
  - Ctrl+Alt+M: edit the equation at the cursor, or start a new one;
  - Ctrl+Alt+L: turn the equation into its LaTeX text and back;
  - Ctrl+Alt+N: number or un-number it;
  - Ctrl+Alt+R: insert a reference.
- Ribbon key tips: Alt, then Q, then a letter.
- Warning before saving as .doc.

**Numbering and references**
- Numbers as Word fields, in the styles (1), [1], 1, or (2.1) with the chapter number.
- Insert a cross-reference (a REF field). "Update numbers" renumbers and refreshes them.

**MathType migration**
- Convert a whole .docx into a new file. All 152 equations of the owner's sample convert.
- Convert in place inside the open document, in one undo step.
- Double-clicking a MathType equation offers "Convert and edit".
- MathType numbers and cross-references keep working after conversion.

**Convert LaTeX**
- Every `$…$`, `$$…$$`, `\(…\)` and `\[…\]` in the document text becomes an equation, in one undo step.

**Document-wide tools**
- **Symbol index**: where each symbol is defined and used, with "Rename everywhere".
- **Change notation**: rewrite every vector written with an arrow as bold with a harpoon, change all dyadics, and so on. It can be limited to some letters, and is one undo step.
- **Consistency check**: lists letters written in more than one form, with a one-click fix.
- Templates: reuse an equation with other symbols.
- Equation numbers are shown in the library and symbol lists.

**Export**
- PNG, SVG and MathML, rendered with MathJax and bundled for offline use.
- The whole document's equations can be exported as a compilable .tex file.

## 4. Key decisions (full text in docs/DECISIONS.md)

- **D-001**: a canonical presentation AST. Every format converts through it.
- **D-002 / D-011**: a COM add-in rather than Office.js, because Word 2016 must be supported.
- **D-003**: a Tauri desktop app as the main UI; Word is only a target.
- **D-007**: an in-house tolerant LaTeX parser.
- **D-008**: the `mb1|block|instance` tags.
- **D-012**: the app hosts the named pipe, using JSON lines.
- **D-013**: invisible wrappers.
- **D-014**: a self-updating app that also manages the add-in.
- **D-018**: editing equations by reading them back and replacing them in place.
- **D-019**: SQLite in Rust, with the logic in TypeScript.
- **D-020**: linked equations use a registry stored in the document and content-hash conflict detection, because Word does not enforce content-control locks around equations.
- **D-021–D-023**: MathType conversion works from the binary MTEF data; numbers are SEQ fields.
- **D-024**: MathBlocks' own typesetting engine, with Classic pictures as the default and native OMML as an option.

## 5. Status and what is not yet verified

- Every milestone M1–M10 is implemented. M11 (semantic layer, dependency manager) has started with the symbol index.
- The owner has confirmed in real Word:
  - installation and connection;
  - insertion and undo;
  - the Classic look ("way better, close enough");
  - the picture frame and editing round trip;
  - the bold fix;
  - the first floating-panel design ("better, polish later").
- **Not yet tested in real Word**:
  - the new floating-panel position and sizing;
  - the global shortcuts;
  - Convert LaTeX;
  - Change notation and the consistency check;
  - numbering with Classic pictures;
  - screenshot recognition;
  - snippets;
  - the full MathType conversion pass on thesis chapters;
  - linked-copy scenarios.

  These tests are listed in docs/M1-CHECKLIST.md, Parts C–M.
- The owner has deferred UI polish until the functionality is complete.

### Known limitations

- OMML has no column rules in matrices, and no equivalent for negative space `\!`.
- `\color`, font size commands and `\newcommand` are not supported yet.
- Classic rendering needs Times New Roman and Symbol, which Windows has. Elsewhere it falls back to STIX.
- Word's object model is slow on large documents. The add-in turns off screen updating and uses a light listing mode to limit flicker.
- Only Windows and Word desktop are supported. Not supported: Mac, Word on the web, co-authoring on OneDrive or SharePoint, right-to-left documents.

## 6. Where analysis and ideas would help most

1. **Robustness on a real thesis**: 150+ equations, many numbered, with cross-references, linked copies and tracked changes. What could break? Examples: undo grouping, field updates, copying and pasting between documents, Save As .docx/.pdf.
2. **Typesetting quality versus MathType**: spacing details, kerning, delimiter sizing, accents over bold letters, alignment of multi-line derivations, the baseline of inline pictures relative to the text line.
3. **Writing speed**: what else makes typing equations faster than MathType? For example: smarter autocorrect, context-aware suggestions, recognising handwriting or PDF regions, derivation helpers that carry the previous line forward.
4. **Thesis-level features**: a list of symbols or nomenclature generated from the symbol index; checks that every symbol is defined; a relationship graph between equations; updating closed documents; consistency across chapters kept as separate files.
5. **UI/UX of the floating editor and the main window**, once the functionality settles.
6. **Risks**: dependence on Word's COM API and on the content controls surviving editing; EMF pictures in other tools (PDF export, Word Online, LibreOffice); the cost and privacy of recognition through the API.
