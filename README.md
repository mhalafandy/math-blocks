# MathBlocks

An advanced mathematical equation editor for Microsoft Word: a modern alternative to MathType that adds
**linked reusable equation blocks**, a personal equation library, visual + LaTeX editing, and native,
editable Word equations.

> Status: **Milestone 1 (Foundation & spikes) in progress.** Not yet usable for real documents.
> See [docs/ROADMAP.md](docs/ROADMAP.md).

## What it will do

- Build equations visually or in LaTeX; both views always show the same expression.
- Insert them into Word 2016+ as **native Word equations** (editable, searchable, print-perfect),
  with tuned styles, or optionally in our own precision rendering.
- **Linked blocks**: define an equation once, place it many times; edit once, update everywhere.
- A searchable personal library with categories, tags, favourites, collections and version history.
- Aligned derivations, equation numbering and references, symbol search by meaning, templates.
- Convert existing MathType equations.

## Architecture in one picture

```
Tauri desktop app (React UI + TypeScript core + thin Rust shell with SQLite)
        │  JSON-RPC over a Windows named pipe
Word Connector (VSTO add-in, C#): ribbon, events, native Word operations
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Decisions: [docs/DECISIONS.md](docs/DECISIONS.md)

## Repository layout

| Path | Contents |
|---|---|
| `packages/math-core` | The canonical equation AST every format converts to and from |
| `packages/math-latex` | LaTeX parser (with diagnostics) and serializer |
| `packages/math-omml` | AST → OMML (Word's native equation XML), Style Profiles |
| `packages/ooxml` | Word packaging: content controls, Flat OPC for `InsertXML`, `.docx` builder, IDs |
| `app/` | Tauri desktop application (React + TypeScript) |
| `connector-word/` | Word add-in (VSTO, C#) |
| `fixtures/` | Reference equations, spike documents |
| `tools/` | Developer scripts |
| `docs/` | Project documentation |

## Quick start

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full setup on Windows.

```bash
pnpm install
pnpm test          # all unit tests
pnpm spike:docx    # regenerate the Word test documents in fixtures/spike/
pnpm dev           # run the UI in a browser (no desktop shell)
pnpm app:dev       # run the desktop app (Windows, needs Rust)
```

## Documentation

[ARCHITECTURE](docs/ARCHITECTURE.md) · [ROADMAP](docs/ROADMAP.md) · [FEATURES](docs/FEATURES.md) ·
[CHANGELOG](docs/CHANGELOG.md) · [DEVELOPMENT](docs/DEVELOPMENT.md) · [DECISIONS](docs/DECISIONS.md) ·
[M1 test checklist](docs/M1-CHECKLIST.md)
