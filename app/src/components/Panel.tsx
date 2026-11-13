import { ContextMenu } from "./ContextMenu";
import { QuickStyleBar } from "./QuickStyleBar";
import { NotationSettings } from "./NotationSettings";
import { useWidthMeasure, WidthBar } from "./WidthBar";
import { useEffect, useMemo, useRef, useState } from "react";
import { MathEditor, focusVisualEditor, insertIntoVisual, restoreEditorFocus } from "./MathEditor";
import { insertPaletteItem } from "./SymbolPalette";
import { ALL_ITEMS, GROUPS, type IndexedItem } from "../lib/palette";
import { Grid, groupItems, QuickAccess, SearchResults, sizeOf } from "./SymbolPalette";
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
  // Remembered: which panes are open, the open flyout, the window's width.
  const [layout, setLayoutState] = useState<PanelLayout>(loadLayout);
  const setLayout = (patch: Partial<PanelLayout>) =>
    setLayoutState((cur) => {
      const next = { ...cur, ...patch };
      if (!next.visual && !next.latex) next.visual = true;
      saveLayout(next);
      return next;
    });
  const flyout = layout.flyout;
  const toggleFlyout = (id: FlyoutId) => setLayout({ flyout: flyout === id ? null : id });
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

  const hide = async () => {
    // The main window ends the edit target the floating editor opened (no stale target).
    void import("@tauri-apps/api/event").then((m) => m.emitTo("main", "panel:closed", null)).catch(() => undefined);
    return (await import("@tauri-apps/api/window")).getCurrentWindow().hide();
  };
  const apply = async () => {
    if (eq.errors > 0) return useApp.getState().notify("Fix the LaTeX errors first.", "error");
    const st = useApp.getState();
    const result: PanelResult = { latex: st.latex, display: st.display, numbered: st.numbered, notationProfile: st.notationProfile, customKinds: st.customKinds, accentRules: st.accentRules };
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
        window.dispatchEvent(new CustomEvent("mb:commands"));
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
        await getCurrentWindow().setSize(new LogicalSize(loadLayout().width, Math.min(760, h)));
      })().catch(() => undefined);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Ctrl+K or Space Space: the Commands flyout, its search focused.
  const focusCommands = useRef(false);
  useEffect(() => {
    const open = () => {
      focusCommands.current = true;
      setLayout({ flyout: "commands" });
      // Already open: focus now (no re-render follows).
      document.querySelector<HTMLInputElement>(".panel-command input")?.focus();
    };
    window.addEventListener("mb:commands", open);
    return () => window.removeEventListener("mb:commands", open);
  });
  useEffect(() => {
    if (flyout !== "commands" || !focusCommands.current) return;
    focusCommands.current = false;
    document.querySelector<HTMLInputElement>(".panel-command input")?.focus();
  }, [flyout]);

  // The width the user dragged the window to is kept for next time.
  useEffect(() => {
    const onResize = () => {
      const w = Math.round(window.innerWidth);
      if (w >= 480 && Math.abs(w - loadLayout().width) > 4) setLayout({ width: w });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  });

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
  const hint = toast ? toast.text : eq.errors ? `${eq.errors} error(s)` : display ? "Ctrl+Enter apply · Enter new line · Esc cancel" : "Enter apply · Esc cancel";
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

        <div className="panel-body2">
          {/* One icon per group; each opens its flyout, one at a time. */}
          <nav className="panel-rail" aria-label="Tools">
            {FLYOUTS.map((f) => (
              <button key={f.id} className={flyout === f.id ? "on" : undefined} title={`${f.label}${f.keys ? ` (${f.keys})` : ""}`} aria-pressed={flyout === f.id} onMouseDown={(e) => e.preventDefault()} onClick={() => toggleFlyout(f.id)}>
                <span aria-hidden>{f.icon}</span>
              </button>
            ))}
          </nav>
          <div className="panel-main">
            <section className={layout.visual ? "panel-pane2" : "panel-pane2 collapsed"}>
              <button className="panel-pane-head" onClick={() => setLayout({ visual: !layout.visual })} aria-expanded={layout.visual}>
                {layout.visual ? "▾" : "▸"} Visual
              </button>
              <div className="panel-editor" hidden={!layout.visual}>
                <MathEditor />
              </div>
              {layout.visual && <WidthBar />}
            </section>
            <section className={layout.latex ? "panel-pane2" : "panel-pane2 collapsed"}>
              <button className="panel-pane-head" onClick={() => setLayout({ latex: !layout.latex })} aria-expanded={layout.latex}>
                {layout.latex ? "▾" : "▸"} LaTeX
              </button>
              {layout.latex && (
                <div className="panel-latex">
                  <LatexEditor diagnostics={eq.diagnostics} />
                </div>
              )}
            </section>
            {flyout && (
              <section className="panel-flyout" aria-label={FLYOUTS.find((f) => f.id === flyout)?.label}>
                <div className="panel-flyout-head">
                  <span>{FLYOUTS.find((f) => f.id === flyout)?.label}</span>
                  <button className="panel-icon" title="Close" onClick={() => setLayout({ flyout: null })}>
                    ✕
                  </button>
                </div>
                <div className="panel-flyout-body">
                  {flyout === "commands" && <CommandLine commands={commands} />}
                  {flyout === "favourites" && <QuickRow />}
                  {flyout === "symbols" && <GroupFlyout row="symbols" />}
                  {flyout === "structures" && <GroupFlyout row="templates" />}
                  {flyout === "collections" && <GroupFlyout row="tabs" />}
                  {flyout === "style" && (
                    <div className="form narrow">
                      <label>
                        Equations in Word
                        <select value={look} onChange={(e) => app.setPrefs({ look: e.target.value as "classic" | "native" })}>
                          <option value="classic">Classic: MathType look</option>
                          <option value="native">Native Word equation</option>
                        </select>
                      </label>
                      <button className="link-button" onClick={() => void import("./NotationSettings").then((m) => m.openNotationSettings())}>
                        Kinds and their styles, my own kinds…
                      </button>
                    </div>
                  )}
                  {flyout === "preview" && (look === "classic" ? <ClassicPreview latex={latex} display={display} sizePt={sizePt} guidePt={width?.availPt} /> : <MathPreview latex={latex} />)}
                </div>
              </section>
            )}
          </div>
        </div>

        <div className="panel-foot2">
          <span className={eq.errors || toast?.kind === "error" ? "panel-hint bad" : "panel-hint"}>{hint}</span>
          <div className="spacer" />
          <button onClick={cancel}>Cancel</button>
          <button className="primary panel-apply" onClick={() => void apply()} disabled={eq.errors > 0} title={display ? "Ctrl+Enter" : "Enter"}>
            {info?.linked ? "Update everywhere" : "Apply"}
          </button>
          <span
            className="panel-grip"
            title="Drag to change the width"
            onMouseDown={(e) => {
              e.preventDefault();
              void import("@tauri-apps/api/window").then((m) => m.getCurrentWindow().startResizeDragging("East")).catch(() => undefined);
            }}
          />
        </div>
      </div>
      <QuickStyleBar />
      <NotationSettings />
      <ContextMenu />
    </div>
  );
}

