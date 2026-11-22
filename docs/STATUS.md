# Status

Updated at the end of every round. Public repository: generic content only. Earlier rounds: `docs/status-archive/`.

## Latest round — 0.1.173

**Build:** 0.1.173 (test channel), CI: pending. Stable stays 0.1.168: the 0.1.172 self-test had 3 failures (copy between documents).

**Reports read:** self-test 03:23 (0.1.172: 474 passed, 3 failed), thesis-size 03:30, soak 05:06 (passed, 1000 operations), connector.log (soak only: the thesis run had been rotated out).

**Fixed:**
- Copy between documents ("no text is selected"): 0.1.172's cleanup dropped the test helper's object lookup; restored, empty ranges never used.
- Shortcut probe with your layout: Word could not be brought to the front; now attaches to the foreground window first (3 tries).
- Apply style stopped at 840 / 940 of 1533 without a Cancel from you: the progress window's Cancel was its only control, so it had the keyboard focus (an Enter or Space reaching the window pressed it). Now only a mouse click cancels; an error in the middle is reported as "Stopped by an error (…)", not "Cancelled", and logged; the test cancel flag ends with each operation. The self-test's file-dialog Cancel sets no flag (app dialog, nothing kept).
- Apply style slowing down: after each write the equation was looked up again, which walked all 1533 pictures, and the picture index was built again for every batch of 10. Both gone (index kept for the operation).
- connector.log keeps the previous file (connector.previous.log) instead of deleting it at 2 MB.

**Built:**
- Check document: the same equation twice side by side (an earlier version's replace) found; repair removes the extra one (keeps the numbered one). Guard fixtures + CI test; self-test step.
- Keyboard layout: put back at the next app start if the self-test stopped while Arabic was active (flag file).
- Visual comparison: no file dialog. A generic LaTeX sheet (every category) is converted by MathType's Toggle TeX, then compared; skipped with a note without MathType.
- Large operators: Latin Modern Math, STIX Two Math, XITS Math bundled (licences in the repo and installer), installed for the user at install (no admin). Document style "Large operators" font; slanted TeX integrals, display size about the integrand. Developer tools: "Large operators: compare the fonts" (all five operators, inline and display, with "Use this").

**Needs your PC:**
- Install 0.1.173 (the installer adds the three fonts for you).
- Self-test (developer tools on): copy between documents, "fires with the current layout", duplicate repair, the MathType sheet. Clean → I promote it.
- Developer tools → Large operators → compare the fonts; pick one (or tell me).
- Thesis-size test; send connector.log and connector.previous.log.

**Open:** Convert LaTeX 243 ms per equation (InsertXML 140); left as agreed.

## Details

- `WordOps.Check.cs` `RemoveDuplicateEquations`; app `checkDocument.sideBySide`. Fixtures `gen-remove-duplicate(-text)`.
- Operation index: `InOperation`, `OperationIndex` (ReadScope). Cancel: `ProgressForm` mouse only; `endOperation.stoppedBy`.
- Fonts: `app/src/assets/math-fonts/`, `installer-hooks.nsh`, `MathStyleGlobal.largeOperators`, `FontSet.bigOps`.
