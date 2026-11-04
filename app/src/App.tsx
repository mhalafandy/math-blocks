import { useCallback, useEffect, useMemo } from "react";
import { BottomPanel } from "./components/BottomPanel";
import { CommandPalette } from "./components/CommandPalette";
import { focusLatexEditor } from "./components/LatexEditor";
import { focusVisualEditor, MathEditor, toggleBold } from "./components/MathEditor";
import { newEquation, setWordUpdater } from "./lib/actions";
import { handleEditorKey } from "./lib/editorKeys";
import { openShortcuts, ShortcutsDialog } from "./components/ShortcutsDialog";
import { onPasteImage, RecognitionDialog } from "./components/RecognitionDialog";
import { SnippetsDialog } from "./components/SnippetsDialog";
import { Sidebar } from "./components/Sidebar";
import { HSplitter, Splitter } from "./components/Splitter";
import { PaletteTop, SymbolPanel } from "./components/SymbolPalette";
import { buildCommands } from "./lib/commands";
import { connector } from "./lib/connector";
import { buildInsertion, useCompiledEquation, useProfile } from "./lib/equation";
import { useApp } from "./lib/store";
import { installAndRestart, startUpdates } from "./lib/updates";
import { isDirty, useLibrary } from "./lib/library/useLibrary";
import { insertLinked, unlinkEditing } from "./lib/linking";
import { ContextMenu, openMenu } from "./components/ContextMenu";
import { PromptHost } from "./components/Dialogs";
import { ReferencePicker } from "./components/ReferencePicker";
import { openTemplate, TemplateDialog } from "./components/TemplateDialog";
import { NotationDialog } from "./components/NotationDialog";
import { NomenclatureDialog } from "./components/NomenclatureDialog";
import { numberInWord, unnumberInWord } from "./lib/numbering";
import { ConversionReport } from "./components/ConversionReport";
import { SaveDialog } from "./components/SaveDialog";
import { zoomStep } from "./lib/zoom";

