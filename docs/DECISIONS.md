# Architectural Decision Record

Each decision records its context, the choice, and its consequences. Decisions are never deleted;
superseded ones are marked as such.

---

## D-001 — Canonical presentation AST

**Status:** Accepted (M1)

**Context.** Equations must move between LaTeX, the visual editor, Word (OMML), MathType (MTEF),
SVG and our library without losing structure. Converting format-to-format directly gives N×N
converters and silent losses.

**Decision.** One internal tree (`packages/math-core`), describing presentation structure. Every
format converts *to* and *from* it. The AST is plain JSON, versioned (`MathExpression.version`).
Optional semantic metadata (`meta`) is reserved for the dependency manager (Tier 3).

**Consequences.** Every converter is testable in isolation (golden and round-trip tests). The
visual editor (MathLive) is an adapter, not the source of truth.

---

## D-002 — Word 2016+ ⇒ VSTO connector instead of Office.js (supersedes "Office Add-in first")

**Status:** Accepted (feasibility report v2, conflict C1)

**Context.** Requirement: Windows, Word 2016 and newer. Office.js add-ins on Word 2016/2019
(perpetual) run in Internet Explorer 11 / EdgeHTML with WordApi 1.1–1.3 only: no modern UI
(MathLive cannot run), no content-control events, no undo grouping, no document-open event.

