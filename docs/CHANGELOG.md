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

### Fixed — equation numbers read as empty (Convert numbering did nothing); Section marker placement
- MathType's and MathBlocks' numbers are MACROBUTTON fields, which have no field result: their text was read
  as empty. Convert numbering therefore found no readable MathType numbers and changed nothing, "Number
  equation" reported no number, and references by number could not resolve. Numbers are now read from the
  button's display text (the code's text and its nested fields' results).
- Section marker in an empty paragraph: Word's XML insertion put the marker in a new paragraph after the
  cursor; it now stays at the cursor.
- The broken-reference list shows the text as it reads (no field codes).
- Self-test: the equations of a conversion are listed in document order (the insert check used the reverse
  order and put its equation in the wrong section); the Update numbers undo check makes the numbers really out
  of date; a check that the later steps leave the paragraphs with the deliberate errors unchanged.

### Added — one numbering scheme per document: Convert numbering (MathType → MathBlocks)
- MathType's numbers (SEQ MTEqn/MTSec/MTChap) and MathBlocks' (SEQ MBEq/MBSec/MBChap) count separately,
  so new MathBlocks numbers did not continue MathType's in one document. Convert numbering (ribbon,
  Ctrl+K; suggested after Convert MathType) turns MathType's breaks into MathBlocks markers and its
  numbers into MathBlocks number fields, keeping each number's bookmark (ZEqnNum…), so every reference
  keeps pointing at its equation.
- Choice: keep the existing numbers, or renumber to chapter.section.equation (a section marker after each
  section heading; its number from Word's numbering or the heading text, e.g. "A.1 Frames").
- Before anything is written: every number old → new and the problems (missing section headings,
  unnumbered headings, numbers that skip, counters reset by hand, breaks without equations), with
  snippets; copy the list. One Ctrl+Z, backup first, the document stays in front; afterwards every
  number is compared with what was planned. New numbers in the document use the same format.
- Convert LaTeX: refuses to add numbers while MathType's numbering is still there (button: Convert
  numbering first); \eqref{eq:A.1.3} / \ref{…} resolve to an equation already in the document showing
  that number; a new label repeating an existing number is an error.
- Self-test: a MathType part (A.1)–(A.3) is converted, renumbered to (A.1.1)–(A.1.3) with its references
  following; a pasted section adds (A.1.4) and section A.2 with references to old and new equations;
  after Convert LaTeX and Update numbers every number is correct and unique; "keep the existing numbers"
  leaves (A.1)–(A.3) as they were; each step one Ctrl+Z.

### Changed — LaTeX interchange: chapter.section.equation numbers, labels as numbers, section markers
- Numbers are (chapter.section.equation) — (3.2.5), (A.1.3) in appendices — with the counter restarting
  at each section; references show the same format. \mbnumbering{3.2} / {A.1} after each section heading
  (as well as \mbnumbering{3} / {A} after the chapter or appendix heading).
- Labels may be the equation numbers (\label{eq:3.2.5}, \eqref{eq:A.1.3}); bookmarks _MBEq_3_2_5.
  Pre-flight warnings: missing section marker; label whose number differs from the computed one or does
  not fit the markers (references still follow the equation); two labels giving the same bookmark.
- Notation: \hat{s}_1, \hat{\mathbf{s}}_1, \mathbf{\hat{s}}_1 → \bvec{s}_1 (unit vectors of a frame);
  a frame with a subscript is reported (only I and J are dyadics, \dyadic{J}_{c}). Hughes preset: the
  dyadic is a bold capital with a single arrow (as the frames).
- Insert section marker (ribbon → Section marker, Ctrl+K): prefilled with the chapter (or appendix) of
  the marker before the cursor and the next section number; numbers are updated after it.
- Update numbers lists references to equations that no longer exist, each with the text around it
  (ribbon: a Word message; app: a list), instead of leaving Word's "Error! Reference source not found".
- docs/LATEX-INTERCHANGE.md rewritten for all of this, with a generic example. The synthetic convention
  document now has two chapters with two sections each and an appendix with two sections; the
  self-test also inserts an equation and updates numbers, inserts a section marker, and deletes a
  referenced equation (broken-reference list).

