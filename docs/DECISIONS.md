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
