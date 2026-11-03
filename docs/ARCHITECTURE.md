# Architecture

## Overview

```
┌──────────────────────── Tauri desktop app ────────────────────────┐
│  UI layer (React)  — command palette, panels, themes, layouts      │
│  ───────────── TypeScript core (pure: no Word, no DOM) ─────────── │
│  math-core · math-latex · math-omml · ooxml · mathtype · export    │
│  symbols · components · sync engine · library · documents          │
│  ───────────── Rust shell (thin) ───────────────────────────────── │
│  SQLite + migrations · file system · tray/background · pipe server │
└──────────────────────────────┬─────────────────────────────────────┘
               JSON-RPC over a Windows named pipe (versioned)
┌──────────────────────────────┴─────────────────────────────────────┐
│ Word Connector (COM add-in, C#): ribbon · events · document ops    │
└────────────────────────────────────────────────────────────────────┘
```

Why this shape: [DECISIONS.md](DECISIONS.md) D-002, D-003.

## Principles

1. **One canonical model.** Every format converts to/from the AST in `math-core` (D-001).
2. **Pure core.** Mathematics, linking and library logic never call Word, the DOM or the file
   system directly. They talk to *ports* (interfaces) with adapters at the edges, so they are
   testable without Word.
3. **The document is the source of truth for its instances; the library for global components.**
4. **Never lose input.** Parsers are tolerant and keep what they cannot understand.
5. **Every milestone leaves the app working.**

## Modules

| # | Module | Package | Status |
|---|---|---|---|
| 1 | Mathematical editor engine | `editor` (MathLive adapter) | M2 |
| 2 | LaTeX processing | `math-latex` | **M1 ✔ (subset)** |
| 3 | Rendering | `math-render` (MathLive preview, MathJax SVG/EMF) | M2 / M10 |
| 4 | Equation library | `library` + Rust DB layer | M4 |
| 5 | Reusable component manager | `components` | M7 |
| 6 | Linked block synchronisation | `sync` | M6 |
| 7 | Word integration | `connector-word` (C# COM add-in, D-011) + `connector-protocol` | **M1 skeleton ✔** |
| 8 | Document management | `documents` (registry, journal) + `ooxml` | **M1 ✔ (packaging)** |
| 9 | Symbol search | `symbols` | M7 |
| 10 | UI/UX | `app`, `ui` | **M1 shell ✔** |
| 11 | Local database | `app/src-tauri` (SQLite, migrations) | M4 |
| 12 | Export & conversion | `math-omml` (✔), `export` | M1 / M10 |

## Data flow: inserting an equation (target design)

1. User edits in MathLive or LaTeX mode → AST (`math-core`).
2. `math-omml` writes OMML using the active Style Profile.
3. `ooxml` wraps it in a content control (tag `mb1|block|instance`) inside a Flat OPC package.
4. The app sends `insertEquation { flatOpc, tag, display }` over the pipe.
5. The connector calls `Selection.Range.InsertXML(flatOpc)` inside an `UndoRecord`, then writes
   the instance into the document registry (Custom XML Part).

## Equation identity in documents (D-005, D-008)

- **Content control** around every MathBlocks equation:
  `tag = mb1|<blockId or ->|<instanceId>`, `alias` = human name, optional lock.
- **Registry** (Custom XML Part, namespace `urn:mathblocks:registry:v1`): document ID, block
  definitions, and each equation's source (LaTeX + AST) and version.
- Reconciliation (M6) compares the controls actually present with the registry to detect copies
  (duplicate instance IDs), deletions, orphans (pasted from other documents) and external edits
  (hash mismatch).

## AST summary (`packages/math-core/src/ast.ts`)

`row`, `ident`, `number`, `operator`, `text`, `space`, `fraction`, `scripts`, `prescripts`,
`radical`, `nary`, `delimited`, `function`, `accent`, `stack`, `boxed`, `matrix`, `cases`,
`aligned`, `raw`. Characters are stored as Unicode. All slots are `Row`s.

## OMML mapping (`packages/math-omml/src/writer.ts`)

| AST | OMML |
|---|---|
| fraction | `m:f` (`m:type=noBar` for binomials) |
| scripts / prescripts | `m:sSub`, `m:sSup`, `m:sSubSup` / `m:sPre` |
| radical | `m:rad` (`m:degHide` for square roots) |
| nary | `m:nary` (`m:chr`, `m:limLoc` undOvr/subSup, hidden empty limits) |
| delimited | `m:d` (`m:begChr`, `m:sepChr`, `m:endChr`) |
| function | `m:func` (`m:fName` upright; `m:limLow` for lim/max/min) |
| accent | `m:acc` (combining chars) / `m:bar` (overline, underline) |
| stack | `m:groupChr` (braces) + `m:limUpp` / `m:limLow` |
| boxed | `m:borderBox` |
| matrix | `m:d` + `m:m` (profile spacing, `m:mcs` column count) |
| cases | `m:d` `{` + `m:eqArr` with alignment marks |
| aligned | `m:eqArr`, `m:aln` on the first run of each `&` cell |
| text | `m:r` with `m:nor` |
| raw | red `m:nor` run (visible, never lost) |

## Known technical limitations (tracked)

- OMML matrices have no column rules / `\hline`.
- OMML has no explicit spacing primitive: spaces become Unicode space characters.
- Multi-column alignment (`a &= b & c &= d`) in Word equation arrays: behaviour to verify (M1).
- The legacy `.doc` format discards content controls and custom XML; the connector will warn.
- LibreOffice renders our OMML (useful for CI checks) but mishandles bare `|` and row-initial
  alignment marks; Word is the reference renderer.