### Added — LaTeX interchange: a transcribed document becomes finished equations in one Convert LaTeX
- Convention for documents with math as LaTeX text (inline $…$; display TAB $$…$$ in
  MTDisplayEquation; numbered with TAB \label{eq:KEY}; \eqref/\ref; \mbnumbering{3} / {A} after each
  heading; notation-kind macros). docs/LATEX-INTERCHANGE.md states it with the exact LaTeX subset,
  generated from the parser's real support (`pnpm interchange:doc`; CI fails when it is out of date).
- Convert LaTeX on a whole document: a pre-flight report before anything is written (counts; every
  parse error, unknown command, duplicate label, unresolved reference, malformed display paragraph and
  typed number that differs, each with a snippet); stop, or convert the valid items.
- Output: inline objects on the baseline; display equations as objects in the paragraph's own style,
  centred; numbered ones with the number field at the right tab and a bookmark named from the label;
  \mbnumbering as the hidden numbering marker; references as cross-reference fields, unresolved ones
  highlighted and listed; numbers and references updated at the end. One Ctrl+Z, a backup for large
  documents, the document stays in front; re-running converts only what is left.
- Older forms: typed numbers "(A.n)" become number fields (warning when the computed one differs);
  MathType-style \mathbf{\overset{…\rightharpoonup}{c}}, \vec{\mathbf{S}}, \vec{\mathbf{I}} and
  \left[\begin{array}…\right] become \pvec, \vectrix, \dyadic and bmatrix.
- Word's autocorrect inside LaTeX (smart quotes, dashes, minus sign, non-breaking spaces, line breaks,
  soft hyphens, …) is undone before parsing.
- Time per equation in the result; the self-test converts a synthetic convention document (checks:
  counts, errors listed, bookmarks and numbers, references before and after Update numbers, number at
  the right margin, centring, baseline, one Ctrl+Z, second run) and a 150-equation document (time).
- Fix: finding LaTeX text with Word's Find no longer misreads ^ (Word's special codes).

### Fixed — one Ctrl+Z for every whole-document operation; add-in enabled mid-session
- Convert MathType (open document), Convert LaTeX and Update numbers run inside one undo record with a
  steady busy pointer, and report where Word closed it early if it ever does. Update numbers had no
  undo record at all (one Ctrl+Z per field). Normalize bold and Change notation use the checked-first
  replacement path (0.1.103).
