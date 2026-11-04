import { useWidthMeasure, WidthBar } from "./WidthBar";
import { useEffect, useMemo, useRef, useState } from "react";
import { MathEditor, focusVisualEditor, insertIntoVisual } from "./MathEditor";
import { insertPaletteItem } from "./SymbolPalette";
import { ALL_ITEMS, type IndexedItem } from "../lib/palette";
import { PaletteTop } from "./SymbolPalette";
import { LatexEditor } from "./LatexEditor";
import { ClassicPreview } from "./ClassicPreview";
import { MathPreview } from "./MathPreview";
import { buildCommands, type Command } from "../lib/commands";
import { useCompiledEquation } from "../lib/equation";
import type { PanelOpen, PanelResult } from "../lib/panel";
import { useApp } from "../lib/store";
import { handleEditorKey } from "../lib/editorKeys";

/**
 * The floating editor window (opened by right-clicking an equation in Word). Commands first
 * (type /frac, /bold…), the rest in collapsible sections. Enter applies (Ctrl+Enter in a display
 * equation, where Enter starts a new line), Esc cancels.
 */
export function PanelApp() {
  const [info, setInfo] = useState<PanelOpen | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const openedAt = useRef(0);
  const [tab, setTab] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TAB_KEY);
    } catch {
      return null;
    }
  });
  const chooseTab = (t: string) => {
    const next = tab === t ? null : t;
    setTab(next);
    try {
      if (next) localStorage.setItem(TAB_KEY, next);
      else localStorage.removeItem(TAB_KEY);
    } catch {
      // Not remembered.
    }
  };
  const latex = useApp((s) => s.latex);
  const display = useApp((s) => s.display);
  const numbered = useApp((s) => s.numbered);
  const look = useApp((s) => s.look);
  const sizePt = useApp((s) => s.equationSizePt);
  const width = useWidthMeasure();
  const eq = useCompiledEquation();
  const toast = useApp((s) => s.toast);
  const theme = useApp((s) => s.theme);

  // Same theme as the main window (shared preferences).
  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const hide = async () => (await import("@tauri-apps/api/window")).getCurrentWindow().hide();
  const apply = async () => {
    if (eq.errors > 0) return useApp.getState().notify("Fix the LaTeX errors first.", "error");
    const st = useApp.getState();
    const result: PanelResult = { latex: st.latex, display: st.display, numbered: st.numbered };
    const { emitTo } = await import("@tauri-apps/api/event");
    await emitTo("main", "panel:apply", result);
    await hide();
  };
  const cancel = () => void hide();
  const send = async (event: string) => (await import("@tauri-apps/api/event")).emitTo("main", event, null);

  // Opened for an equation: load it.
  useEffect(() => {
    let off: (() => void) | undefined;
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      off = await listen<PanelOpen>("panel:open", (e) => {
        const app = useApp.getState();
        app.setPrefs({ look: e.payload.look, equationSizePt: e.payload.sizePt, ...(e.payload.theme ? { theme: e.payload.theme } : {}) });
        app.setLatex(e.payload.latex, "external");
        app.setDisplay(e.payload.display);
        app.setNumbered(e.payload.numbered);
        setInfo(e.payload);
        openedAt.current = Date.now();
        requestAnimationFrame(() => focusVisualEditor());
      });
    })().catch(() => undefined); // browser preview: no Tauri
    return () => off?.();
  }, []);

  // Pasting a picture of an equation recognises it (same as in the main window).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => void import("./RecognitionDialog").then((m) => m.onPasteImage(e));
    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }, []);

  // Enter / Ctrl+Enter applies, Esc cancels (capture: also while the equation editor has focus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.(".panel-command")) return;
      if (handleEditorKey(e)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        (document.querySelector(".panel-command input") as HTMLInputElement | null)?.focus();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "Enter" && !e.shiftKey && (e.ctrlKey || e.metaKey || !(e.target as HTMLElement)?.closest?.(".cm-editor"))) {
        e.preventDefault();
        void apply();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // The window takes the card's height (the card is sized by its content, never by the window).
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let last = 0;
    const ro = new ResizeObserver(() => {
      const h = Math.ceil(el.getBoundingClientRect().height) + 2 * CARD_MARGIN;
      if (Math.abs(h - last) < 2) return;
      last = h;
      void (async () => {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { LogicalSize } = await import("@tauri-apps/api/dpi");
        await getCurrentWindow().setSize(new LogicalSize(PANEL_WIDTH, Math.min(720, h)));
      })().catch(() => undefined);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Behaves like a popover: clicking back into Word (or anywhere else) closes it.
  useEffect(() => {
    let off: (() => void) | undefined;
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      off = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (!focused && Date.now() - openedAt.current > 600) void hide();
      });
    })().catch(() => undefined);
    return () => off?.();
  }, []);

  // Library equations, searchable from the command line (read each time the panel opens).
  const [library, setLibrary] = useState<Command[]>([]);
  useEffect(() => {
    if (!info) return;
    void (async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      const { tauriStore } = await import("../lib/library/tauriStore");
      const { equations } = await tauriStore(invoke).list();
      setLibrary(
        equations.map((q) => ({
          id: `lib.${q.id}`,
          title: `Library: ${q.name}`,
          group: "Insert" as const,
          keywords: `${q.tags.map((t) => `#${t}`).join(" ")} ${q.description} ${q.latex}`,
          run: () => {
            useApp.getState().setLatex(q.latex, "external");
            useApp.getState().setDisplay(q.display);
          },
        })),
      );
    })().catch(() => setLibrary([]));
  }, [info]);

  const commands = useMemo(
    () => [
      ...library,
      ...buildCommands({
        insertIntoWord: () => void apply(),
        copyLatex: () => void navigator.clipboard.writeText(useApp.getState().latex),
        focusLatex: () => undefined,
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [library],
  );

  const app = useApp.getState();
  const tabs: [string, string][] = [
    ["preview", look === "classic" ? "Preview" : "Preview"],
    ["symbols", "Symbols"],
    ["latex", "LaTeX"],
    ["style", "Style"],
  ];
  return (
    <div className="panel-shell">
      <div className="panel-card" ref={root}>
        <div className="panel-top" data-tauri-drag-region>
          <div className="panel-modes" role="group" aria-label="Equation type">
            <button className={display && !numbered ? "on" : undefined} onClick={() => (app.setDisplay(true), app.setNumbered(false))}>
              Display
            </button>
            <button className={!display ? "on" : undefined} onClick={() => app.setDisplay(false)}>
              Inline
            </button>
            <button className={numbered ? "on" : undefined} onClick={() => app.setNumbered(true)}>
              Numbered
            </button>
          </div>
          {info?.linked && <span className="panel-linked" title="A linked copy: applying updates every copy">⛓ {info.linked}</span>}
          <div className="spacer" data-tauri-drag-region />
          <button className="panel-icon" title="Word's own menu (cut, copy, paste…)" onClick={() => void send("panel:wordMenu").then(cancel)}>
            ☰
          </button>
          <button className="panel-icon" title="Open in the MathBlocks window" onClick={() => void send("panel:openApp").then(cancel)}>
            ↗
          </button>
          <button className="panel-icon" title="Cancel (Esc)" onClick={cancel}>
            ✕
          </button>
        </div>

        <div className="panel-editor">
          <MathEditor />
        </div>
        <WidthBar />

        <CommandLine commands={commands} />
        <QuickRow />

        <div className="panel-tabs" role="tablist">
          {tabs.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : undefined} onClick={() => chooseTab(id)}>
              {label}
            </button>
          ))}
          <div className="spacer" />
          <span className={eq.errors || toast?.kind === "error" ? "panel-hint bad" : "panel-hint"}>
            {toast ? toast.text : eq.errors ? `${eq.errors} error(s)` : display ? "Ctrl+Enter apply · Enter new line · Esc cancel" : "Enter apply · Esc cancel"}
          </span>
          <button className="primary panel-apply" onClick={() => void apply()} disabled={eq.errors > 0}>
            {info?.linked ? "Update everywhere" : "Apply"}
          </button>
        </div>

        {tab && (
          <div className="panel-pane">
            {tab === "preview" && (look === "classic" ? <ClassicPreview latex={latex} display={display} sizePt={sizePt} guidePt={width?.availPt} /> : <MathPreview latex={latex} />)}
            {tab === "symbols" && <PaletteTop />}
            {tab === "latex" && (
              <div className="panel-latex">
                <LatexEditor diagnostics={eq.diagnostics} />
              </div>
            )}
            {tab === "style" && (
              <div className="form narrow">
                <label>
                  Equations in Word
                  <select value={look} onChange={(e) => app.setPrefs({ look: e.target.value as "classic" | "native" })}>
                    <option value="classic">Classic: MathType look</option>
                    <option value="native">Native Word equation</option>
                  </select>
                </label>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const PANEL_WIDTH = 680;
const CARD_MARGIN = 14;
const TAB_KEY = "mathblocks.panel.tab";

/** One-click favourites (the main window's Quick access, right-click there to change them). */
function QuickRow() {
  const favorites = useApp((s) => s.favorites);
  const items = useMemo(() => favorites.map((k) => ALL_ITEMS.find((x) => x.key === k)).filter((x): x is IndexedItem => !!x).slice(0, 18), [favorites]);
  if (!items.length) return null;
  return (
    <div className="panel-quick" role="toolbar" aria-label="Favourite symbols">
      {items.map((x) => (
        <button key={x.key} title={x.item.name} onMouseDown={(e) => e.preventDefault()} onClick={() => insertPaletteItem(x)}>
          {x.item.glyph ? <span className="glyph">{x.item.glyph}</span> : <MathPreview latex={x.item.latex.replace(/#[0?@]/g, "\\square")} />}
        </button>
      ))}
    </div>
  );
}

const LOOKS_LIKE_LATEX = /[\\^_{}]/;

/** "/frac", "bold", "matrix 3"… with suggestions; Enter runs the first, arrows choose. LaTeX is inserted as is. */
function CommandLine({ commands }: { commands: Command[] }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const query = q.replace(/^\//, "").trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return [];
    const words = query.split(/\s+/);
    return commands
      .map((c) => {
        const hay = `${c.title} ${c.keywords ?? ""}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return null;
        const score = (c.title.toLowerCase().includes(query) ? 0 : 1) + (c.group === "Insert" ? 0.5 : 0);
        return { c, score };
      })
      .filter((x): x is { c: Command; score: number } => !!x)
      .sort((a, b) => a.score - b.score)
      .slice(0, 7)
      .map((x) => x.c);
  }, [commands, query]);
  const asLatex = !q.trim().startsWith("/") && LOOKS_LIKE_LATEX.test(q) ? q.trim() : null;
  const run = (c: Command | undefined) => {
    if (!c) {
      if (asLatex) {
        setQ("");
        insertIntoVisual(asLatex);
      }
      return;
    }
    setQ("");
    void c.run();
    requestAnimationFrame(() => focusVisualEditor());
  };
  return (
    <div className="panel-command">
      <input
        value={q}
        placeholder="Command or LaTeX: /frac, /matrix, /bold, /numbered, \alpha_1…   (Ctrl+K)"
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), setSel(Math.min(sel + 1, matches.length - 1)));
          else if (e.key === "ArrowUp") (e.preventDefault(), setSel(Math.max(sel - 1, 0)));
          else if (e.key === "Enter") (e.preventDefault(), run(asLatex && sel === 0 && !matches.length ? undefined : matches[sel]));
          else if (e.key === "Escape") (e.preventDefault(), q ? setQ("") : focusVisualEditor());
        }}
        spellCheck={false}
      />
      {asLatex && !matches.length && <div className="panel-suggest panel-latex-hint">Enter inserts the LaTeX <MathPreview latex={asLatex} /></div>}
      {matches.length > 0 && (
        <ul className="panel-suggest">
          {matches.map((c, i) => (
            <li key={c.id}>
              <button className={i === sel ? "on" : undefined} onMouseDown={(e) => (e.preventDefault(), run(c))}>
                <span>{c.title}</span>
                {c.shortcut && <kbd>{c.shortcut}</kbd>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
