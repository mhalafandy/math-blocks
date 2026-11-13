import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApp } from "../lib/store";
import { useSettings, type SettingsPage } from "../lib/settingsStore";
import { DEFAULT_FAVORITES } from "../lib/palette";
import { kindSnippetPrefix, PREFIX_CHARS, setKindSnippetPrefix } from "../lib/snippets";
import { ModalInline } from "./Dialogs";
import { NumberingSettings, StylePanel } from "./BottomPanel";
import { AccentsDialog, useAccents } from "./AccentsDialog";
import { NotationSettings, useNotationSettings } from "./NotationSettings";
import { SnippetsDialog, useSnippets } from "./SnippetsDialog";
import { RecognitionDialog, useRecognition } from "./RecognitionDialog";
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
  dialog?: { isOpen: () => boolean; open: () => void; subscribe: (f: () => void) => () => void };
}

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
          <option value="top">Above the editor (MathType style)</option>
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
      <h3>Editor behaviour</h3>
      <p className="hint">Space moves to the next slot (numerator → denominator → out, lower limit → upper limit → body, cell by cell); Shift+Space goes back. Backspace deletes one character; a structure or kind is selected first and deleted by a second Backspace.</p>
      <Field label="Space Space opens the command palette" hint="Only when the caret is outside every structure. Ctrl+K always opens it.">
        <label className="check">
          <input type="checkbox" checked={s.doubleSpace} onChange={(e) => s.setPrefs({ doubleSpace: e.target.checked })} /> on
        </label>{" "}
        within{" "}
        <input type="number" min={150} max={800} step={25} value={s.doubleSpaceMs} disabled={!s.doubleSpace} onChange={(e) => s.setPrefs({ doubleSpaceMs: Math.max(150, Math.min(800, Number(e.target.value) || 300)) })} /> ms
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
      <Field label="Word self-test" hint="Checks every MathBlocks operation in Word on test documents (your documents are not touched).">
        <button disabled={!s.connector.connected} onClick={() => void import("../lib/selfTest").then((m) => m.runWordSelfTest())}>Run the Word self-test</button>
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
  return (
    <section className="settings-embedded">
      <h3>Updates</h3>
      <Field label="This version">{u.currentVersion ?? "—"}</Field>
      <Field label="Updates" hint="MathBlocks checks at start; an update downloads in the background and installs on restart.">
        <button onClick={() => void import("../lib/updates").then((m) => m.checkForUpdate(true))}>Check now</button> <span className="hint">{u.status === "ready" ? `${u.newVersion} is ready: restart to install` : u.status === "downloading" ? `downloading ${u.newVersion}…` : ""}</span>
      </Field>
    </section>
  );
}

const PAGES: PageDef[] = [
  { id: "word", label: "Word style", keys: "classic native look size points font vector spacecraft convention preview profile math font", body: () => <section className="settings-embedded"><h3>Word style</h3><StylePanel /></section> },
  {
    id: "docstyle",
    label: "Document style",
    keys: "document style italic upright labels counters roman numerals greek constants differential transpose bold presets classify check",
    body: () => <DocumentStyleDialog />,
    dialog: { isOpen: () => useDocumentStyle.getState().open, open: () => void openDocumentStyleHere(), subscribe: (f) => useDocumentStyle.subscribe(f) },
  },
  { id: "kinds", label: "Notation kinds", keys: "kinds vector dyadic frame dcm matrix unit vector my notation new kind style", body: () => <NotationSettings />, dialog: { isOpen: () => useNotationSettings.getState().open, open: () => useNotationSettings.getState().set(true, null), subscribe: (f) => useNotationSettings.subscribe(f) } },
  { id: "accents", label: "Accents", keys: "accent harpoon arrow hat bar dot size stroke gap barb", body: () => <AccentsDialog />, dialog: { isOpen: () => useAccents.getState().open, open: () => useAccents.getState().set(true), subscribe: (f) => useAccents.subscribe(f) } },
  { id: "numbering", label: "Numbering", keys: "number numbering chapter section brackets parentheses separator restart references markers", body: () => <section className="settings-embedded"><h3>Numbering</h3><NumberingSettings /></section> },
  { id: "snippets", label: "Snippets and shortcuts", keys: "snippets triggers tab shortcuts keys", body: () => <SnippetsDialog />, dialog: { isOpen: () => useSnippets.getState().open, open: () => useSnippets.getState().set(true), subscribe: (f) => useSnippets.subscribe(f) } },
  { id: "palette", label: "Palette", keys: "palette symbols favourites quick access recent location top right", body: () => <PalettePage /> },
  { id: "editor", label: "Editor behaviour", keys: "editor space slot backspace double space command palette prefix zoom", body: () => <EditorPage /> },
  { id: "connection", label: "Word connection and add-in", keys: "word add-in connection confirm self-test", body: () => <ConnectionPage /> },
  { id: "backups", label: "Backups", keys: "backup copy restore folder", body: () => <BackupsPage /> },
  { id: "updates", label: "Updates", keys: "update version", body: () => <UpdatesPage /> },
  { id: "recognition", label: "Screenshot to LaTeX", keys: "screenshot picture recognition api key ocr image", body: () => <RecognitionDialog />, dialog: { isOpen: () => useRecognition.getState().open, open: () => useRecognition.getState().set({ open: true }), subscribe: (f) => useRecognition.subscribe(f) } },
];

export function SettingsDialog() {
  const { open, page, set } = useSettings();
  const [query, setQuery] = useState("");
  const def = PAGES.find((p) => p.id === page) ?? PAGES[0]!;
  const close = () => set({ open: false });
  // A dialog page: open it when it shows; when its own Close is pressed, the settings close.
  const shown = useRef(false);
  useEffect(() => {
    if (!open || !def.dialog) return;
    shown.current = false;
    if (!def.dialog.isOpen()) def.dialog.open();
    const off = def.dialog.subscribe(() => {
      if (def.dialog!.isOpen()) shown.current = true;
      else if (shown.current) set({ open: false });
    });
    if (def.dialog.isOpen()) shown.current = true;
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PAGES;
    return PAGES.filter((p) => q.split(/\s+/).every((w) => `${p.label} ${p.keys}`.toLowerCase().includes(w)));
  }, [query]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="settings-window" role="dialog" aria-modal="true" aria-label="Settings" onMouseDown={(e) => e.stopPropagation()}>
        <nav className="settings-side">
          <input className="settings-search" type="search" placeholder="Search settings…" value={query} autoFocus onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && matches[0] && set({ page: matches[0].id })} />
          {matches.map((p) => (
            <button key={p.id} className={p.id === def.id ? "on" : undefined} onClick={() => set({ page: p.id })}>
              {p.label}
            </button>
          ))}
          {!matches.length && <p className="hint">No setting matches “{query}”.</p>}
        </nav>
        <div className="settings-main">
          <div className="settings-head">
            <h2>Settings</h2>
            <div className="spacer" />
            <button className="icon-btn" title="Close (Esc)" onClick={close}>
              ✕
            </button>
          </div>
          <div className="settings-body">
            <ModalInline.Provider value={true}>{def.body()}</ModalInline.Provider>
          </div>
        </div>
      </div>
    </div>
  );
}
