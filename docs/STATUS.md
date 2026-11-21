# Status

Updated at the end of every round. Public repository: generic content only. Earlier rounds: `docs/status-archive/`.

## Latest round — 0.1.172

**Build:** 0.1.172 (test channel), CI passed. Stable stays 0.1.168: the 0.1.170 self-test had 1 failure (Ctrl+Alt+K is Word's AutoFormat).

**Reports read:** self-test 22:26 (0.1.170: 467 passed, 1 failed; spike 99 passed), word keys.txt, thesis-size 23:15, soak 22:29 (failed after #350), connector.log.

**Fixed:**
- Edit shortcut: Ctrl+Alt+K → **Ctrl+Alt+[** (free on your PC; a saved Ctrl+Alt+K moves too). Ribbon tab key tip Q → **K**.
- "Apply notation kinds: Ctrl+Y redoes it" (0.1.169), cause: replacing one equation left the old picture next to the new one, same ID; each read then gave the copy a new random ID, so the states never matched. The replace now finds the old picture by place and ID and removes any leftover; a self-test check counts the equations.
- Soak #350: a bug in the soak test, not the product (Ctrl+Z in A put back B's list too in the model).
- Apply style on the thesis: the equation index no longer computes a page for each equation on documents over 300 equations (314 s per index, twice per Apply style). The list of symbols takes its pages from the definitions.

**Built:**
- Self-test: the tab key tip against the key tips Word shows after Alt on your PC (Search box, other add-ins); each shortcut pressed as a keyboard sends it, with your layout and with Arabic (101), restored after.
- Cleanup (your decisions): spike, bold Greek sheet, font comparison, "Insert test equation", qs1.png removed. **Settings → Advanced → Developer tools** (off): self-test, soak, thesis-size test, benchmark hidden (Ctrl+K, ribbon, Settings); the add-in refuses test requests. "Thesis check" → "Check all chapter files".
- Log: a write's time split into check / write / after; which Cancel stopped an operation; listInstances pages vs context.

**Needs your PC:**
- Turn on Settings → Advanced → Developer tools first (the self-test is hidden otherwise).
- Self-test of 0.1.172: "Word shortcuts" (tab key tip, and the Arabic layout lines). Clean → I promote it.
- Thesis-size test with connector.log. Did you press Cancel in Apply style in 0.1.170? It stopped after 840 of 1533 (the log now says who).
- Soak test.

**Open:**
- Apply style writes: 450–720 ms per equation, growing during the operation; the new log split shows where.
- Convert LaTeX: 220 ms per equation (InsertXML 130 of 217); left as is (no cheap win in the breakdown).

## Details

- `WordOps.Replace.cs`: `TaggedPictureAfter`, `RemoveLeftoverOld`. `WordOps.KeyTips.cs`: ribbon key tips (MSAA). `WordOps.Objects.cs`: object helpers (from Spike.cs).
- `shortcuts.rs`: `probe_word_shortcuts` (scan codes, WM_INPUTLANGCHANGEREQUEST). Prefs `developerTools`; add-in `setDeveloperTools`.
- listInstances: `pagesUpTo`, `pagesFor`, `context`.
