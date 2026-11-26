import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SymbolListPage } from "./SymbolList";
import { useApp } from "../lib/store";
import { useSettings, type SettingsPage } from "../lib/settingsStore";
import { DEFAULT_FAVORITES } from "../lib/palette";
import { kindSnippetPrefix, PREFIX_CHARS, setKindSnippetPrefix } from "../lib/snippets";
import { ModalInline } from "./Dialogs";
import { BenchmarkPage } from "./Benchmark";
import { NumberingSettings, StylePanel } from "./BottomPanel";
import { AccentsDialog, useAccents } from "./AccentsDialog";
import { NotationSettings, useNotationSettings } from "./NotationSettings";
import { SnippetsDialog, useSnippets } from "./SnippetsDialog";
import { RecognitionDialog, useRecognition } from "./RecognitionDialog";
import { checkWordKeys, DEFAULT_WORD_KEYS, WORD_KEY_LABELS, type WordKeyName } from "../lib/wordKeys";
import { DocumentStyleDialog, openDocumentStyleHere, useDocumentStyle } from "./DocumentStyleDialog";

/**
 * Settings: every app setting in one window, grouped in a sidebar, with a search. The settings dialogs
 * that existed before are its pages (drawn inline); their old entry points open this window at their page.
 */

interface PageDef {
  id: SettingsPage;
  label: string;
  /** Words the search finds this page by (its settings' names). */
  keys: string;
  body: () => ReactNode;
  /** A settings dialog shown as this page: open it when the page shows; its own Close closes the settings. */
  dialog?: { isOpen: () => boolean; open: () => void; close: () => void; subscribe: (f: () => void) => () => void };
  /** Shown only with developer tools on (Advanced). */
  developer?: boolean;
  /** The section of the side list it is under. */
  group: SettingsGroup;
}

/** The side list's sections, in order: related settings together. */
const GROUPS = ["Appearance", "Notation", "Editing", "Word", "Backups and updates", "Developer tools"] as const;
type SettingsGroup = (typeof GROUPS)[number];
/** Pages merged into another one: an old link opens the page that holds them now. */
const ALIASES: Partial<Record<SettingsPage, SettingsPage>> = { updates: "backups" };

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <div>{children}</div>
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

function PalettePage() {
  const s = useApp();
  return (
    <section className="settings-embedded">
      <h3>Palette</h3>
      <Field label="Where the symbols are">
        <select value={s.paletteLocation} onChange={(e) => s.setPrefs({ paletteLocation: e.target.value as "right" | "top", rightOpen: true })}>
          <option value="right">Right-hand panel</option>
          <option value="top">Above the editor</option>
        </select>
      </Field>
      <Field label="Quick access" hint="Right-click a symbol to pin or unpin it; drag pinned symbols to reorder them.">
        <button onClick={() => s.setPrefs({ favorites: DEFAULT_FAVORITES })}>Reset to the default set</button>
      </Field>
      <Field label="Recent and search ranking" hint="Recent keeps the last 16 symbols; search ranks the ones you use most first.">
        <button onClick={() => s.setPrefs({ recents: [], paletteUse: {} })}>Clear Recent and the use counts</button>{" "}
        <button onClick={() => s.setPrefs({ paletteHints: [] })}>Show the “Faster: …” hints again</button>
      </Field>
    </section>
  );
}