type FlyoutId = "commands" | "favourites" | "symbols" | "structures" | "collections" | "style" | "preview";
const FLYOUTS: { id: FlyoutId; icon: string; label: string; keys?: string }[] = [
  { id: "commands", icon: "⌕", label: "Commands and LaTeX", keys: "Ctrl+K, Space Space" },
  { id: "favourites", icon: "★", label: "Favourites" },
  { id: "symbols", icon: "≤", label: "Symbols" },
  { id: "structures", icon: "∑", label: "Structures (fractions, scripts, matrices…)" },
  { id: "collections", icon: "⇀", label: "Spacecraft, my notation and collections" },
  { id: "style", icon: "Aa", label: "Style" },
  { id: "preview", icon: "◫", label: "Preview (as in Word)" },
];

interface PanelLayout {
  visual: boolean;
  latex: boolean;
  flyout: FlyoutId | null;
  width: number;
}
const LAYOUT_KEY = "mathblocks.panel.layout.v1";
const DEFAULT_LAYOUT: PanelLayout = { visual: true, latex: true, flyout: null, width: 720 };
function loadLayout(): PanelLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    return raw ? { ...DEFAULT_LAYOUT, ...(JSON.parse(raw) as Partial<PanelLayout>) } : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}
function saveLayout(l: PanelLayout) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(l));
  } catch {
    // Not remembered.
  }
}

/** One palette row's groups as chips, the chosen group's items below, with a search. */
function GroupFlyout({ row }: { row: "symbols" | "templates" | "tabs" }) {
  const groups = GROUPS.filter((g) => g.row === row && g.items.length);
  const [id, setId] = useState(groups[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const g = groups.find((x) => x.id === id) ?? groups[0];
  return (
    <div className="panel-groups">
      <div className="panel-chips">
        {groups.map((x) => (
          <button key={x.id} className={x.id === g?.id && !query ? "on" : undefined} onMouseDown={(e) => e.preventDefault()} onClick={() => (setId(x.id), setQuery(""))}>
            {x.label}
          </button>
        ))}
        <input className="panel-chip-search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {query ? <SearchResults query={query} /> : g ? <Grid items={groupItems(g)} size={sizeOf(g)} /> : null}
    </div>
  );
}

const CARD_MARGIN = 14;

/** One-click favourites: the same Quick access as the main window (drag to reorder, right-click to unpin). */
function QuickRow() {
  return (
    <div className="panel-quick" role="toolbar" aria-label="Favourite symbols">
      <QuickAccess max={18} />
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
    restoreEditorFocus(true);
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
          else if (e.key === "Escape") (e.preventDefault(), q ? setQ("") : restoreEditorFocus(true));
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
