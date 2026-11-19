# CLAUDE.md

## Working style — usage

The owner's plan usage is limited. Every session follows these rules.

1. **Pace.** One round = the items the owner lists in one message. When they are done: update STATUS.md, publish, STOP. Do not start the next item or continue round after round unless the message says so. Blockers and design decisions: ask in one short message.
2. **STATUS.md.**
   - Rounds older than the current one go to `docs/status-archive/` (one file per month, `YYYY-MM.md`); never delete them.
   - At the top, a "Latest round" summary of at most 40 lines: build number, CI result, what was built (one line each), what needs the owner's PC (self-test sections, manual checks), open questions. Details below it, short; no long explanations of causes unless asked.
   - Screenshots only for UI changes, at most 2 per item, only of the changed part.
3. **Reading and searching.** Read only the files and line ranges needed (grep first, then read the range). Don't re-read large files already read in the session unless they changed. Don't print long command output: pipe build/test logs through `tail` or `grep` for failures.
4. **Tests.** While working, run only the tests related to the change (the touched package's unit tests, the one relevant check). Run the full suite once before committing. Run `tools/ui-check.ts` only when the UI changed, and only the related cases; CI runs everything.
5. **CI.** After pushing, don't poll. Check once, after the usual run time (about 15 min); if it failed, read only the failing job's error lines.
6. **Self-test reports.** Read the summary and the failures first; open details, logs or PDFs only for failures that need them.
7. **Write-ups and messages.** Short: what changed, what the owner needs to do, what's open. No recap of earlier rounds.
8. **Sessions.** A new session for each round (CLAUDE.md, STATUS.md "Latest round" and the code are enough to continue); `/compact` if a session gets long.

Standing rules from earlier rounds still apply: the repository is public, so generic examples only, and nothing from the owner's documents (equations, text, file names, statistics) is ever committed. Anything new the add-in writes into Word gets a guard fixture and CI test before it is published (`docs/DEVELOPMENT.md` §4).