- Self-test: each of these operations must leave its document in front, change it, and be undone by
  exactly one Ctrl+Z (text and every equation's LaTeX as before); Ctrl+Y redoes it.
- Add-in enabled again while Word is open: it attaches to every open window (each activated once,
  then the window you were in comes back), and logs how it was loaded and the first click events.
- Double-clicking a MathBlocks equation while the app is not running starts the app instead of
  Word's "server application cannot be found" message.

### Fixed — Repair took 6 Ctrl+Z, was slow, and the pointer flickered
- Cause (found by the self-test's probe): reading an equation's Word XML ends Word's open undo record.
  Repair read XML inside its record, so Word split it into several undo steps.
- Repair now reads everything before the operation's record opens: the dry run gives the plan
  (baselines to set, steps with nothing to do), the redraw packages are built, and every equation is
  checked; inside the record Repair only writes. The same pre-check applies to every document-wide
  replacement (restyle, rename), so those are one Ctrl+Z too.
- Each equation's XML is read once instead of three times (depth, data ID and lowering from one read),
  and not again during the real run: Repair is faster.
- One busy pointer for the whole operation instead of one per change.

### Changed — self-test closes its documents; no flicker during long operations
- The self-test saves every document it opened into its folder and closes them at the end; documents
  that were open before the test stay open and untouched.
- Long operations (Repair, Convert, restyling) no longer redraw the document while they run: faster,
  and Word does not flicker. The screen is redrawn once at the end.
- Self-test: an undo probe runs each call Repair makes alone inside an undo record and reports which
  one ends it (Repair currently takes 6 Ctrl+Z: the record closes during the baseline step).

### Fixed — Repair did not restore the number position on converted documents
- Word lists a paragraph's default tab stops (every 0.5") among its tab stops, so Repair took every
  numbered paragraph to have tab stops already and left it alone. Only custom tab stops count now.
  The paragraph gets MTDisplayEquation back (its leftover direct alignment cleared first), or the
  numbering's centre and right tab stops where the document has no such style.
- Self-test: the paragraph check lists custom tab stops only (it passed on default stops before).
  Repair's undo is diagnosed: whether Word kept the single undo record and, if not, where it closed
  and how many Ctrl+Z steps Repair takes.

### Fixed — another open document came to the front after Repair, Convert or restyling
- Closing the progress window of a long operation let Windows activate the next window in line,
  which could be another open Word document. The window that was active when the operation started
  now comes back to the front.
- Self-test: Repair and Convert check that their document stays in front; the Repair section's
  last step no longer needs an equation number.

### Fixed — Convert MathType dropped paragraph properties (number not at the right margin)
- Cause: in the open document, Convert MathType rewrote each whole paragraph. Word exported the
  paragraph without its mark — so without its <w:pPr> — and the rewrite took the paragraph's
  properties from that XML: every numbered paragraph lost MTDisplayEquation and its tab stops, and the
  number fell on Word's default tab right after the equation.
- Now only the MathType objects are replaced, one by one (the new equation in front of the object, then
  the object goes); the paragraph and its properties are never rewritten. File conversion was not
  affected (it edits document.xml run by run).
- Every in-place replacement (update, number/unnumber, Apply notation, Repair, conversion) inserts the
  new equation's run only — the package's paragraph properties are removed first.
- Repair equations gives numbered equation paragraphs that lost their style back MTDisplayEquation
  (or, where the document has no such style, the numbering's centre and right tab stops); counted in
  the report, inside the same single undo step.
- Tests: a generated MathType test document (A.n numbers, MTDisplayEquation paragraphs, one inline
  equation, two references): every paragraph's pPr byte-identical, the MTDisplayEquation count unchanged,
  MathType's numbers, bookmarks and references kept. The same checks can run locally on a real document
  (MB_MATHTYPE_DOCX=path). Self-test: after converting a MathType paragraph and after numbering a new equation, the
  number ends at the right margin and the equation is centred; Repair restores a paragraph that lost
  its tab stops.

### Embedded objects — step 4 (Repair converts Classic pictures to objects)
- Repair equations converts every Classic picture (VML or pasted DrawingML) to an embedded object
  with the same ID, in place: the object's run only, so the paragraph — alignment, tabs, number
  fields, bookmarks and references — stays as it was. Copied objects whose own data holds another ID
  are redrawn with their own. Native equations and MathType objects are untouched.
- One undo step: the add-in's repair, the registry follow-up and the redraw run inside one operation;
  a backup first when many; the report gives the counts and the time. A second Repair changes nothing.
- An equation replaced in place gets its new content in front of the old one before the old one goes,
  so Word never inserts at a paragraph's end (where it can add a paragraph mark).
- Reference insertion with fields: no longer fails ("Value out of range"); falls back to the XML
  insertion if Word refuses the fields.
- Self-test: a Repair section (old pictures with a number and a reference → objects; same IDs, number,
  bookmark, reference and text; one Ctrl+Z; a second Repair is a no-op).

### Embedded objects — step 3 (Convert LaTeX and Convert MathType write objects)
- Convert LaTeX writes objects (through the same insertion as the Insert button).
- Convert MathType (open document and files): each converted equation becomes an embedded MathBlocks
  object in place of the MathType object — Classic EMF as its picture, its LaTeX, ID, mode, depth,
  size and style in its own data; numbers, bookmarks and references around it stay.
- References are inserted with Word's field commands (GOTOBUTTON with a nested REF), not XML: an XML
  insertion at the end of the last paragraph started a new paragraph.
- Self-test: Paste Special EMF counts as information (a plain picture, as with MathType); the
  reference check reads the REF field only.

### Embedded objects — step 2 (the app writes objects; clicks)
- Every Classic insert, update, number/unnumber, Convert LaTeX, Apply notation, linked copy and
  Repair redraw now writes an embedded MathBlocks object (buildInsertion); the VML picture form stays
  only for older documents.
- Double-click on an object opens it for editing (intercepted before Word activates it); right-click
  opens the floating editor — Word honours Cancel for objects, so no Word menu appears.
- An object's own data is its primary source (opening, fingerprint, Repair); its picture's EMF and
  its alt text are fallbacks.
- A reference inserted at the end of a paragraph: the paragraph mark Word adds there is removed.
- Self-test measurement: an object's lowering is read from Word's XML for its run when the field's
  hidden characters make Word report mixed formatting; the picture count is noted before each paste;
  "nothing else changed" compares the text without equation characters.

### Embedded objects — step 1 (object as an equation kind, typing reset, self-test lookup)
- The add-in recognises a MathBlocks object by Word's class name (Word returns an empty ProgID for
  an unregistered class), else the object's XML; identifies it by the alt-text ID, else the ID in
  the object's own data. Objects of other classes (MathType) are answered from Word's ProgID without
  reading their XML.
- The app reads an object's own data first (full LaTeX and mode), then its picture's source, then
  its alt text.
- Typed text after an equation: the equation's lowering is taken from its stored depth before any
  change; the caret reset (the method the probe showed works) is the last change of insert and
  update; if Word applies it to the equation too, the equation is restored first and the caret reset
  again. Nothing is read from the document after it.
- Self-test: types right after the add-in's insert with nothing in between; spike objects inserted
  by the add-in's own insert; pasted copies found by scanning the whole document; the document's
  object count before and after each paste; each object's run checked for mixed formatting.

### Fixed (from the first self-test report)
- **Text typed after an inline equation was lowered** with it (and so were paragraph marks): at the end
  of a paragraph Word reports the caret's formatting as 0, so the reset was skipped. The add-in now
  resets the caret's formatting like Ctrl+Space (paragraph's normal formatting), still only at a word's
  end, still restoring the picture's lowering if Word touches it.
- **Merge Formatting dropped the pasted equation's lowering:** restored from the depth in its source
  right after the paste (one undo step).
- **A reference inserted at the end of a paragraph landed on a new line:** the extra paragraph mark
  Word adds there is removed; the reported number is the REF field's result.
- Self-test: a plain number format in its own document (a chapter format shows Word's "Error! No text
  of specified style" without numbered headings); Paste Special in line as the dialog does; no undo
  when a paste brought nothing; steps between documents act in the named document's window; Word's
  smart cut and paste is off during the test (it removes spaces around cut objects, which made "no
  other text changed" fail) and restored after; pictures' frame (simple VML or modern DrawingML)
  measured through Word, since WordOpenXML exports both as DrawingML.

### Added (embedded-object spike, self-test only)
- "Self-test + object spike" (ribbon) / command palette: MathBlocks equations as embedded OLE objects
  "MathBlocks.Equation.1" (as MathType stores Equation.DSMT4), in the self-test's own documents only.
  The object's compound file holds the full LaTeX, ID, mode, depth, size and style; the Classic EMF is
  its cached picture. Insertion routes tried: Range.InsertXML, Range.InsertFile (Word XML and .docx),
  copy/paste from a hidden document. Checks frame, baseline, data, every paste mode within and between
  documents, cut, move, delete, undo/redo, a number and reference beside it, save/close/reopen, PDF,
  and file size against pictures. Double-click on such an object is intercepted (opens read-only);
  right-click asks Word to suppress its menu (manual check whether it does).
- Self-test: each pasted copy's representation is compared with the original.

### Added (round 7)
- **Word self-test** (ribbon → Run Word self-test, or the command palette): new test documents; inline
  α, β, γ, f, p and a fraction with text typed after each; display and numbered equations; opening
  through the click paths; number, reference, insert above, update, unnumber; every paste mode within
  and between documents; cut/paste and a move; undo after each. Writes report.txt and the documents to
  %LOCALAPPDATA%\MathBlocks\self-test\<date>\, with a list of what only a person can check.

### Fixed (round 7)
- **Baseline:** resetting the formatting for typed text after an equation made Word reformat the
  whole "word" — the picture included — when the next character was not a space; the picture lost its
  lowering. Now only before a space or paragraph end, and the picture's lowering is restored if Word
  touched it anyway. The depth is stored in the hidden source; Repair restores lowerings.
- **One menu:** Word ignores Cancel on right-click for pictures. A Classic equation's right-click
  shows Word's own picture menu with "Edit equation (MathBlocks)" and "Number / unnumber equation";
  double-click opens the editor; native equations keep the floating editor on right-click.
- **Pasted equations open** even when Word's XML for the pasted picture lacks the EMF data: the alt
  text identifies the equation and gives its LaTeX.
- **Drag:** the add-in no longer changes the document or the selection from Word's selection-change
  event (which also fires in the middle of a drag); its checks run on an idle timer, never with a
  mouse button down. An in-line picture is never treated as floating.
- **Repair** redraws, once, pictures whose hidden source lacks the ID or the depth (converted MathType
  equations), so they no longer depend on the number bookmark.

### Fixed (round 6 — the hybrid build could not edit any Classic equation)
- **Root cause:** Word does not implement `InlineShape.Title` for VML pictures (the MathType-like frame
  Classic equations use). Reading or writing it throws `NotImplementedException`, which the add-in
  did not catch (it caught only `COMException`), so insert, right-click, double-click, Number, Repair,
  listing and the caret guard all stopped at the first title access (connector.log: 44 such errors).
- **The ID now lives in the alt text** ("MathBlocks inline (mb1|-|id): LaTeX") and in the EMF's hidden
  source; the title is used only where Word supports it. A picture is recognised from whichever
  survives, and the others are restored.
- **Caret and typed text:** after inserting, the caret is to the right of the equation and typed text
  sits on the line (the insertion point gets no lowering; only the picture's own run is lowered).
- **Baseline and padding:** pictures get MathType's padding (measured on MathType output: about 2 pt around the
  ink at 12 pt), and depth, height and width are whole points as in MathType, so the run's lowering
  equals the depth exactly for every letter.
- **Converted MathType equations** carry their ID in the alt text and in the hidden source.
- connector.log error lines now say where they failed.
- CI: a .docx built from the add-in's own insertion XML is read back with the add-in's detection code.

### Changed (round 5 — hybrid equation identity)
- **A Classic equation is now just a picture** (like a MathType equation): no content control. Its ID
  (`mb1|block|instance`) is the picture's title; the hidden source in the EMF also carries the ID,
  and the alt text keeps the LaTeX. Select, Delete, Cut, Copy, paste, drag behave exactly as for a
  picture; text can no longer end up "inside" an equation.
- **Native Word equations keep an unlocked wrapper** (OMML has no place for an ID) with the caret
  guard and the self-healing checks.
- **Copies, not originals, get a new ID.** When equations share an ID, the one whose paragraph holds
  the number bookmark (so the references) keeps it; otherwise the earliest; the decision is logged.
  Checked when a document opens, after a paste/drop (selection change, only near the selection, only
  when the picture or control count changed), and before every read and write.
- **Floating pictures go back in line automatically** as soon as they are detected (open, selection,
  paste, Repair), one undo step; right-clicking a floating equation opens it directly.
- **Edited title or alt text:** the ID comes back from the hidden source (else from the number
  bookmark in its paragraph) and the title is restored.
- **Repair equations converts older documents:** wrapped Classic equations become titled pictures
  (backup when many, one undo step); native equations and MathType objects are untouched and counted
  in the report.
- Every insertion path (Insert, Update, Number, Convert LaTeX, Convert MathType) ends with a titled
  picture; the thesis check reads titled pictures from closed files.
- Paste diagnosis in connector.log: what each pasted picture kept (title, alt, source with/without ID,
  VML/DrawingML, EMF/PNG).

### Fixed (round 5, interim — before the wrapper decision)
- **No lock blocks editing any more:** wrappers are never content-locked (the lock blocked Number,
  Delete, Cut and drag on a selected equation); wrappers locked by the previous build are unlocked
  when a document opens, when the add-in starts, on every read and write, and by Repair. After Delete
  or Cut of a selected equation the empty wrapper is removed (no placeholder text).
- **Right-click shows exactly one menu:** on a floating (pasted) MathBlocks picture Word's own menu
  shows and the picture is put back in line (status bar: right-click again to edit); on an equation
  the floating editor; elsewhere Word's menu.
- **Kinds pasted or dropped as LaTeX** (`{\pvec{r}_2}`, `\pvec{r}_2`) are shown as their kind at once,
  never as red unknown commands; the exact case is in the CI round trip.
- connector.log: Word's "Insert/paste pictures as" option at start; for every pasted picture that is
  adopted, whether it arrived floating, as VML or DrawingML, with EMF or PNG (to settle the paste cause).
- docs/DESIGN-CLASSIC-IDENTITY.md: wrapper vs. no wrapper for Classic equations (evaluation).

### Fixed (testing round 3, priority 1)
- **Convert LaTeX in a real document:** the "inside equations or fields" spans were LaTeX typed into
  grown equation wrappers. Each span's own range is now tested and logged ("text inside the wrapper
  of …", "inside a Word equation", "contains a field" or "plain text → convert"); LaTeX trapped in a
  wrapper is moved out (Repair) and then converted.
- **Commands started from Word finish in Word:** Convert LaTeX asks in a small dialog over Word (Enter
  confirms, "Don't ask again"; also a setting in the Word style tab) and reports in Word's status
  bar; with a selection only the selection is converted (as MathType's Alt+\); Number equation and
  the new ribbon button Repair equations report in Word; Insert reference is a picker over Word
  (type to filter, Enter inserts, "number only"). The app stays in the background.
- **Pasted equations that came in floating** (Word's "Insert/paste pictures as" setting applies to
  pastes) are recognised by their alt text and put back in line with the text by right-click,
  double-click, Ctrl+Alt+M and Repair equations, then wrapped.
- **Restyling reaches Word:** Apply in the floating editor sends the notation it drew with, and every
  notation change is broadcast between the main window and the floating editor (the storage event
  alone is not guaranteed between WebView2 windows), so Word gets the style shown in the editor.
- **Kinds inside groups** (`{\pvec{r}_2}`, double groups, fractions, brackets) are recognised in the
  visual editor (80 more cases in the CI round trip).
- **\text{}**: typing `\text{` (or `\text` then Space/Enter/Tab) or inserting text from the palette or
  the commands sheet opens a text zone at the caret; `\text{}` typed in full keeps the caret inside;
  Space types spaces; Enter, Tab, Esc or a closing } return to maths. Multi-line Enter, Space Space and
  kind exits act only in maths.

### Fixed (testing round 3, priority 0: the app acted on the wrong equation)
- **Root cause:** Word puts text typed or pasted at a content control's edge *inside* it, and a
  copied equation keeps its wrapper's ID. MathBlocks' wrappers were neither locked nor guarded, and
  insertion did not check whether the cursor was inside one: wrappers grew to hold several
  equations and text (connector.log: wrappers with both a VML and a DrawingML picture, 94k–166k
  characters; updates finding 2–3 controls with one ID). Reading took the wrapper's first picture
  (r₂), and Number replaced the whole wrapper with it.
- **Wrappers cannot grow:** Classic wrappers are content-locked after every insert, update, adoption
  and repair (Word refuses typing or pasting into them); the caret is moved out of a wrapper's edge
  whenever it lands there (not inside native equations, which stay editable with Word's tools); a
  new equation is never inserted inside a wrapper or over a selected equation.
- **Every read and write is verified:** a wrapper is opened only when it holds exactly one equation
  and no text (otherwise the app says what it holds and offers Repair equations); a copied wrapper
  sharing an ID gets its own ID when opened; every write (update, number, un-number, restyle)
  carries the fingerprint read with the equation and is refused on a mismatch, a duplicate ID or a
  wrapper that is not one clean equation. Nothing is overwritten with another equation's content.
- **Repair equations** splits wrappers holding several equations, other pictures, nested wrappers
  or text (one wrapper per equation, text outside; the first equation keeps the ID), gives
  duplicated IDs new ones, and locks every clean Classic wrapper.
- **The edit target ends when the edit ends** (after Update, after Apply or closing the floating
  editor, when the editor is cleared); the button reads "Insert into Word" or "Update in Word", and
  the editing bar shows the target (its ID and the equation it held when opened). A linked copy
  whose Word content differs from its library version opens with Word's content.
- **connector.log** records for every command the wrapper it resolved to: ID, pictures (MathBlocks
  + other), native equations, nested wrappers, text characters, wrappers sharing the ID, and the
  first characters of the LaTeX — and whether a write was verified or refused.
- Tests: identity rules (connector-word/tests); several equations opened, edited, updated and
  numbered in turn against a simulated document, a grown wrapper, text in a wrapper, a changed
  equation and a duplicated ID (app/src/lib/identity.test.ts).

### Changed (testing round 2, priority 3: editing experience)
- **The main editor is a visible field:** border, focus ring, placeholder "Type here, or press Space Space
  for commands", blinking caret; focused on launch and on New.
- **Space Space** (within 300 ms, adjustable in F1; can be turned off) opens the command palette — the
  floating editor's Commands flyout there. A single Space keeps its role (leaving a kind); nothing is left
  in the equation. Not while typing a \command or inside \text{}, and never in the LaTeX editor.
- **LaTeX commands sheet** (F1 → second tab, or Ctrl+K → LaTeX commands): searchable, grouped like the
  palette (Greek, operators, relations, arrows, accents, structures, environments, kinds and my own),
  each with its rendering and shortcut or snippet; click inserts at the cursor.
- **Floating editor redesign:** visual and LaTeX editors in a split view (each collapsible); every other
  group (commands, favourites, symbols, structures, collections incl. My notation, style, preview) in a
  narrow side rail, opening one flyout at a time; Ctrl+Enter / Esc hints and Cancel / Apply in the footer;
  width (drag the grip), collapsed panes and the open flyout are remembered.
- **Top-row bug (cause):** the floating editor's card was 94 % opaque with a backdrop blur; in a
  transparent window WebView2 cannot blur what is behind the window, so Word's ribbon showed through the
  top row. The card is opaque now. (The rows of symbol menus that ran off the right edge are gone: they
  are in the rail's flyouts.)

### Added / fixed (testing round 2, priority 2: kinds)
- **Kind name on hover:** a small label above the kind ("Physical vector"), drawn outside the
  editor so it is never clipped.
- **Live restyle:** the Word style tab's Spacecraft notation and Physical vectors choices now set how
  kinds are drawn (they used to change only the palette); the open equation, the Classic preview
  and library thumbnails restyle at once. The main window and the floating editor share the notation.
- **Ctrl+Shift+B on a kind:** a popup — "Physical vector: style comes from its kind → Edit kind
  style… / Convert to plain (hand-styled)".
- **Notation settings** (Ctrl+K → Notation settings, Word style tab → Kinds and their styles): every
  kind with weight, shape, letter style, bold Greek, accent (over/under), accent weight, brackets,
  bold scope, frame-label position and separator (symbol for DCM / frame), live preview of a, r,
  ω, F, H with and without frame labels at 12 pt and 10 pt; preset; Reset to preset; Duplicate.
- **My own kinds:** New kind (name, macro, snippet, start-from style) — parsed, drawn (Classic, Word,
  .tex export with \newcommand), recognised in the editor, in the palette under "My notation", in
  snippets (;trigger), and typed as \macro. Edit, rename, delete. Covered by the CI round trip and
  snippet check.
- **Apply to the Word document:** redraws every equation that uses a kind in the current style
  (backup, stored XML, progress, one undo step).
- **Make → kind** (right-click in the editor, Ctrl+K "Make → Physical vector"…): the selection or the
  symbol before the cursor becomes the kind; styles and accents dropped, a subscript kept as the frame
  label. **Convert to plain** (right-click, popup, Ctrl+K).
- Typing a kind's macro (\pvec, \dcm…) then Enter, Space or Tab inserts the kind with its slots
  (it used to stay as an unknown red command).

### Fixed (testing round 2, priority 1)
- **Convert LaTeX:** spans whose Word position does not match the paragraph text are found again
  by searching; each LaTeX span is replaced like a normal insertion (text removed, equation
  inserted at the empty point); every skipped span is counted and explained, and connector.log
  records what was found, relocated, skipped and replaced. Tests for each delimiter ($, $$, \( \),
  \[ \]), several in one paragraph, inline and alone (C# and app).
- **Kind snippets:** the whole trigger, prefix included, is replaced (matched by editor
  positions, so a prime prefix or a keyboard that reports ";" as "\;" still works); kind
  snippets saved by older versions can no longer shadow the prefixed ones; "inv" and "intab"
  trigger although the editor autocorrects "in"; ;tp / trans / inv attach to the symbol before
  them (xᵀ, not {}ᵀ); a DCM's two empty frames are filled one at a time (b, Tab, a). CI types
  every kind snippet under every prefix in the real editor.
- **Space / Tab inside a kind** leave it: the caret lands right after the kind (and its own
  scripts), the kind unchanged; Tab first visits empty slots. Checked at every caret position of
  every kind under every preset in CI.
- **Focus:** after a command (Ctrl+K), the floating editor's command line, a snippet or a dialog,
  the keyboard is back in the equation editor, caret where it was or in the first slot of what was
  inserted.
- **Dialogs** are never taller than the window: the title and buttons stay visible and the body
  scrolls (checked at 1366×768 and at 125 % / 150 % scaling).
- **Harpoon:** thicker (0.0435 em: 0.52 pt at 12 pt, 0.44 pt at 10 pt), sharp tip, tapered barb
  with a mitred end, a little longer (adaptive: ink width + 0.14 em, at least 0.48 em). The arrow
  uses the same shape. Review sheet and print page: tools/harpoon-sheet.ts.

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
- "Spacecraft dynamics" palette tab in vectrix notation; mechanics equations in the reference set.
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
