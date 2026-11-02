import { useCallback, useEffect, useMemo } from "react";
import { BottomPanel } from "./components/BottomPanel";
import { CommandPalette } from "./components/CommandPalette";
import { focusVisualEditor, MathEditor } from "./components/MathEditor";
import { Sidebar } from "./components/Sidebar";
import { HSplitter, Splitter } from "./components/Splitter";
import { PaletteTop, SymbolPanel } from "./components/SymbolPalette";
import { buildCommands } from "./lib/commands";
import { connector } from "./lib/connector";
import { buildInsertion, useCompiledEquation, useProfile } from "./lib/equation";
import { useApp } from "./lib/store";
import { installAndRestart, startUpdates } from "./lib/updates";
import { zoomStep } from "./lib/zoom";

export function App() {
  const s = useApp();
  const eq = useCompiledEquation();
  const profile = useProfile();

  // Theme: explicit choice or follow the operating system.
  useEffect(() => {
    if (s.theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", s.theme);
  }, [s.theme]);

  useEffect(() => {
    void connector.start();
    void startUpdates();
  }, []);

  const insertIntoWord = useCallback(async () => {
    const { connector: c, latex, display, notify } = useApp.getState();
    if (!c.available) return notify("Sending to Word works in the desktop app.", "error");
    if (!c.connected) return notify("Word is not connected. Start Word with the MathBlocks add-in installed.", "error");
    if (eq.errors > 0) return notify("Fix the LaTeX errors first.", "error");
    try {
      const { tag, flatOpc } = buildInsertion(latex, display, profile);
      const r = await connector.request("insertEquation", { tag, flatOpc, display, undoLabel: "Insert equation" });
      notify(r.found === 1 ? "Inserted into Word" : `Inserted, but found ${r.found} copies of its tag`);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  }, [eq.errors, profile]);

  const copyLatex = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(useApp.getState().latex);
      useApp.getState().notify("LaTeX copied");
    } catch {
      useApp.getState().notify("Could not access the clipboard", "error");
    }
  }, []);

  const focusLatex = useCallback(() => {
    useApp.getState().setPrefs({ bottomOpen: true, bottomTab: "latex" });
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(".latex-editor textarea")?.focus());
  }, []);

  const commands = useMemo(() => buildCommands({ insertIntoWord, copyLatex, focusLatex }), [insertIntoWord, copyLatex, focusLatex]);

  // VS Code-style shortcuts. Capture phase, so they work even while the equation editor has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useApp.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      let handled = true;
      if (k === "k" || (e.shiftKey && k === "p")) st.setPaletteOpen(!st.paletteOpen);
      else if (k === "enter") void insertIntoWord();
      else if (k === "l") focusLatex();
      else if (k === "b" && e.altKey) st.setPrefs({ rightOpen: !st.rightOpen });
      else if (k === "b") st.setPrefs({ leftOpen: !st.leftOpen });
      else if (k === "j") st.setPrefs({ bottomOpen: !st.bottomOpen });
      else if (k === "=" || k === "+") zoomStep(1);
      else if (k === "-") zoomStep(-1);
      else if (k === "0") st.setPrefs({ zoom: 1 });
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [insertIntoWord, focusLatex]);

  const status = eq.errors > 0 ? `${eq.errors} error${eq.errors > 1 ? "s" : ""}` : eq.diagnostics.length > 0 ? `${eq.diagnostics.length} warning(s)` : "Valid";
  const showRight = s.rightOpen && s.paletteLocation === "right";
  const columns = [s.leftOpen ? `${s.leftWidth}px 4px` : "", "minmax(360px, 1fr)", showRight ? `4px ${s.rightWidth}px` : ""].join(" ");

  return (
    <div className="app">
      <header className="topbar">
        <button
          className={s.leftOpen ? "icon-btn on" : "icon-btn"}
          title={`${s.leftOpen ? "Hide" : "Show"} library (Ctrl+B)`}
          aria-pressed={s.leftOpen}
          onClick={() => s.setPrefs({ leftOpen: !s.leftOpen })}
        >
          <PanelIcon side="left" />
        </button>
        <div className="brand">
          <span className="logo" aria-hidden>∑</span> MathBlocks
        </div>
        <div className="segmented" role="group" aria-label="Equation type">
          <button className={s.display ? "active" : undefined} onClick={() => s.setDisplay(true)} title="Equation on its own line">Display</button>
          <button className={!s.display ? "active" : undefined} onClick={() => s.setDisplay(false)} title="Equation inside a line of text">Inline</button>
        </div>
        <div className="spacer" />
        <button className="search-trigger" onClick={() => s.setPaletteOpen(true)} title="Search commands and symbols">
          <span>Search commands and symbols…</span> <kbd>Ctrl K</kbd>
        </button>
        <div className="spacer" />
        {s.update.status === "ready" && (
          <button className="update-pill" onClick={() => void installAndRestart()} title="Install the downloaded update and restart MathBlocks">
            Update to {s.update.newVersion}: restart
          </button>
        )}
        {s.update.status === "installing" && <span className="update-pill busy">Installing update…</span>}
        <button
          className="icon-btn"
          title={`Theme: ${s.theme} (click to change)`}
          onClick={() => s.setPrefs({ theme: s.theme === "system" ? "dark" : s.theme === "dark" ? "light" : "system" })}
        >
          {s.theme === "dark" ? "☾" : s.theme === "light" ? "☀" : "◐"}
        </button>
        <button
          className={showRight ? "icon-btn on" : "icon-btn"}
          title={`${showRight ? "Hide" : "Show"} symbols (Ctrl+Alt+B)`}
          aria-pressed={showRight}
          onClick={() => s.setPrefs({ rightOpen: !showRight, paletteLocation: "right" })}
        >
          <PanelIcon side="right" />
        </button>
        <button className="primary" onClick={() => void insertIntoWord()} disabled={!s.connector.connected} title={s.connector.connected ? "Insert at Word's cursor (Ctrl+Enter)" : "Start Word to enable"}>
          Send to Word
        </button>
      </header>

      <div className="main" style={{ gridTemplateColumns: columns }}>
        {s.leftOpen && (
          <>
            <Sidebar />
            <Splitter width={s.leftWidth} direction={1} min={180} max={420} onChange={(w) => s.setPrefs({ leftWidth: w })} />
          </>
        )}

        <main className="workspace" style={{ gridTemplateRows: s.bottomOpen ? `auto minmax(140px, 1fr) 4px ${s.bottomHeight}px` : "auto minmax(140px, 1fr) 0 auto" }}>
          <div>{s.paletteLocation === "top" && <PaletteTop />}</div>
          <section className="canvas" aria-label="Equation editor">
            <div
              className="canvas-scroll"
              onMouseDown={(e) => {
                // Clicking empty canvas space edits the equation (MathLive handles clicks on the equation itself).
                if (!(e.target as HTMLElement).closest("math-field")) {
                  e.preventDefault();
                  focusVisualEditor();
                }
              }}
            >
              <div className="canvas-inner" style={{ fontSize: `${34 * s.zoom}px` }}>
                <MathEditor />
              </div>
            </div>
            <div className="canvas-tools">
              <button className="icon-btn" title="Zoom out (Ctrl −)" onClick={() => zoomStep(-1)}>−</button>
              <button className="zoom-label" title="Reset zoom (Ctrl 0)" onClick={() => s.setPrefs({ zoom: 1 })}>{Math.round(s.zoom * 100)}%</button>
              <button className="icon-btn" title="Zoom in (Ctrl +)" onClick={() => zoomStep(1)}>+</button>
            </div>
          </section>
          {s.bottomOpen ? (
            <HSplitter height={s.bottomHeight} min={110} max={560} onChange={(h) => s.setPrefs({ bottomHeight: h })} />
          ) : (
            <div />
          )}
          <BottomPanel eq={eq} />
        </main>

        {showRight && (
          <>
            <Splitter width={s.rightWidth} direction={-1} min={260} max={620} onChange={(w) => s.setPrefs({ rightWidth: w })} />
            <SymbolPanel />
          </>
        )}
      </div>

      <footer className="statusbar">
        <span className={eq.errors > 0 ? "bad" : "good"}>● {status}</span>
        <span>{s.display ? "Display" : "Inline"}</span>
        <span>{profile.mathFont}</span>
        <div className="spacer" />
        {s.update.status === "downloading" && <span className="muted">Downloading update {s.update.newVersion}…</span>}
        {s.update.addin === "pendingWordClosed" && <span className="warn">Word add-in update waiting: close Word to finish</span>}
        {s.update.currentVersion && <span className="muted">v{s.update.currentVersion}</span>}
        <span className={s.connector.connected ? "good" : "muted"}>
          {s.connector.available ? (s.connector.connected ? `● Word connected${s.connector.hostVersion ? ` (${s.connector.hostVersion})` : ""}` : "○ Word not connected") : "○ Browser preview (no Word)"}
        </span>
      </footer>

      <CommandPalette commands={commands} />
      {s.toast && <div className={`toast ${s.toast.kind}`} role="status">{s.toast.text}</div>}
    </div>
  );
}

/** Small "panel" glyph (VS Code style) showing which side panel a button toggles. */
function PanelIcon({ side }: { side: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="none" stroke="currentColor" />
      <rect x={side === "left" ? 1.5 : 10} y="2.5" width="4.5" height="11" rx="1.5" fill="currentColor" opacity="0.55" />
    </svg>
  );
}
