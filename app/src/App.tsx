import { useCallback, useEffect, useMemo } from "react";
import { CommandPalette } from "./components/CommandPalette";
import { Inspector } from "./components/Inspector";
import { LatexEditor } from "./components/LatexEditor";
import { insertIntoVisual, MathEditor } from "./components/MathEditor";
import { Sidebar } from "./components/Sidebar";
import { Splitter } from "./components/Splitter";
import { buildCommands, STRUCTURES } from "./lib/commands";
import { connector } from "./lib/connector";
import { buildInsertion, useCompiledEquation, useProfile } from "./lib/equation";
import { useApp } from "./lib/store";

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
  }, []);

  const insertIntoWord = useCallback(async () => {
    const { connector: c, latex, display, notify } = useApp.getState();
    if (!c.available) return notify("Sending to Word works in the desktop app.", "error");
    if (!c.connected) return notify("Word is not connected. Start Word with the MathBlocks connector installed.", "error");
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
    if (useApp.getState().mode === "visual") useApp.getState().setPrefs({ mode: "split" });
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(".latex-editor textarea")?.focus());
  }, []);

  const commands = useMemo(() => buildCommands({ insertIntoWord, copyLatex, focusLatex }), [insertIntoWord, copyLatex, focusLatex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "k" || e.key === "K" || (e.shiftKey && (e.key === "p" || e.key === "P")))) {
        e.preventDefault();
        useApp.getState().setPaletteOpen(!useApp.getState().paletteOpen);
      } else if (mod && e.key === "Enter") {
        e.preventDefault();
        void insertIntoWord();
      } else if (mod && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        focusLatex();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [insertIntoWord, focusLatex]);

  const status = eq.errors > 0 ? `${eq.errors} error${eq.errors > 1 ? "s" : ""}` : eq.diagnostics.length > 0 ? `${eq.diagnostics.length} warning(s)` : "Valid";

  return (
    <div className="app" style={{ ["--left" as string]: `${s.leftWidth}px`, ["--right" as string]: `${s.rightWidth}px` }}>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>∑</span> MathBlocks
        </div>
        <div className="segmented" role="group" aria-label="Editor layout">
          {(["visual", "split", "latex"] as const).map((m) => (
            <button key={m} className={s.mode === m ? "active" : undefined} onClick={() => s.setPrefs({ mode: m })}>
              {m === "visual" ? "Visual" : m === "latex" ? "LaTeX" : "Both"}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Equation type">
          <button className={s.display ? "active" : undefined} onClick={() => s.setDisplay(true)} title="Equation on its own line">Display</button>
          <button className={!s.display ? "active" : undefined} onClick={() => s.setDisplay(false)} title="Equation inside a line of text">Inline</button>
        </div>
        <div className="spacer" />
        <button className="ghost" onClick={() => s.setPaletteOpen(true)} title="Command palette">
          Search commands <kbd>Ctrl K</kbd>
        </button>
        <button
          className="ghost icon"
          title={`Theme: ${s.theme}`}
          onClick={() => s.setPrefs({ theme: s.theme === "system" ? "dark" : s.theme === "dark" ? "light" : "system" })}
        >
          {s.theme === "dark" ? "☾" : s.theme === "light" ? "☀" : "◐"}
        </button>
        <button className="primary" onClick={() => void insertIntoWord()} disabled={!s.connector.connected} title="Ctrl+Enter">
          Send to Word
        </button>
      </header>

      <Sidebar />
      <Splitter width={s.leftWidth} direction={1} onChange={(w) => s.setPrefs({ leftWidth: w })} />

      <main className="workspace">
        <div className="structure-bar" role="toolbar" aria-label="Structures">
          {STRUCTURES.map((st) => (
            <button
              key={st.id}
              title={st.title}
              // Keep focus (and the selection) in the visual editor when clicking a button.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertIntoVisual(st.template)}
            >
              {st.icon}
            </button>
          ))}
        </div>
        {s.mode !== "latex" && (
          <section className="canvas" aria-label="Visual editor">
            <MathEditor />
          </section>
        )}
        {s.mode !== "visual" && (
          <section className="source" aria-label="LaTeX editor">
            <LatexEditor diagnostics={eq.diagnostics} />
          </section>
        )}
      </main>

      <Splitter width={s.rightWidth} direction={-1} onChange={(w) => s.setPrefs({ rightWidth: w })} />
      <Inspector eq={eq} />

      <footer className="statusbar">
        <span className={eq.errors > 0 ? "bad" : "good"}>● {status}</span>
        <span>{eq.nodeCount} nodes</span>
        <span>{s.display ? "Display" : "Inline"}</span>
        <span>{profile.mathFont}</span>
        <div className="spacer" />
        <span className={s.connector.connected ? "good" : "muted"}>
          {s.connector.available ? (s.connector.connected ? `● Word connected${s.connector.hostVersion ? ` (${s.connector.hostVersion})` : ""}` : "○ Word not connected") : "○ Browser preview (no Word)"}
        </span>
      </footer>

      <CommandPalette commands={commands} />
      {s.toast && <div className={`toast ${s.toast.kind}`} role="status">{s.toast.text}</div>}
    </div>
  );
}
