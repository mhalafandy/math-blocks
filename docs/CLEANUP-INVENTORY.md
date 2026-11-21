# Cleanup inventory (0.1.170)

Everything in the app and the add-in that a new user does not need.

**Done in 0.1.172** (the owner's decisions): every **remove** below is removed; every **dev** item is behind
Settings → Advanced → Developer tools (off by default: hidden in Ctrl+K, on the ribbon and in Settings, and the
add-in refuses `smoke` requests); **keep** items stay. "Thesis check" is now "Check all chapter files"
(`word.checkChapters`). The self-test helpers of `WordOps.Spike.cs` are in `WordOps.Smoke.cs`, the object
helpers the product uses in `WordOps.Objects.cs`.
Proposal per item: **remove**, **dev** (hide behind a developer switch: Settings → Updates → "Developer tools",
off by default, which also unlocks the add-in's test requests), or **keep**.

## App (`app/src`)

| What | Where | Proposal |
|---|---|---|
| Word self-test | `lib/selfTest.ts` (2160 lines); Settings → Word connection "Run the Word self-test"; Ctrl+K "Word self-test"; ribbon "Run Word self-test" | **dev** (keep for support: the owner and anyone diagnosing a problem need it) |
| Self-test + object spike | `selfTest.ts` (`spike: true` part), Ctrl+K `word.selfTestSpike`, `connector.ts` runCommand `selfTestSpike` | **remove** (objects are the shipped design since 0.1.15x; the spike's questions are answered) |
| Soak test | `lib/soakTest.ts`, Ctrl+K `word.soakTest` | **dev** |
| Thesis-size test | `lib/thesisTest.ts`, `lib/interchangeFixture.ts` (its generated document), Ctrl+K `word.thesisTest` | **dev** |
| Benchmark | `lib/benchmark.ts`, Settings page "Benchmark" | **dev** |
| Bold Greek comparison sheet | Ctrl+K `app.boldGreekSheet` | **remove** (a one-off design check) |
| Compare symbol fonts | Ctrl+K `app.fontCompare` | **remove** (a one-off design check) |
| MathType comparison | `lib/mtCompare.ts` (used by the self-test's MathType round trip) | **dev** (goes with the self-test) |
| Guard-fixture recording | `selfTest.ts` turns it on (`smoke guardFixtures`) | **dev** (only with the self-test) |
| Report a problem | `components/ProblemReportDialog.tsx`, Ctrl+K `app.reportProblem` | **keep** (user support) |
| Thesis check (all chapter files) | Ctrl+K `word.thesis` | **keep** (a user feature) |
| Screenshot to LaTeX | Settings page "Screenshot to LaTeX" | **keep** (a user feature; needs the user's own key) |

## Add-in (`connector-word/src`)

| What | Where | Proposal |
|---|---|---|
| `smoke` request (57 test operations: new document, type text, cut/paste, undo, snapshot, open/close, print check…) | `WordOps.Smoke.cs` (906 lines), `Connect.cs` method list | **dev**: refuse unless the app says developer tools are on; keep the code (the self-test needs it) |
| Test operations in the spike file (`undoProbe`, `staleNumbers`, `interruptedLock`, `keyAssignments`, `bookmarkText`, `insertOldRef`…) | `WordOps.Spike.cs` (731 lines, 33 operations) | **dev**: move the self-test helpers to `WordOps.Smoke.cs`; **remove** the object-spike parts (`ObjectActivation`, `FindObjects`, spike reports) |
| Ribbon "Insert test equation" | `Ribbon.xml` `mbSample`, `Connect.OnInsertSample` | **remove** (a connector check from before the app could insert) |
| Ribbon "Run Word self-test" | `Ribbon.xml` `mbSelfTest` | **dev** (hide the button: `getVisible` from the developer switch) |
| Ribbon "Self-test + object spike" | `Ribbon.xml` `mbSelfTestSpike` | **remove** |
| Ribbon "Connection status" | `Ribbon.xml` `mbStatus` | **keep** (users ask "is it connected?") |
| Window-activation recorder | `WordOps.Activations.cs` | **keep** (cheap; its log lines help diagnose) |
| Text-guard fixture saving | `WordOps.Operation.cs` `GuardFixtureFolder`, `SaveGuardFixture` (only while the self-test runs) | **dev** |
| Pagination flag file | `WordOps.Operation.cs` `PaginationFlag` | **keep** (restores Word's option after a stop) |
| Timing log lines (document XML, listInstances, replaceMany, convert) | `WordOps.ReadScope.cs`, `WordOps.Links.cs`, `WordOps.Interchange.cs` | **keep** (one line per operation; they made the thesis-size work possible) |

## Protocol (`packages/connector-protocol`)

| What | Proposal |
|---|---|
| `smoke` | **dev** (with the add-in's switch) |
| runCommand `selfTest`, `selfTestSpike` | `selfTest` **dev**, `selfTestSpike` **remove** |
| `verifyMany`, `beginOperation`/`operationProgress`/`endOperation`, `unlockFields`, `equationsToText` | **keep** (used by user commands) |

## Repository only (not shipped)

`tools/`, `fixtures/`, `connector-word/tests/` (and its guard fixtures), `docs/status-archive/`: **keep**.
`qs1.png` at the repository root: referenced nowhere, **remove**.