**Decision.** Word integration is a thin **VSTO add-in (C#, .NET Framework 4.8)** using Word's COM
object model: content controls, Custom XML Parts, `OMaths`, `UndoRecord`, `InsertXML`, events
(`DocumentOpen`, `DocumentBeforeSave`, `WindowBeforeDoubleClick`, `ContentControlAfterAdd`,
`ContentControlBeforeDelete`), and a ribbon.

**Consequences.** Windows only (accepted). Adds a small C# codebase built with Visual Studio. An
Office.js connector remains possible later for Word 365/web/Mac or PowerPoint via the same protocol.

---

## D-003 — Tauri desktop app as the main application (conflict C2)

**Status:** Accepted

**Context.** The user wants a full desktop workspace. The editor needs a modern web engine
independent of the Office version.

**Decision.** **Tauri 2** (WebView2 on Windows) hosts the React UI and the TypeScript core. A thin
Rust shell owns SQLite, the file system, the tray/background process and a named-pipe server.
The VSTO connector has no UI of its own and talks to the app over a **Windows named pipe** with a
versioned JSON-RPC protocol.

**Consequences.** Electron rejected: its main advantage (Node COM access) is not needed because COM
lives in the connector; Tauri is ~10× smaller. Requires Windows 10/11 with WebView2.

---

## D-004 — Native OMML by default; Precision mode optional (conflict C3)

**Status:** Accepted; default to be confirmed by the M1 visual comparison

**Decision.** Equations are inserted as native Word equations written by our own OMML writer,
styled by **Style Profiles** (math font, matrix and equation-array spacing, vector notation).
A later *Precision mode* renders vector images (EMF) with our own layout engine, storing the AST
for re-editing. Conversion between modes is one click.

---

## D-005 — Identity foundation from day one (conflict C4)

**Status:** Accepted

**Decision.** From the first inserted equation, every equation is wrapped in a content control
with a MathBlocks tag, and its AST/LaTeX is stored in the document's registry (Custom XML Part).
Linked blocks (Tier 2) then require no migration of existing documents.

---

## D-006 — Basic aligned derivations in the MVP (conflict C5)

**Status:** Accepted

**Decision.** `aligned`/`cases`/`gathered` are part of the AST and OMML writer from M1, written as
OMML equation arrays with alignment marks. Numbering and references stay in Tier 2.

---

## D-007 — Tolerant LaTeX parser with diagnostics, own implementation

**Status:** Accepted (M1)

**Context.** LaTeX mode needs precise error highlighting, and nothing typed may be lost. MathLive's
internal model is not a public API.

**Decision.** Our own recursive-descent parser for LaTeX math (`packages/math-latex`). It never
throws; it returns the tree plus diagnostics with source offsets, and keeps unknown input as `raw`
nodes (rendered red in Word). TeX semantics are respected (e.g. `x^23` = x² 3). Large operators
capture their operand up to the next relation or top-level `+`/`−`, matching how Word structures
n-ary operators.

**Consequences.** Guaranteed structural round trip `parse(serialize(parse(x))) == parse(x)`
(tested on all reference equations).

---

## D-008 — Short base62 IDs and the `mb1|block|instance` tag format

**Status:** Accepted (M1); tag persistence to be verified in Word (M1 checklist)

**Context.** Word content-control tags have a limited length; two UUIDs plus a prefix would exceed it.

**Decision.** Block IDs: 16 base62 chars (~95 bits). Instance IDs: 12 base62 chars (~71 bits).
Tag = `mb1|<blockId or ->|<instanceId>` (≤ 33 chars). Foreign tags are ignored.
The block ID lives in the tag itself so an instance pasted into another document can still be
matched to the global library.

---

## D-009 — `ooxml` package separate from `math-omml`

**Status:** Accepted (M1)

**Decision.** `math-omml` converts mathematics only. Document packaging (content controls, Flat OPC
for `InsertXML`, `.docx` creation, custom XML) lives in `packages/ooxml`, reusable by the connector
protocol, exporters and the future MathType migration / closed-document processor.

---

## D-010 — Tooling

**Status:** Accepted (M1)

pnpm workspaces; TypeScript strict (`noUncheckedIndexedAccess`); packages are consumed as source
(`exports` → `src/index.ts`), so no build step is needed between packages; Vitest for tests;
`fast-xml-parser` (dev only) validates generated XML; `fflate` zips `.docx` files.

---

## D-011 — Word connector as a plain COM add-in instead of a VSTO project (refines D-002)

**Status:** Accepted (M1)

**Context.** D-002 chose a native Word add-in using Word's COM object model, planned as a VSTO
project. VSTO projects can only be created and built in Visual Studio with the Office workload,
need the VSTO runtime and ClickOnce certificates, and cannot be compiled in CI or on Linux.

**Decision.** The connector is an SDK-style .NET Framework 4.8 class library implementing
`IDTExtensibility2` and `IRibbonExtensibility` (a "shared" COM add-in). Word interop types are
embedded (NoPIA), so the only file shipped is `MathBlocks.WordConnector.dll`. Registration is
per user (no admin) by `connector-word/install/install.ps1`, in both registry views (32/64-bit Office).

**Consequences.**
- Same capabilities as VSTO: full object model, events, ribbon, `UndoRecord`, `InsertXML`.
- Builds with `dotnet build` anywhere; CI produces ready-to-install artifacts.
- No VSTO safety net (AppDomain isolation): every callback is wrapped in try/catch and logged to
  `%LOCALAPPDATA%\MathBlocks\connector.log`.
- The user does not need Visual Studio's Office workload.

---

## D-012 — The app hosts the named pipe; JSON lines; one connection at a time

**Status:** Accepted (M1)

**Decision.** The Tauri shell creates `\\.\pipe\mathblocks-v1-<user>` (`first_pipe_instance`, so
a second app instance cannot hijack it). The connector connects as a client and retries every 2 s,
so start order does not matter. Messages are JSON-RPC 2.0, one per line, in both directions. The
Rust side only forwards lines; all protocol logic is in TypeScript (`app/src/lib/connector.ts`) and
C# (`connector-word/src/Connect.cs`), typed by `packages/connector-protocol`.

**Consequences.** One Word process connected at a time (sufficient for now). Pipe access is limited
to the current user by the default pipe security.

---

## D-013 — Equation wrappers are invisible; Latin Modern Math is the default style

**Status:** Accepted (M1 feedback)

**Context.** In Word the identity content control drew its own box and label around Word's
equation frame ("a container inside a container"), which looked wrong to the user. In the style
comparison (checklist A6) the user preferred Latin Modern Math.

**Decision.**
1. The connector sets every inserted wrapper to `Appearance = Hidden` (Word 2013+). The control and
   its tag still exist, so identity, linking and double-click editing keep working; only the box
   and label are no longer drawn. It is set through the object model after insertion rather than
   in the inserted XML, so an unsupported element can never make Word reject an insertion.
   Linked instances will be identified in the app's instance panel (M6) instead of by a box.
2. The app's default Style Profile is "tuned" spacing with **Latin Modern Math**.

**Consequences.** Latin Modern Math must be installed on every PC that opens the document;
otherwise Word substitutes Cambria Math (layout stays correct, glyphs differ). Embedding or
warning about missing fonts is tracked for M5.

---

## D-014 — Self-updating app that also installs and updates the Word add-in

**Status:** Accepted (user request)

**Decision.**
- The app uses the Tauri updater. CI gives every `main` build the version `0.1.<run number>`,
  signs the NSIS installer with the project's updater key (GitHub secret
  `TAURI_SIGNING_PRIVATE_KEY`) and publishes `latest.json` in the "Latest test build" release.
  The app checks at start-up and every 2 hours, downloads in the background and offers
  "Update to x: restart". Only installers signed with the private key are accepted (public key
  in `tauri.conf.json`).
