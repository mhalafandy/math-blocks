# Development guide

## 0. Just testing? You do not need to build anything

Every update to `main` is built automatically and published as the **Latest test build** release:

**https://github.com/mhalafandy/math-blocks/releases/tag/dev-build**

(On the repository's main page it is also under **Releases** in the right-hand column.)
Download from the **Assets** list:

| File | What it is |
|---|---|
| `MathBlocks_0.1.0_x64-setup.exe` | desktop app installer (for your user only, no admin needed) |
| `MathBlocks-Word-connector.zip` | Word add-in: `MathBlocks.WordConnector.dll` + `install.ps1` / `uninstall.ps1` |
| `MathBlocks-M1-test-documents.zip` | the five Word test documents for checklist part A |

Install the Word add-in: close Word, unzip `MathBlocks-Word-connector.zip`, then in that folder
click the address bar, type `powershell` and press Enter, and run:

```bash
powershell -ExecutionPolicy Bypass -File install.ps1
```

Windows may warn that the installer is from an unknown publisher (it is not code-signed yet):
choose **More info → Run anyway**.

## 1. Install the development tools (Windows 10/11), only needed to build yourself

| Tool | Why | How |
|---|---|---|
| Git for Windows | source control | https://git-scm.com |
| Node.js 22 LTS | TypeScript core and UI | https://nodejs.org, then run `corepack enable` once (activates pnpm) |
| Rust (rustup, MSVC toolchain) | Tauri desktop shell | https://rustup.rs, accept defaults |
| Visual Studio 2022 Community (or Build Tools) | C++ linker for Rust | Workload: **Desktop development with C++** |
| .NET 8 SDK | builds the Word connector | https://dotnet.microsoft.com/download (the Office workload is *not* needed, see D-011) |
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
| `dotnet build -c Release connector-word/src` | Word connector DLL |

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
