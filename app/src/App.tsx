import { MathPreview } from "./components/MathPreview";
import { GearIcon, PreviewIcon } from "./components/Icons";
import { DefineSymbolDialog, SymbolListDialog } from "./components/SymbolList";
import { useBlocks } from "./lib/blocks/useBlocks";
import { SaveBlockDialog } from "./components/SaveBlockDialog";
import { BlockStatus, SlotHints } from "./components/BlockSlots";
import { PreviewView } from "./components/PreviewView";
import { SettingsDialog } from "./components/SettingsDialog";
import { SuggestBar } from "./components/SuggestBar";
import { BenchmarkBar } from "./components/Benchmark";
import { acceptSuggestion, fitZoom } from "./components/MathEditor";
import { openSettings, type SettingsPage } from "./lib/settingsStore";
import { dockPreview, initPreviewSync, previewShown, togglePreview, usePreviewPane } from "./lib/previewWindow";
import { NotationSettings } from "./components/NotationSettings";
import { QuickStyleBar } from "./components/QuickStyleBar";
import { WidthBar } from "./components/WidthBar";
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
import { useCompiledEquation, useProfile } from "./lib/equation";
import { useApp } from "./lib/store";
import { installAndRestart, startUpdates } from "./lib/updates";
import { isDirty, useLibrary } from "./lib/library/useLibrary";
import { unlinkEditing } from "./lib/linking";
import { ContextMenu, openMenu } from "./components/ContextMenu";
import { PromptHost } from "./components/Dialogs";
import { ReferencePicker } from "./components/ReferencePicker";
import { openTemplate, TemplateDialog } from "./components/TemplateDialog";
import { NotationDialog } from "./components/NotationDialog";
import { NomenclatureDialog } from "./components/NomenclatureDialog";
import { ThesisDialog } from "./components/ThesisDialog";
import { NormalizeBoldDialog } from "./components/NormalizeBoldDialog";
import { FontCompareDialog } from "./components/FontCompareDialog";
import { NumberMarkerDialog } from "./components/NumberMarkerDialog";
import { InterchangeDialog } from "./components/InterchangeDialog";
import { BrokenReferencesDialog } from "./components/BrokenReferencesDialog";
import { NumberingDialog } from "./components/NumberingDialog";
import { KindsReviewDialog } from "./components/KindsReviewDialog";
import { DocumentStyleDialog } from "./components/DocumentStyleDialog";
import { CheckStyleDialog } from "./components/CheckStyleDialog";
import { BoldGreekSheet } from "./components/BoldGreekSheet";
import { AccentsDialog } from "./components/AccentsDialog";
import { sendToWord } from "./lib/sendToWord";
import { ConversionReport } from "./components/ConversionReport";
import { SaveDialog } from "./components/SaveDialog";
import { zoomStep } from "./lib/zoom";

