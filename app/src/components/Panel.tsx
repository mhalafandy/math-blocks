import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MathEditor, focusVisualEditor } from "./MathEditor";
import { PaletteTop } from "./SymbolPalette";
import { LatexEditor } from "./LatexEditor";
import { ClassicPreview } from "./ClassicPreview";
import { MathPreview } from "./MathPreview";
import { buildCommands, type Command } from "../lib/commands";
import { useCompiledEquation } from "../lib/equation";
import type { PanelOpen, PanelResult } from "../lib/panel";
import { useApp } from "../lib/store";

/**
 * The floating editor window (opened by right-clicking an equation in Word). Commands first
 * (type /frac, /bold…), the rest in collapsible sections. Enter applies, Esc cancels.
 */
export function PanelApp() {
  const [info, setInfo] = useState<PanelOpen | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const latex = useApp((s) => s.latex);
  const display = useApp((s) => s.display);
  const numbered = useApp((s) => s.numbered);
  const look = useApp((s) => s.look);
  const sizePt = useApp((s) => s.equationSizePt);
  const eq = useCompiledEquation();
  const toast = useApp((s) => s.toast);

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
        app.setPrefs({ look: e.payload.look, equationSizePt: e.payload.sizePt });
        app.setLatex(e.payload.latex, "external");
        app.setDisplay(e.payload.display);
        app.setNumbered(e.payload.numbered);
        setInfo(e.payload);
        requestAnimationFrame(() => focusVisualEditor());
      });
    })().catch(() => undefined); // browser preview: no Tauri
    return () => off?.();
  }, []);

  // Enter applies, Esc cancels (capture: also while the equation editor has focus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.(".panel-command")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "Enter" && !e.shiftKey && !(e.target as HTMLElement)?.closest?.(".cm-editor")) {
        e.preventDefault();
        void apply();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // The window follows its content's height.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      void (async () => {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { LogicalSize } = await import("@tauri-apps/api/dpi");
        const w = getCurrentWindow();
        const width = (await w.innerSize()).toLogical(await w.scaleFactor()).width;
        await w.setSize(new LogicalSize(width, Math.min(760, Math.ceil(el.scrollHeight) + 2)));
      })().catch(() => undefined);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const commands = useMemo(
    () =>
      buildCommands({
        insertIntoWord: () => void apply(),
        copyLatex: () => void navigator.clipboard.writeText(useApp.getState().latex),
        focusLatex: () => undefined,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const app = useApp.getState();
  return (
    <div className="panel-app" ref={root}>
      <header className="panel-bar" data-tauri-drag-region>
        <span className="logo" aria-hidden data-tauri-drag-region>
          ∑
        </span>
        <span className="panel-name" data-tauri-drag-region>
          {info?.linked ? `Linked: ${info.linked}` : "MathBlocks"}
        </span>
        <div className="segmented" role="group" aria-label="Equation type">
          <button className={display && !numbered ? "active" : undefined} onClick={() => (app.setDisplay(true), app.setNumbered(false))}>
            Display
          </button>
          <button className={!display ? "active" : undefined} onClick={() => app.setDisplay(false)}>
            Inline
          </button>
          <button className={numbered ? "active" : undefined} onClick={() => app.setNumbered(true)}>
            Numbered
          </button>
        </div>
        <div className="spacer" data-tauri-drag-region />
        <button className="icon-btn" title="Word's own menu (cut, copy, paste…)" onClick={() => void send("panel:wordMenu").then(cancel)}>
          ☰
        </button>
        <button className="icon-btn" title="Open in the MathBlocks window (library, all tools)" onClick={() => void send("panel:openApp").then(cancel)}>
          ↗
        </button>
        <button className="icon-btn" title="Cancel (Esc)" onClick={cancel}>
          ✕
        </button>
      </header>

      <div className="panel-editor">
        <MathEditor />
      </div>

      <CommandLine commands={commands} />

      <Section id="preview" title={look === "classic" ? "Preview in Word" : "Preview"} defaultOpen>
        {look === "classic" ? <ClassicPreview latex={latex} display={display} sizePt={sizePt} /> : <MathPreview latex={latex} />}
      </Section>
      <Section id="symbols" title="Symbols and templates">
        <PaletteTop />
      </Section>
      <Section id="latex" title="LaTeX">
        <div className="panel-latex">
          <LatexEditor diagnostics={eq.diagnostics} />
        </div>
      </Section>
      <Section id="style" title="Style">
        <div className="form narrow">
          <label>
            Equations in Word
            <select value={look} onChange={(e) => app.setPrefs({ look: e.target.value as "classic" | "native" })}>
              <option value="classic">Classic: MathType look</option>
              <option value="native">Native Word equation</option>
            </select>
          </label>
        </div>
      </Section>

      <footer className="panel-foot-bar">
        <span className={eq.errors || toast?.kind === "error" ? "bad" : "muted"}>
          {toast ? toast.text : eq.errors ? `${eq.errors} error(s) in the LaTeX` : info?.linked ? "Enter updates every linked copy" : "Enter: apply in Word · Esc: cancel"}
        </span>
        <div className="spacer" />
        <button onClick={cancel}>Cancel</button>
        <button className="primary" onClick={() => void apply()} disabled={eq.errors > 0}>
          {info?.linked ? "Update everywhere" : "Apply"}
        </button>
      </footer>
    </div>
  );
}

const SECTIONS_KEY = "mathblocks.panel.sections";

function Section({ id, title, defaultOpen, children }: { id: string; title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? "{}") as Record<string, boolean>;
      return saved[id] ?? !!defaultOpen;
    } catch {
      return !!defaultOpen;
    }
  });
  const toggle = () => {
    setOpen(!open);
    try {
      const saved = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? "{}") as Record<string, boolean>;
      localStorage.setItem(SECTIONS_KEY, JSON.stringify({ ...saved, [id]: !open }));
    } catch {
      // Not remembered.
    }
  };
  return (
    <section className={open ? "panel-section open" : "panel-section"}>
      <button className="panel-section-head" onClick={toggle} aria-expanded={open}>
        <span className={open ? "chev open" : "chev"}>›</span> {title}
      </button>
      {open && <div className="panel-section-body">{children}</div>}
    </section>
  );
}

/** "/frac", "bold", "matrix 3"… with suggestions; Enter runs the first, arrows choose. */
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
  const run = (c: Command | undefined) => {
    if (!c) return;
    setQ("");
    void c.run();
    requestAnimationFrame(() => focusVisualEditor());
  };
  return (
    <div className="panel-command">
      <input
        value={q}
        placeholder="Type a command: /frac, /matrix, /bold, /numbered, /integral…"
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), setSel(Math.min(sel + 1, matches.length - 1)));
          else if (e.key === "ArrowUp") (e.preventDefault(), setSel(Math.max(sel - 1, 0)));
          else if (e.key === "Enter") (e.preventDefault(), run(matches[sel]));
          else if (e.key === "Escape") (e.preventDefault(), q ? setQ("") : focusVisualEditor());
        }}
        spellCheck={false}
      />
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