/** Adds or removes the number of an equation that is in Word (keeps its tag). */
async function setNumberOf(tag: string, latex: string, numbered: boolean, display: boolean) {
  const st = useApp.getState();
  if (numbered) {
    const r = await numberInWord(tag, latex);
    if (r) st.notify(`Numbered ${r.number}`);
  } else {
    await unnumberInWord(tag, latex, display);
    st.notify("Number removed");
  }
  const ed = useApp.getState().editing;
  if (ed?.tag === tag) st.setEditing({ ...ed, numbered });
};


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
    void import("./lib/panel").then((m) => m.initPanelBridge()).catch(() => undefined);
    void import("./lib/wordShortcuts").then((m) => m.initWordShortcuts()).catch(() => undefined);
    void useLibrary.getState().init();
    void startUpdates();
  }, []);

  const insertIntoWord = useCallback(async () => {
    const { connector: c, latex, display, notify, editing, setEditing } = useApp.getState();
    if (!c.available) return notify("Sending to Word works in the desktop app.", "error");
    if (!c.connected) return notify("Word is not connected. Start Word with the MathBlocks add-in installed.", "error");
    if (eq.errors > 0) return notify("Fix the LaTeX errors first.", "error");
    try {
      const lib = useLibrary.getState();
      const libEq = lib.open ? lib.equations.find((q) => q.id === lib.open!.id) : undefined;
      const dirty = isDirty(lib.open, latex, display);
      const { numbered } = useApp.getState();
      const shape = display && !numbered; // display paragraph; numbered equations are inline math
      if (editing?.blockId && libEq) {
        // A linked copy: save a new library version; every copy (this one included) follows.
        if (dirty) await lib.saveCurrent();
        else if (!!editing.numbered === numbered) notify("No changes: the linked copies already show this version");
        if (!!editing.numbered !== numbered) await setNumberOf(editing.tag, latex, numbered, display);
      } else if (editing) {
        if (!!editing.numbered !== numbered) {
          await setNumberOf(editing.tag, latex, numbered, display);
        } else {
          const { flatOpc } = await buildInsertion(latex, shape, profile, editing.tag, undefined, display);
          const r = await connector.request("replaceEquation", { tag: editing.tag, flatOpc, undoLabel: "Update equation" });
          notify(r.found === 1 ? "Equation updated in Word" : `Updated, but found ${r.found} copies of its tag`);
        }
      } else if (libEq && !dirty) {
        const found = await insertLinked(libEq);
        notify(found === 1 ? `Inserted a linked copy of “${libEq.name}”` : `Inserted, but found ${found} copies of its tag`);
        void lib.markUsed(libEq.id);
      } else {
        const { tag, flatOpc } = await buildInsertion(latex, shape, profile, undefined, undefined, display);
        const r = await connector.request("insertEquation", { tag, flatOpc, display: shape, undoLabel: "Insert equation" });
        let numberText = "";
        if (numbered) numberText = (await numberInWord(tag, latex))?.number ?? "";
        notify(
          libEq
            ? "Inserted as an unlinked copy because of unsaved changes. Save (Ctrl+S) first to insert a linked copy."
            : r.found === 1 ? `Inserted into Word${numberText ? ` as ${numberText}` : ""}` : `Inserted, but found ${r.found} copies of its tag`,
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      notify(message, "error");
      if (editing && /no longer in the document/.test(message)) setEditing(null);
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
    requestAnimationFrame(() => focusLatexEditor());
  }, []);

  const commands = useMemo(() => buildCommands({ insertIntoWord, copyLatex, focusLatex }), [insertIntoWord, copyLatex, focusLatex]);

  // The floating editor applies its changes through the same action as "Update in Word".
  useEffect(() => {
    setWordUpdater(insertIntoWord);
    return () => void setWordUpdater(null);
  }, [insertIntoWord]);

  // VS Code-style shortcuts. Capture phase, so they work even while the equation editor has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        return openShortcuts();
      }
      // MathType-style shortcuts while the equation editor has the focus.
      if (handleEditorKey(e)) return;
      const st = useApp.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      let handled = true;
      if (k === "k" || (e.shiftKey && k === "p")) st.setPaletteOpen(!st.paletteOpen);
      else if (k === "enter") void insertIntoWord();
      else if (k === "s" && e.shiftKey) useLibrary.getState().setDialog({ mode: "new", folderId: currentFolder() });
      else if (k === "s") void useLibrary.getState().saveCurrent();
      else if (k === "l") focusLatex();
      else if (k === "b" && e.shiftKey) toggleBold();
      else if (k === "n") newEquation();
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

  // Pasting a picture of an equation recognises it.
  useEffect(() => {
    window.addEventListener("paste", onPasteImage, true);
    return () => window.removeEventListener("paste", onPasteImage, true);
  }, []);

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
        <TitleArea />
        <div className="segmented" role="group" aria-label="Equation type">
          <button className={s.display && !s.numbered ? "active" : undefined} onClick={() => (s.setDisplay(true), s.setNumbered(false))} title="Equation on its own line">Display</button>
          <button className={!s.display ? "active" : undefined} onClick={() => s.setDisplay(false)} title="Equation inside a line of text">Inline</button>
          <button className={s.numbered ? "active" : undefined} onClick={() => s.setNumbered(true)} title="Display equation with a number, e.g. (1), that Word renumbers and you can cross-reference">Numbered</button>
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
        <button
          className="primary"
          onClick={() => void insertIntoWord()}
          disabled={!s.connector.connected}
          title={!s.connector.connected ? "Start Word to enable" : s.editing?.blockId ? "Save a new version and update all linked copies (Ctrl+Enter)" : s.editing ? "Replace the equation in Word (Ctrl+Enter)" : useLibrary.getState().open ? "Insert a linked copy at Word's cursor (Ctrl+Enter)" : "Insert at Word's cursor (Ctrl+Enter)"}
        >
          {s.editing?.blockId ? "Update everywhere" : s.editing ? "Update in Word" : "Send to Word"}
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
          <div>
        {s.editing && (
          <div
            className={s.editing.blockId ? "editing-bar linked" : "editing-bar"}
            title={s.editing.blockId ? "A linked copy: saving updates every copy in your documents" : s.editing.adopted ? "Equation typed in Word, now managed by MathBlocks" : "MathBlocks equation from Word"}
          >
            <span className="editing-label">{s.editing.blockId ? "Editing a linked equation from Word" : "Editing an equation from Word"}</span>
            <span className="muted">{s.editing.blockId ? "Update everywhere (Ctrl+Enter) changes every copy" : "Update in Word (Ctrl+Enter) replaces it"}</span>
            <div className="spacer" />
            {s.editing.blockId && (
              <button title="Make this copy an ordinary equation that no longer follows the library" onClick={() => void unlinkEditing()}>
                Unlink this copy
              </button>
            )}
            <button title="Stop editing (next Send inserts a new equation)" onClick={() => s.setEditing(null)}>
              Stop editing
            </button>
          </div>
        )}
            <NoticeBar />
            {s.paletteLocation === "top" && <PaletteTop />}
          </div>
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
              {!s.latex.trim() && (
                <div className="canvas-hint" aria-hidden>
                  Type an equation: <kbd>x^2</kbd> <kbd>alpha</kbd> <kbd>-&gt;</kbd> <kbd>/</kbd> for a fraction
                  <br />
                  <kbd>Ctrl F</kbd> fraction · <kbd>Ctrl R</kbd> root · <kbd>Ctrl H</kbd>/<kbd>Ctrl L</kbd> super/subscript · <kbd>Ctrl Shift V</kbd> vector · <kbd>F1</kbd> all shortcuts
                </div>
              )}
            </div>
            <div className="canvas-tools">
              <button
                className="icon-btn"
                title="Export: copy as image or MathML, save SVG/PNG, use with other symbols"
                onClick={(e) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  openMenu({ clientX: r.left, clientY: r.top - 190, preventDefault: () => undefined }, [
                    { label: "Copy as image (PNG)", onSelect: () => void import("./lib/export").then((m) => m.copyImage()) },
                    { label: "Copy as MathML", onSelect: () => void import("./lib/export").then((m) => m.copyMathMl()) },
                    { label: "Copy LaTeX", onSelect: () => void copyLatex() },
                    { separator: true, label: "" },
                    { label: "Save as SVG…", onSelect: () => void import("./lib/export").then((m) => m.saveSvg()) },
                    { label: "Save as PNG…", onSelect: () => void import("./lib/export").then((m) => m.savePng()) },
                    { separator: true, label: "" },
                    { label: "Use with other symbols…", onSelect: () => openTemplate(s.latex, s.display) },
                  ]);
                }}
              >
                ⤓
              </button>
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
        <span>{s.numbered ? "Numbered" : s.display ? "Display" : "Inline"}</span>
        <button className="status-btn" title="How equations go into Word (Word style tab)" onClick={() => s.setPrefs({ bottomOpen: true, bottomTab: "style" })}>
          {s.look === "classic" ? `Classic ${s.equationSizePt} pt` : `Native · ${profile.mathFont}`}
        </button>
        <button className="status-btn" title="Keyboard shortcuts (F1)" onClick={openShortcuts}>
          ⌨ Shortcuts
        </button>
        <div className="spacer" />
        {s.update.status === "downloading" && <span className="muted">Downloading update {s.update.newVersion}…</span>}
        {s.update.addin === "pendingWordClosed" && <span className="warn">Word add-in update waiting: close Word to finish</span>}
        {s.update.currentVersion && <span className="muted">v{s.update.currentVersion}</span>}
        <span className={s.connector.connected ? "good" : "muted"}>
          {s.connector.available ? (s.connector.connected ? `● Word connected${s.connector.hostVersion ? ` (${s.connector.hostVersion})` : ""}` : "○ Word not connected") : "○ Browser preview (no Word)"}
        </span>
      </footer>

      <CommandPalette commands={commands} />
      <SaveDialog />
      <PromptHost />
      <ConversionReport />
      <ReferencePicker />
      <TemplateDialog onSend={() => void insertIntoWord()} />
      <NotationDialog />
      <NomenclatureDialog />
      <ShortcutsDialog />
      <RecognitionDialog />
      <SnippetsDialog />
      <ContextMenu />
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

/** Folder of the open library equation (new saves default to it). */
const currentFolder = () => {
  const { open, equations } = useLibrary.getState();
  return open ? (equations.find((q) => q.id === open.id)?.folderId ?? null) : null;
};

/** Name of the open library equation (or "Untitled"), unsaved marker and Save button. */
function TitleArea() {
  const open = useLibrary((s) => s.open);
  const equations = useLibrary((s) => s.equations);
  const saveCurrent = useLibrary((s) => s.saveCurrent);
  const latex = useApp((s) => s.latex);
  const display = useApp((s) => s.display);
  const q = open ? equations.find((x) => x.id === open.id) : undefined;
  const dirty = isDirty(open, latex, display);
  return (
    <div className="title-area">
      <button
        className="doc-title"
        title={q ? "Show library details and version history" : "Not in the library yet: click to save"}
        onClick={() => (q ? useApp.getState().setPrefs({ bottomOpen: true, bottomTab: "details" }) : useLibrary.getState().setDialog({ mode: "new" }))}
      >
        {q && <span className="muted editing-label">Library:</span>}
        <span className={q ? "name" : "name untitled"}>{q ? q.name : "New equation (not saved)"}</span>
        {dirty && <span className="dirty" title="Unsaved changes">●</span>}
      </button>
      <button className="ghost save-btn" onClick={newEquation} title="Start a new, empty equation (Ctrl+N)">
        ＋ New
      </button>
      <button className="ghost save-btn" onClick={() => void saveCurrent()} title={q ? "Save a new version (Ctrl+S)" : "Save to library (Ctrl+S)"} disabled={!!q && !dirty}>
        {q ? (dirty ? "Save" : "Saved") : "Save"}
      </button>
    </div>
  );
}

/** Message bar with actions (e.g. a document whose linked equations are out of date). */
function NoticeBar() {
  const notice = useApp((s) => s.notice);
  if (!notice) return null;
  return (
    <div className="notice-bar" role="status">
      <span>{notice.text}</span>
      <div className="spacer" />
      {notice.actions.map((a, i) => (
        <button key={a.label} className={i === 0 ? "primary" : undefined} onClick={() => void a.run()}>
          {a.label}
        </button>
      ))}
    </div>
  );
}