function EditorPage() {
  const s = useApp();
  const [prefix, setPrefix] = useState(kindSnippetPrefix());
  return (
    <section className="settings-embedded">
      <h3>Editor</h3>
      <p className="hint">Space moves to the next slot (numerator → denominator → out, lower limit → upper limit → body, cell by cell); Shift+Space goes back. Backspace deletes one character; a structure or kind is selected first and deleted by a second Backspace.</p>
      <Field label="Space Space opens the command palette" hint="Only when the caret is outside every structure. Ctrl+K always opens it.">
        <label className="check">
          <input type="checkbox" checked={s.doubleSpace} onChange={(e) => s.setPrefs({ doubleSpace: e.target.checked })} /> on
        </label>{" "}
        within{" "}
        <input type="number" min={150} max={800} step={25} value={s.doubleSpaceMs} disabled={!s.doubleSpace} onChange={(e) => s.setPrefs({ doubleSpaceMs: Math.max(150, Math.min(800, Number(e.target.value) || 300)) })} /> ms
      </Field>
      <Field label="Style bar over a selection" hint="The small floating bar over a selection or a notation kind (bold, italic/upright, accents, Make → kind, Plain, Style…). Off, the same actions are in the right-click menu.">
        <label className="check">
          <input type="checkbox" checked={s.quickStyleBar} onChange={(e) => s.setPrefs({ quickStyleBar: e.target.checked })} /> on
        </label>
      </Field>
      <Field label="Suggestions from the document" hint="After a letter, the forms of that symbol the open document already uses (w → the ω forms), most used first; Tab takes the first.">
        <label className="check">
          <input type="checkbox" checked={s.docSuggestions} onChange={(e) => s.setPrefs({ docSuggestions: e.target.checked })} /> on
        </label>
      </Field>
      <Field label="Prefix of notation-kind snippets" hint="Type the prefix and the kind's short name, then Tab (;pv Tab → physical vector).">
        <select
          value={prefix}
          onChange={(e) => {
            setKindSnippetPrefix(e.target.value);
            setPrefix(e.target.value);
          }}
        >
          {[...PREFIX_CHARS, ""].map((c) => (
            <option key={c || "none"} value={c}>
              {c ? `${c} (e.g. ${c}pv)` : "none (pv)"}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Editor zoom">
        <input type="range" min={0.6} max={2.4} step={0.1} value={s.zoom} onChange={(e) => s.setPrefs({ zoom: Number(e.target.value) })} /> {Math.round(s.zoom * 100)} %
      </Field>
      <Field label="Keyboard shortcuts and LaTeX commands">
        <button onClick={() => void import("./ShortcutsDialog").then((m) => m.openShortcuts())}>Show the sheet (F1)</button>
      </Field>
    </section>
  );
}

function ConnectionPage() {
  const s = useApp();
  return (
    <section className="settings-embedded">
      <h3>Word connection and add-in</h3>
      <Field label="Status">{s.connector.connected ? `Connected to Word${s.connector.hostVersion ? ` (add-in ${s.connector.hostVersion})` : ""}` : s.connector.available ? "Not connected: start Word (the MathBlocks add-in connects by itself)" : "Browser preview: no Word here"}</Field>
      <Field label="Ask before whole-document commands" hint="Convert, Repair, Apply style… show what they will do first.">
        <label className="check">
          <input type="checkbox" checked={s.confirmWordCommands} onChange={(e) => s.setPrefs({ confirmWordCommands: e.target.checked })} /> ask first
        </label>
      </Field>
    </section>
  );
}

/** Advanced → Developer tools: the tests and measurements for diagnosing a problem; off by default. */
function AdvancedPage() {
  const s = useApp();
  const run = (f: () => Promise<unknown>) => void f();
  return (
    <section className="settings-embedded">
      <h3>Advanced</h3>
      <Field label="Developer tools" hint="Tests and measurements for diagnosing a problem: the Word self-test, soak test, large-document test and benchmark (also in Ctrl+K and on the ribbon). Off, the add-in refuses their test requests.">
        <label className="check">
          <input type="checkbox" checked={s.developerTools} onChange={(e) => s.setPrefs({ developerTools: e.target.checked })} /> show developer tools
        </label>
      </Field>
      {s.developerTools && (
        <Field label="Word self-test" hint="Checks every MathBlocks operation in Word on test documents (your documents are not touched).">
          <button disabled={!s.connector.connected} onClick={() => run(() => import("../lib/selfTest").then((m) => m.runWordSelfTest()))}>Run the Word self-test (core, ~12 min)</button>{" "}
          <button disabled={!s.connector.connected} onClick={() => run(() => import("../lib/selfTest").then((m) => m.runWordSelfTest({ full: true })))}>Full self-test (~30 min)</button>{" "}
          <button disabled={!s.connector.connected} onClick={() => run(() => import("../lib/soakTest").then((m) => m.soakTestCommand()))}>Soak test…</button>{" "}
          <button disabled={!s.connector.connected} onClick={() => run(() => import("../lib/thesisTest").then((m) => m.thesisTestCommand()))}>Large-document test…</button>
        </Field>
      )}
      {s.developerTools && (
        <Field label="Large operators" hint="∫ ∬ ∮ ∑ ∏ in Latin Modern Math, STIX Two Math, XITS Math and the current font, inline and in display; choose one for the document style.">
          <button onClick={() => run(() => import("./LargeOperatorsSheet").then((m) => m.openLargeOperatorsSheet()))}>Compare the fonts…</button>
        </Field>
      )}
    </section>
  );
}

/**
 * Word shortcuts: Ctrl+Alt + a key under the right hand for the most frequent commands (lib/wordKeys.ts). Every
 * other command has a key tip on the MathBlocks tab (Alt, K, then its letter). The self-test lists Word's own
 * assignments on this PC and reports a clash.
 */
function WordKeysPage() {
  const s = useApp();
  const keys = { ...DEFAULT_WORD_KEYS, ...s.wordKeys };
  const set = (name: WordKeyName, v: string) => s.setPrefs({ wordKeys: { ...keys, [name]: v } });
  return (
    <section className="settings-embedded">
      <h3>Word shortcuts</h3>
      <p className="hint">Ctrl+Alt and a key under the right hand. Not with Shift (Alt+Shift and Ctrl+Shift switch the input language), no function keys. Empty switches one off. Other commands: Alt, Q, then the letter shown on the MathBlocks tab.</p>
      {(Object.keys(WORD_KEY_LABELS) as WordKeyName[]).map((name) => {
        const problem = checkWordKeys(keys[name] ?? "");
        const twin = (Object.keys(keys) as WordKeyName[]).find((o) => o !== name && keys[o] && keys[o]!.toLowerCase() === (keys[name] ?? "").toLowerCase());
        return (
          <Field key={name} label={WORD_KEY_LABELS[name]} hint={problem ?? (twin ? `Also used for: ${WORD_KEY_LABELS[twin]}` : undefined)}>
            <input type="text" value={keys[name] ?? ""} spellCheck={false} style={{ width: "10em" }} aria-invalid={!!problem || !!twin} onChange={(e) => set(name, e.target.value)} />
          </Field>
        );
      })}
      <Field label="">
        <button onClick={() => s.setPrefs({ wordKeys: { ...DEFAULT_WORD_KEYS } })}>Reset to the default set</button>
      </Field>
    </section>
  );
}

function BackupsPage() {
  const s = useApp();
  return (
    <section className="settings-embedded">
      <h3>Backups</h3>
      <p className="hint">Before every whole-document change (Convert, Repair, Apply style, Convert numbering…) the add-in saves a copy of the document; copies older than the retention period are removed automatically.</p>
      <button
        onClick={async () => {
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke<string>("backups_open");
          } catch (e) {
            s.notify(`Could not open the backups folder: ${e instanceof Error ? e.message : String(e)}`, "error");
          }
        }}
      >
        Open the backups folder
      </button>
    </section>
  );
}

function UpdatesPage() {
  const u = useApp((s) => s.update);
  const channel = useApp((s) => s.updateChannel);
  const setPrefs = useApp((s) => s.setPrefs);
  return (
    <section className="settings-embedded">
      <h3>Updates</h3>
      <Field label="This version">{u.currentVersion ?? "—"}</Field>
      <Field label="Channel" hint="Stable: only builds that passed the self-test on your PC (promoted by hand after a clean report). Test: every new build, as soon as it is built — the status bar says “test build”.">
        <label className="check">
          <input type="radio" checked={channel === "stable"} onChange={() => setPrefs({ updateChannel: "stable" })} /> Stable (recommended)
        </label>{" "}
        <label className="check">
          <input type="radio" checked={channel === "test"} onChange={() => setPrefs({ updateChannel: "test" })} /> Test
        </label>
      </Field>
      <Field label="Updates" hint="MathBlocks checks its channel at start and every 2 hours; an update downloads in the background and installs on restart.">
        <button onClick={() => void import("../lib/updates").then((m) => m.checkForUpdate(true))}>Check now</button> <span className="hint">{u.status === "ready" ? `${u.newVersion} is ready: restart to install` : u.status === "downloading" ? `downloading ${u.newVersion}…` : ""}</span>
      </Field>
      <Field label="Roll back" hint="Installs the stable build before the current stable one (asks first).">
        <button onClick={() => void import("../lib/updates").then((m) => m.rollbackToPreviousStable())}>Roll back to the previous stable build</button>
      </Field>
    </section>
  );
}

const PAGES: PageDef[] = [
  { id: "word", label: "Equation look", group: "Appearance", keys: "classic native look picture size points font vector rotation notation convention preview profile math font", body: () => <section className="settings-embedded"><h3>Equation look</h3><StylePanel /></section> },
  {
    id: "docstyle",
    label: "Document style",
    group: "Appearance",
    keys: "document style italic upright labels counters roman numerals greek constants differential transpose bold presets classify check",
    body: () => <DocumentStyleDialog />,
    dialog: { isOpen: () => useDocumentStyle.getState().open, open: () => void openDocumentStyleHere(), close: () => useDocumentStyle.getState().set({ open: false }), subscribe: (f) => useDocumentStyle.subscribe(f) },
  },
  { id: "kinds", label: "Notation kinds", group: "Notation", keys: "kinds vector dyadic frame dcm matrix unit vector my notation new kind style", body: () => <NotationSettings />, dialog: { isOpen: () => useNotationSettings.getState().open, open: () => useNotationSettings.getState().set(true, useNotationSettings.getState().kind), close: () => useNotationSettings.getState().set(false), subscribe: (f) => useNotationSettings.subscribe(f) } },
  { id: "accents", label: "Accents", group: "Appearance", keys: "accent harpoon arrow hat bar dot size stroke gap barb", body: () => <AccentsDialog />, dialog: { isOpen: () => useAccents.getState().open, open: () => useAccents.getState().set(true), close: () => useAccents.getState().set(false), subscribe: (f) => useAccents.subscribe(f) } },
  { id: "numbering", label: "Numbering", group: "Notation", keys: "number numbering chapter section brackets parentheses separator restart references markers", body: () => <section className="settings-embedded"><h3>Numbering</h3><NumberingSettings /></section> },
  { id: "snippets", label: "Snippets", group: "Editing", keys: "snippets triggers tab shortcuts keys", body: () => <SnippetsDialog />, dialog: { isOpen: () => useSnippets.getState().open, open: () => useSnippets.getState().set(true), close: () => useSnippets.getState().set(false), subscribe: (f) => useSnippets.subscribe(f) } },
  { id: "palette", label: "Symbol palette", group: "Editing", keys: "palette symbols favourites quick access recent location top right", body: () => <PalettePage /> },
  { id: "editor", label: "Editor", group: "Editing", keys: "editor space slot backspace double space command palette prefix zoom suggestions document forms autocomplete style bar floating toolbar context menu quick style", body: () => <EditorPage /> },
  { id: "connection", label: "Add-in connection", group: "Word", keys: "word add-in connection confirm self-test", body: () => <ConnectionPage /> },
  { id: "wordKeys", label: "Word shortcuts", group: "Word", keys: "word shortcuts keyboard keys ctrl alt inline display toggle latex reference number edit", body: () => <WordKeysPage /> },
  { id: "backups", label: "Backups and updates", group: "Backups and updates", keys: "backup copy restore folder update version roll back", body: () => (<><BackupsPage /><UpdatesPage /></>) },
  { id: "symbollist", label: "List of symbols", group: "Notation", keys: "symbols nomenclature list define table sort groups columns", body: () => <SymbolListPage /> },
  { id: "benchmark", label: "Benchmark", group: "Developer tools", keys: "benchmark speed timing keystrokes mathtype comparison", body: () => <BenchmarkPage />, developer: true },
  { id: "advanced", label: "Self-tests and diagnostics", group: "Developer tools", keys: "advanced developer tools self-test soak large document thesis-size test benchmark diagnose", body: () => <AdvancedPage /> },
  { id: "recognition", label: "Screenshot to LaTeX", group: "Editing", keys: "screenshot picture recognition api key ocr image", body: () => <RecognitionDialog />, dialog: { isOpen: () => useRecognition.getState().open, open: () => useRecognition.getState().set({ open: true }), close: () => useRecognition.getState().set({ open: false }), subscribe: (f) => useRecognition.subscribe(f) } },
];

const SIZE_KEY = "mathblocks.settings.size";

export function SettingsDialog() {
  const { open, page, set } = useSettings();
  const [query, setQuery] = useState("");
  const developer = useApp((s) => s.developerTools);
  // Each page is one of the six groups; its sections are the settings that belong together.
  const sections = PAGES.filter((p) => !p.developer || developer).sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group));
  const wanted = ALIASES[page] ?? page;
  const def = sections.find((p) => p.id === wanted) ?? sections[0]!;
  const group = def.group;
  const inGroup = sections.filter((p) => p.group === group);
  // Closing the settings closes every section's dialog state too (none is left to show on its own later).
  const close = () => {
    for (const p of PAGES) if (p.dialog?.isOpen()) p.dialog.close();
    set({ open: false });
  };
  // The page's dialog sections: opened when the page shows; when one's own Close is pressed, the settings close.
  useEffect(() => {
    if (!open) return;
    const offs: (() => void)[] = [];
    for (const p of inGroup) {
      const d = p.dialog;
      if (!d) continue;
      let shown = false;
      if (!d.isOpen()) d.open();
      if (d.isOpen()) shown = true;
      offs.push(
        d.subscribe(() => {
          if (d.isOpen()) shown = true;
          else if (shown) close();
        }),
      );
    }
    return () => offs.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group, developer]);
  // A link to one section (search, an old page name): its page opens scrolled to it.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // Next frame, and again once the sections above it have filled in (a dialog section draws after it opens).
    const go = () => {
      const el = bodyRef.current?.querySelector(`#settings-sec-${def.id}`) as HTMLElement | null;
      if (!el) return;
      if (def.id === inGroup[0]?.id) bodyRef.current!.scrollTop = 0;
      else el.scrollIntoView({ block: "start" });
    };
    requestAnimationFrame(go);
    const t = setTimeout(go, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // Most of the app window by default; resizable from its corner; the size is remembered.
  const winRef = useRef<HTMLDivElement>(null);
  const savedSize = useMemo(() => {
    try {
      const v = JSON.parse(localStorage.getItem(SIZE_KEY) ?? "null") as { w: number; h: number } | null;
      return v && v.w > 300 && v.h > 200 ? { width: v.w, height: v.h } : undefined;
    } catch {
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    const el = winRef.current;
    if (!open || !el || typeof ResizeObserver === "undefined") return;
    let first = true;
    const ro = new ResizeObserver(() => {
      // The first report is the initial size, not the user's.
      if (first) return void (first = false);
      try {
        localStorage.setItem(SIZE_KEY, JSON.stringify({ w: Math.round(el.offsetWidth), h: Math.round(el.offsetHeight) }));
      } catch {
        // Not remembered.
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return sections.filter((p) => q.split(/\s+/).every((w) => `${p.group} ${p.label} ${p.keys}`.toLowerCase().includes(w)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, developer]);
  const groups = GROUPS.filter((g) => sections.some((p) => p.group === g));
  if (!open) return null;
  return (
    <div className="modal-backdrop settings-backdrop" onMouseDown={close}>
      <div className="settings-window" ref={winRef} style={savedSize} role="dialog" aria-modal="true" aria-label="Settings" onMouseDown={(e) => e.stopPropagation()}>
        <nav className="settings-side">
          <input className="settings-search" type="search" placeholder="Search settings…" value={query} autoFocus onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && matches[0] && (set({ page: matches[0].id }), setQuery(""))} />
          {query.trim()
            ? matches.map((p) => (
                <button key={p.id} className="settings-result" onClick={() => (set({ page: p.id }), setQuery(""))}>
                  <span className="muted">{p.group} › </span>
                  {p.label}
                </button>
              ))
            : groups.map((g) => (
                <button key={g} className={g === group ? "on" : undefined} onClick={() => set({ page: sections.find((p) => p.group === g)!.id })}>
                  {g}
                </button>
              ))}
          {query.trim() && !matches.length && <p className="hint">No setting matches “{query}”.</p>}
        </nav>
        <div className="settings-main">
          <div className="settings-head">
            <h2>Settings</h2>
            <div className="spacer" />
            <button className="icon-btn" title="Close (Esc)" onClick={close}>
              ✕
            </button>
          </div>
          <div className="settings-body" ref={bodyRef}>
            <h2 className="settings-page-title">{group}</h2>
            {inGroup.length > 1 && (
              <div className="settings-toc" role="navigation" aria-label={`${group}: sections`}>
                {inGroup.map((p) => (
                  <button key={p.id} className="chip" onClick={() => set({ page: p.id })}>
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            <ModalInline.Provider value={true}>
              {inGroup.map((p) => (
                <div key={p.id} id={`settings-sec-${p.id}`} className="settings-section">
                  {p.body()}
                </div>
              ))}
            </ModalInline.Provider>
          </div>
        </div>
      </div>
    </div>
  );
}
