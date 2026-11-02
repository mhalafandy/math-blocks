# Development guide

## 1. Install (Windows 10/11)

| Tool | Why | How |
|---|---|---|
| Git for Windows | source control | https://git-scm.com |
| Node.js 22 LTS | TypeScript core and UI | https://nodejs.org, then run `corepack enable` once (activates pnpm) |
| Rust (rustup, MSVC toolchain) | Tauri desktop shell | https://rustup.rs, accept defaults |
| Visual Studio 2022 Community | C++ build tools for Rust; builds the Word add-in | Workloads: **Desktop development with C++** and **Office/SharePoint development** |
| WebView2 Runtime | app display engine | built into Windows 11; Windows 10: download "Evergreen Bootstrapper" from Microsoft |
| Word 2016 or newer | testing | — |
| Optional: VS Code | editing | https://code.visualstudio.com |
| Optional fonts: Latin Modern Math, STIX Two Math | style comparison | GUST e-foundry / stixfonts.org |

## 2. Get the code

```bash
git clone https://github.com/mhalafandy/math-blocks.git
```

```bash
cd math-blocks
```

```bash
pnpm install
```

## 3. Everyday commands

| Command | What it does |
|---|---|
| `pnpm test` | run all unit tests |
| `pnpm test:watch` | re-run tests on every save |
| `pnpm typecheck` | TypeScript type check of every package |
| `pnpm spike:docx` | regenerate `fixtures/spike/*.docx` |
| `pnpm dev` | UI in the browser at http://localhost:1420 (fast iteration, no desktop shell) |
| `pnpm app:dev` | desktop app with hot reload (Windows, needs Rust) |
| `pnpm app:build` | installer in `app/src-tauri/target/release/bundle/` |

## 4. Conventions

- **Packages are pure TypeScript**, consumed as source (no build step between packages).
- Strict TypeScript; no `any` in package code.
- Every converter change comes with tests; golden expectations are updated deliberately, never blindly.
- Commits: small and meaningful, imperative mood (`Add OMML writer for matrices`).
- Architecture-level changes get an entry in `docs/DECISIONS.md` first.
- Every user-visible change is recorded in `docs/CHANGELOG.md` and `docs/FEATURES.md`.

## 5. Adding a LaTeX command

1. Add it to the right table in `packages/math-latex/src/commands.ts`, or a `case` in `parser.ts`.
2. Make sure `serializer.ts` writes it back.
3. Make sure `packages/math-omml/src/writer.ts` handles the AST it produces.
4. Add parser, round-trip and OMML tests.

## 6. Verifying OMML without Word

LibreOffice (with its Math module) can render the spike documents:

```bash
soffice --headless --convert-to pdf fixtures/spike/m1-B-tuned-cambria.docx
```

Word remains the reference: LibreOffice mishandles a few valid constructs (see ARCHITECTURE.md).