- The Word connector DLL is embedded in the app executable (`include_bytes!`), not shipped as a
  loose file, so the installer never overwrites a file that Word or Defender holds open. At start-up the Rust shell copies it to
  `%LOCALAPPDATA%\MathBlocksWordAddin` (deliberately outside the app's install folder, see
  FEATURES "known bugs") and registers it per user (same as `install.ps1`).
  If Word holds the old DLL, the app retries every 30 s and shows "close Word to finish".
  `install.ps1` stays as a manual fallback.
- The connector's AssemblyVersion stays fixed at 0.1.0.0 because the COM registration names it.

**Consequences.** One last manual install is needed to get the first self-updating version.
If the private key is lost, a new key pair means one more manual install. Builds without the
secret still work but publish no update files.

---

## D-015 — Precision rendering as a first-class output — DECIDED: native stays default

**Context.** A6: none of the native Word styles looks professional enough; Latin Modern Math is the
closest. The quality ceiling of native equations is Word's own math layout engine, which we cannot
change (kerning, script sizes, operator spacing). MathType looks better because it draws equations
itself.

**Proposal.** Typeset equations with MathJax 4 (TeX layout rules, New Computer Modern font) and
insert them as SVG pictures (PNG fallback), baseline-aligned for inline use, each wrapped in a
MathBlocks content control and carrying its AST/LaTeX so the app re-edits it (double-click),
exactly like MathType does. Native OMML stays available per document or per equation, with
one-click conversion both ways. Comparison document: `fixtures/spike/m1-P-precision-vs-native.docx`.

**Decision (user, after comparing `m1-P`).** Native and precision "look almost the same" except
matrix brackets, which in native Word are only as tall as the entries. → **Native Word equations
remain the default** (editability, searchability). Matrix brackets get a Style Profile option
`matrix.bracketPadding` (invisible zero-width strut), variants in `m2-matrix-brackets.docx` for the
user to choose. Precision mode stays on the roadmap (M10) as an option.

**Trade-offs.** Pictures cannot be edited with Word's own equation tools (only through MathBlocks),
are not searchable as text, and collaborators without MathBlocks see but cannot edit them. Linked
blocks, numbering and the library work the same in both modes.

---

## D-016 — Workspace layout: library left, symbols right, details bottom, all collapsible

**Status:** Accepted (user feedback on 0.1.13)

**Context.** The top palette took half the window, rows wrapped, previews were empty boxes and
the equation canvas was squeezed.

**Decision.** VS Code-style layout: library on the left (Ctrl+B), symbols on the right
(Ctrl+Alt+B), and a bottom panel with LaTeX / Structure / Word style / OMML tabs (Ctrl+J). Every
panel collapses and resizes; "Focus mode" hides all three. The equation canvas fills the rest,
centres the equation, scrolls horizontally for long equations and zooms (Ctrl +/−/0, 60–250 %).
The MathType-style top palette stays available as an option ("⇡ Top"). Template previews show a
sample letter in the main slot (bold **x**, x⃗, xᵀ) so similar templates are distinguishable.
Layout preferences moved to a new storage key, so everyone starts from the new defaults once.

---

## D-017 — Default matrix bracket padding: small ("scripts")