/** Adds or removes the number of an equation that is in Word (keeps its tag). */



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
    void import("./lib/blocks/useBlocks").then((m) => m.initBlocks("main")).catch(() => undefined);
    void startUpdates();
  }, []);

  const insertIntoWord = useCallback(() => sendToWord({ errors: eq.errors, profile }), [eq.errors, profile]);

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

  const blocksVersion = useBlocks((b) => b.blocks.length + b.docBlocks.length * 1000 + b.blocks.reduce((n, x) => n + x.version, 0));
  const commands = useMemo(() => buildCommands({ insertIntoWord, copyLatex, focusLatex }), [insertIntoWord, copyLatex, focusLatex, blocksVersion]);

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
      else if (k === ",") openSettings();
      else if (k === "enter") void insertIntoWord();
      else if (k === "s" && e.shiftKey) useLibrary.getState().setDialog({ mode: "new", folderId: currentFolder() });
      else if (k === "s") void useLibrary.getState().saveCurrent();
      else if (k === "l") focusLatex();
      else if (k === "b" && e.shiftKey) toggleBold();
      else if (k === "n") newEquation();
      else if (k === "p" && e.altKey) void togglePreview();
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

  const paneOpen = usePreviewPane((p) => p.open);
  const previewOpen = useApp((st) => previewShown(st, paneOpen));
  // The floating editor's ⚙ opens the settings here (its window is too small for them).
  useEffect(() => {
    let off: (() => void) | undefined;
    if (!("__TAURI_INTERNALS__" in window)) return;
    void import("@tauri-apps/api/event")
      .then((m) =>
        m.listen<{ page: SettingsPage | null }>("panel:openSettings", async (e) => {
          openSettings(e.payload.page ?? undefined);
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const w = getCurrentWindow();
          await w.unminimize();
          await w.show();
          await w.setFocus();
        }),
      )
      .then((f) => (off = f))
      .catch(() => undefined);
    return () => off?.();
  }, []);
  const activeSizePt = useApp((st) => (st.docStyle?.stored ? st.docStyle.style.global.sizePt : st.equationSizePt));
  useEffect(() => initPreviewSync(), []);

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
        <button className="icon-btn" title="Settings (Ctrl+,)" aria-label="Settings" onClick={() => openSettings()}>
          <GearIcon />
        </button>
        <button className={previewOpen ? "icon-btn on" : "icon-btn"} title="Word preview: the equation as Word gets it, true size, with the line width (Ctrl+Alt+P)" aria-label="Word preview" onClick={() => void togglePreview()}>
          <PreviewIcon />
        </button>
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
          {s.editing?.blockId ? "Update everywhere" : s.editing ? "Update in Word" : "Insert into Word"}
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
            <span className="editing-target" title={`Target: ${s.editing.tag}`}>
              <code>…{s.editing.tag.slice(-6)}</code> {s.editing.opened ? <MathPreview latex={s.editing.opened.length > 120 ? s.editing.opened.slice(0, 120) : s.editing.opened} /> : null}
            </span>
            <span className="muted">{s.editing.blockId ? "Update everywhere (Ctrl+Enter) changes every copy" : "Update in Word (Ctrl+Enter) replaces this one"}</span>
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
                  <kbd>Ctrl F</kbd> fraction · <kbd>Ctrl R</kbd> root · <kbd>Ctrl H</kbd>/<kbd>Ctrl L</kbd> super/subscript · <kbd>Ctrl Shift V</kbd> vector · <kbd>Space</kbd> next slot · <kbd>Ctrl K</kbd> commands · <kbd>F1</kbd> shortcuts and LaTeX commands
                </div>
              )}
            </div>
            <WidthBar />
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
              <button className="zoom-label" title="Fit: zoom out to show the whole equation" onClick={() => s.setPrefs({ zoom: fitZoom(s.zoom, document.querySelector(".canvas-scroll")) })}>
                Fit
              </button>
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
        <button className="status-btn" title="How equations go into Word (Settings → Word style)" onClick={() => openSettings("word")}>
          {s.look === "classic" ? `Classic ${s.equationSizePt} pt` : `Native · ${profile.mathFont}`}
        </button>
        <button className="status-btn" title="Keyboard shortcuts (F1)" onClick={() => openShortcuts()}>
          ⌨ Shortcuts
        </button>
        <BlockStatus />
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
      <NotationSettings />
      <QuickStyleBar />
      <SuggestBar onPick={(f) => acceptSuggestion(f.latex)} />
      <BenchmarkBar />
      <SlotHints />
      {paneOpen && !s.previewDocked && (
        // Browser preview (no desktop window): the Word preview as a resizable pane.
        <div className="preview-pane">
          <PreviewView latex={s.latex} display={s.display} numbered={s.numbered} sizePt={activeSizePt} textWidthPt={s.textWidthPt} onClose={() => usePreviewPane.getState().set(false)} onDock={() => void dockPreview()} />
        </div>
      )}
      <NomenclatureDialog />
      <ThesisDialog />
      <NormalizeBoldDialog />
      <FontCompareDialog />
      <NumberMarkerDialog />
      <InterchangeDialog />
      <BrokenReferencesDialog />
      <NumberingDialog />
      <KindsReviewDialog />
      <DocumentStyleDialog />
      <CheckStyleDialog />
      <BoldGreekSheet />
      <AccentsDialog />
      <SettingsDialog />
      <ShortcutsDialog />
      <RecognitionDialog />
      <SnippetsDialog />
      <SaveBlockDialog />
      <SymbolListDialog />
      <DefineSymbolDialog />
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