**Status:** Accepted (user's choice: variant 3 in `m2-matrix-brackets.docx`)

The tuned Style Profile pads matrix brackets with an invisible zero-width strut that adds about
0.3 em above and below the entries. Applies to every bracketed matrix kind (pmatrix, bmatrix,
Bmatrix, vmatrix, Vmatrix), including row and column vectors such as `[0 y z]ᵀ`.

---

## D-018 — Editing equations from Word: read back, replace in place, adopt native equations

**Status:** Accepted (M3/M5)

**Decision.**
- `math-omml` gets an OMML → AST reader with its own small XML parser (no dependency). Round trip
  AST → OMML → AST is exact for every reference equation, except what OMML cannot store (forced
  fraction size, \widehat vs \hat, negative space). Unknown Word structures become `raw` nodes
  (shown red) instead of being dropped.
- Double-clicking a MathBlocks equation in Word loads it into the app; the main button becomes
  **Update in Word**, which replaces the content control (same tag, so the equation keeps its
  identity) in one undo step.
- Double-clicking an equation typed directly in Word first wraps it in a hidden MathBlocks content
  control ("adopts" it, own undo step), so it can be updated the same way. This is also the basis of
  the MathType migration (M9).

**Consequences.** While the app is connected, double-click on an equation opens MathBlocks instead
of Word's own equation editing; a setting to turn this off will come with the settings screen.

---

## D-019 — Equation library: SQLite in the Rust shell, logic in TypeScript

**Status:** Accepted (M4)

**Decision.**
- The library is `library.sqlite3` in the app data folder (`%APPDATA%\app.mathblocks.desktop\`),
  WAL mode, foreign keys on. The schema is versioned with `PRAGMA user_version`; migrations are
  append-only (`MIGRATIONS` in `app/src-tauri/src/library.rs`). A consistent copy is written to
  `backups/` once a day (`VACUUM INTO`), the last 14 are kept.
- Rust only stores and retrieves (typed commands, one transaction per change); searching, ranking,
  presentation and the editor integration are TypeScript (`app/src/lib/library/`).
- A `LibraryStore` interface has two implementations with the same behaviour: SQLite (desktop)
  and an in-memory store (browser preview in localStorage, unit tests). Both have test suites for
  the same rules.
- Every save that changes the equation records a new version; restoring an old version adds a new
  version, so history is never rewritten.
- Equation IDs are 16-character base62 block IDs (D-008), so a library equation can become a linked
  block (M6) without changing its identity.
- Autosave: the editor content is saved as a draft 1.5 s after every change and restored at the next
  start (crash recovery).
- Export/import: one JSON file (`format: "mathblocks-library"`, `formatVersion: 1`) with folders,
  equations, tags and full history. Import merges by ID; the newer `updatedAt` wins.

**Deferred.** Project collections (an equation in several collections) come with M7 components.

---

## D-020 — Linked equations: library blocks, registry in the document, content-based conflict detection

**Status:** Accepted (M6)

**Decision.**
- A library equation is a **block**; its 16-character id goes into the tag of every linked copy
  (`mb1|<block>|<instance>`). Inserting from an open, saved library equation inserts a linked copy;
  with unsaved changes it inserts an unlinked copy and says so.
- Saving a new version (Ctrl+S, "Update everywhere" after double-clicking a copy, restoring a
  version) updates all linked copies in **all open documents**, one undo step per document. Each
  copy keeps its own inline/display mode.
- Every document stores the definitions it uses in a registry Custom XML Part
  (`urn:mathblocks:registry:v1`, `packages/ooxml/src/registry.ts`): the version last written.
- **Conflicts** are detected by mathematical content, not XML (Word rewrites XML): each copy is
  read back (OMML → AST → LaTeX) and compared with what MathBlocks last wrote. Copies that match
  neither the previous nor the new version were edited in Word; the user chooses Replace or
  Keep (which unlinks them).
- **Copy/paste**: duplicated tags are given new instance ids by the connector before any linked
  operation, so pasted copies stay linked.
- **Reopening**: when Word opens a document with linked equations (and on connect), the app
  compares its registry with the library and offers "Update now"; blocks unknown to the library
  (document from another PC) can be added to it, keeping their ids.
- **Unlink** turns one copy into an ordinary equation (`mb1|-|<instance>`).
- Visibility: ribbon toggle "Show linked equations" frames linked copies; the Library tab lists all
  copies with page, context and Go to.
- `.doc` safety: saving a `.doc` that contains MathBlocks equations asks first (Save As cannot be
  intercepted before the format is chosen, so that path is not covered).

**Limitations.** Documents that are closed are updated when they are next opened (with MathBlocks
running), not in the background. Linked equations only follow the library on the PC where the
library lives; on another PC the document's registry keeps them consistent with each other.
The logic is tested end-to-end against a simulated Word (`app/src/lib/linking.test.ts`).

## D-021 — MathType conversion: from the binary equation data, as a new document

**Status:** Accepted (M9)

**Context.** The user's thesis has hundreds of MathType equations (OLE objects `Equation.DSMT4`
with a WMF preview), numbered with MathType's fields (`MTDisplayEquation` paragraphs, `SEQ MTEqn`,
bookmarks `ZEqnNum…`, `REF`/`GOTOBUTTON` cross-references).

**Decision.**
- Read the equation itself: the OLE compound file (`packages/mathtype/src/cfb.ts`), its
  "Equation Native" stream and the MTEF v5 records (`mtef.ts`), translated to MathBlocks LaTeX
  (`toLatex.ts`) and from there to the AST and OMML with the current Style Profile. MathType's
  optional "TeX Input Language" annotation is **not** used: it is absent for many equations and
  loses details (bold vectors, harpoons).
- Convert a **copy** of the file (`… (MathBlocks).docx`); the original stays as a backup. Only the
  `<w:run>` holding the object is replaced, by a content control `mb1|-|<id>` (box hidden). Everything
  else is kept byte for byte, so MathType's numbering and cross-references keep working.
- A numbered display equation stays in its MathType paragraph (tab · equation · tab · number), so
  Word treats it as inline math (OMML has no display math next to text or fields). Integral limits
  keep their placement from MathType explicitly. An equation alone in its paragraph becomes display
  math (`m:oMathPara`). Moving numbers into MathBlocks numbering is M8.
- Unknown records never fail a conversion: contents are kept and reported. Objects that cannot be
  read stay as MathType objects.

**Consequences.** Works without MathType or Word installed, on any computer. Old Equation Editor 3.0
objects (`Equation.3`, MTEF v3) and `.doc` files are reported, not converted (save as .docx first).

## D-022 — Equation numbers are Word fields in a MathType-style paragraph

**Status:** Accepted (M8)

**Context.** Numbers must renumber automatically and be cross-referenceable with Word's own
mechanisms (REF fields, Ctrl+click), and the user's thesis already has MathType numbers that must
keep working next to new ones. OMML cannot hold fields; Word's `#(1)` equation-array numbers are
plain text (no references) and not available in all supported Word versions.

**Decision.**
- A numbered equation is its own paragraph: centre tab · equation (inline math) · right tab ·
  `(` `SEQ MBEq` `)` (optionally `STYLEREF 1 \s` `.` `SEQ MBEq \s 1` for chapter numbers).
  The number is covered by a hidden bookmark `_MBEq_<instance id>`; references are `REF … \h`.
- The paragraph is laid out by the connector through Word's object model (tab stops from the
  page's text width, fields, bookmark), not by XML, so it works in any document and style.
- References can point at MathType numbers (`ZEqnNum…` bookmarks) as well; Update numbers updates
  `SEQ MBEq`, `SEQ MTEqn` and references to both.
- Whether an equation is numbered is a property of the copy in Word, not of the library equation.

**Consequences.** Same layout and limits as MathType (inline math in a numbered paragraph).
Numbers depend on Word fields: after moving equations, press Update numbers (Word also updates
fields when printing).

## D-023 — Converting MathType inside Word: paragraphs go to the app and back

**Status:** Accepted (M9)

The connector sends each paragraph holding MathType objects as Flat OPC (`Range.WordOpenXML`,
which carries the OLE embeddings as base64 parts); the app converts it with the same code as the
file conversion (`convertFlatOpc`) and the connector puts it back with `InsertXML`, last paragraph
first, in one undo record. A paragraph whose objects changed meanwhile is skipped. Tabs, fields
and bookmarks travel inside the paragraph XML, so numbers and references survive.

## D-024 — Own typesetting engine; picture mode beside native equations

**Status:** Accepted (supersedes the "MathJax precision mode" idea in D-015)

**Context.** Native Word equations cannot match MathType's look: Word draws them with its own
renderer and only OpenType math fonts (never Times New Roman), and numbered equations fall into
inline size. The user wants MathType's quality or better.

**Decision.**
- `packages/math-render`: MathBlocks' own engine. AST → boxes (TeX-like atom spacing, fractions,
  scripts, radicals, big operators, stretchy delimiters from size variants and assemblies,
  matrices, cases, aligned, accents) → SVG of glyph outlines (needs no fonts to display).
- Styles are rule sets (`RenderStyle`). **Classic** = MathType's defaults (Times New Roman
  letters, scripts 58 %, big operators 150 %, its spacing), improved where MathType is weak.
  Letters come from Times New Roman (Windows), everything a text font lacks from STIX Two Math
  (OFL, designed to match Times).
- Two equation kinds in Word, switchable per equation: **native** (editable in Word) and
  **MathBlocks picture** (SVG + PNG fallback for Word 2016, inside the MathBlocks content
  control, source stored with it; edited in MathBlocks, e.g. the floating panel).
- Editing happens in a floating MathBlocks panel next to the equation (right-click/double-click).

**Consequences.** Exact, consistent look on every PC; pictures are not editable with Word's own
equation tools (same as MathType). The engine is checked against MathType's own previews.
